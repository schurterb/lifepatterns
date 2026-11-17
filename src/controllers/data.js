/**
 * Data Controller
 * Handles environmental data caching (weather, geomagnetic)
 */

/**
 * DataController handles environmental data endpoints
 */
export class DataController {
    /**
     * @param {D1Database} db - D1 database instance
     * @param {KVNamespace} kv - KV namespace for caching
     */
    constructor(db, kv) {
        this.db = db;
        this.kv = kv;
    }

    /**
     * Get cached weather data
     * GET /data/weather?lat=XX.XX&lon=XX.XX
     */
    async getWeather(request) {
        try {
            const url = new URL(request.url);
            const lat = parseFloat(url.searchParams.get('lat'));
            const lon = parseFloat(url.searchParams.get('lon'));

            if (isNaN(lat) || isNaN(lon)) {
                return this.error('Invalid latitude or longitude', 400);
            }

            // Round to 2 decimal places for caching (~1km precision)
            const cacheLat = Math.round(lat * 100) / 100;
            const cacheLon = Math.round(lon * 100) / 100;

            // Check cache first
            const cacheKey = `weather:${cacheLat}:${cacheLon}`;
            const cached = await this.getFromCache(cacheKey);

            if (cached) {
                return this.json({
                    success: true,
                    data: cached,
                    cached: true
                });
            }

            // Check D1 for recent data
            const recent = await this.db.prepare(
                `SELECT * FROM weather_cache 
                 WHERE latitude = ? AND longitude = ? AND expires_at > ?
                 ORDER BY fetched_at DESC LIMIT 1`
            ).bind(cacheLat, cacheLon, new Date().toISOString()).first();

            if (recent) {
                const data = {
                    temperature: recent.temperature,
                    humidity: recent.humidity,
                    pressure: recent.pressure,
                    conditions: recent.conditions,
                    fetchedAt: recent.fetched_at
                };

                // Store in KV for faster access
                await this.setCache(cacheKey, data, 3600);

                return this.json({
                    success: true,
                    data,
                    cached: true
                });
            }

            // Fetch from Open-Meteo API
            const weatherData = await this.fetchWeatherFromAPI(cacheLat, cacheLon);

            if (!weatherData) {
                return this.error('Failed to fetch weather data', 502);
            }

            // Store in D1
            const id = crypto.randomUUID();
            const now = new Date();
            const expiresAt = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour

            await this.db.prepare(
                `INSERT INTO weather_cache (id, latitude, longitude, temperature, humidity, pressure, conditions, fetched_at, expires_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).bind(
                id, cacheLat, cacheLon,
                weatherData.temperature,
                weatherData.humidity,
                weatherData.pressure,
                weatherData.conditions,
                now.toISOString(),
                expiresAt.toISOString()
            ).run();

            // Store in KV
            await this.setCache(cacheKey, weatherData, 3600);

            return this.json({
                success: true,
                data: weatherData,
                cached: false
            });

        } catch (error) {
            console.error('Weather fetch error:', error);
            return this.error('Failed to get weather data', 500);
        }
    }

    /**
     * Get cached geomagnetic data
     * GET /data/geomagnetic
     */
    async getGeomagnetic(request) {
        try {
            // Check cache first
            const cacheKey = 'geomagnetic:current';
            const cached = await this.getFromCache(cacheKey);

            if (cached) {
                return this.json({
                    success: true,
                    data: cached,
                    cached: true
                });
            }

            // Check D1 for recent data
            const recent = await this.db.prepare(
                `SELECT * FROM geomagnetic_cache 
                 WHERE expires_at > ?
                 ORDER BY fetched_at DESC LIMIT 1`
            ).bind(new Date().toISOString()).first();

            if (recent) {
                const data = {
                    kpIndex: recent.kp_index,
                    stormLevel: recent.storm_level,
                    fetchedAt: recent.fetched_at
                };

                await this.setCache(cacheKey, data, 1800); // 30 min

                return this.json({
                    success: true,
                    data,
                    cached: true
                });
            }

            // Fetch from NOAA API
            const geoData = await this.fetchGeomagneticFromAPI();

            if (!geoData) {
                return this.error('Failed to fetch geomagnetic data', 502);
            }

            // Store in D1
            const id = crypto.randomUUID();
            const now = new Date();
            const expiresAt = new Date(now.getTime() + 30 * 60 * 1000); // 30 min

            await this.db.prepare(
                `INSERT INTO geomagnetic_cache (id, kp_index, storm_level, fetched_at, expires_at)
                 VALUES (?, ?, ?, ?, ?)`
            ).bind(
                id,
                geoData.kpIndex,
                geoData.stormLevel,
                now.toISOString(),
                expiresAt.toISOString()
            ).run();

            await this.setCache(cacheKey, geoData, 1800);

            return this.json({
                success: true,
                data: geoData,
                cached: false
            });

        } catch (error) {
            console.error('Geomagnetic fetch error:', error);
            return this.error('Failed to get geomagnetic data', 500);
        }
    }

    /**
     * Fetch weather from Open-Meteo API
     */
    async fetchWeatherFromAPI(lat, lon) {
        try {
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,pressure_msl,weather_code`;

            const response = await fetch(url);
            if (!response.ok) {
                return null;
            }

            const data = await response.json();
            const current = data.current;

            return {
                temperature: current.temperature_2m,
                humidity: current.relative_humidity_2m,
                pressure: current.pressure_msl,
                conditions: this.weatherCodeToCondition(current.weather_code),
                fetchedAt: new Date().toISOString()
            };
        } catch (error) {
            console.error('Open-Meteo API error:', error);
            return null;
        }
    }

    /**
     * Fetch geomagnetic data from NOAA
     */
    async fetchGeomagneticFromAPI() {
        try {
            // NOAA Space Weather Prediction Center
            const url = 'https://services.swpc.noaa.gov/json/geospace/geospace-forecast.json';

            const response = await fetch(url);
            if (!response.ok) {
                // Fallback to estimated Kp
                return {
                    kpIndex: 2.0,
                    stormLevel: 'none',
                    fetchedAt: new Date().toISOString()
                };
            }

            const data = await response.json();

            // Extract current Kp index
            const kpIndex = data[0]?.kp_index || 2.0;
            const stormLevel = this.kpToStormLevel(kpIndex);

            return {
                kpIndex,
                stormLevel,
                fetchedAt: new Date().toISOString()
            };
        } catch (error) {
            console.error('NOAA API error:', error);
            return {
                kpIndex: 2.0,
                stormLevel: 'none',
                fetchedAt: new Date().toISOString()
            };
        }
    }

    /**
     * Get data from KV cache
     */
    async getFromCache(key) {
        if (!this.kv) return null;
        const data = await this.kv.get(key, 'json');
        return data;
    }

    /**
     * Set data in KV cache
     */
    async setCache(key, data, ttlSeconds) {
        if (!this.kv) return;
        await this.kv.put(key, JSON.stringify(data), {
            expirationTtl: ttlSeconds
        });
    }

    /**
     * Convert weather code to condition string
     */
    weatherCodeToCondition(code) {
        const conditions = {
            0: 'clear',
            1: 'mainly_clear',
            2: 'partly_cloudy',
            3: 'overcast',
            45: 'foggy',
            48: 'rime_fog',
            51: 'light_drizzle',
            53: 'moderate_drizzle',
            55: 'dense_drizzle',
            61: 'slight_rain',
            63: 'moderate_rain',
            65: 'heavy_rain',
            71: 'slight_snow',
            73: 'moderate_snow',
            75: 'heavy_snow',
            80: 'slight_rain_showers',
            81: 'moderate_rain_showers',
            82: 'violent_rain_showers',
            95: 'thunderstorm',
            96: 'thunderstorm_with_hail',
            99: 'thunderstorm_with_heavy_hail'
        };
        return conditions[code] || 'unknown';
    }

    /**
     * Convert Kp index to storm level
     */
    kpToStormLevel(kp) {
        if (kp >= 9) return 'extreme';
        if (kp >= 8) return 'severe';
        if (kp >= 7) return 'strong';
        if (kp >= 5) return 'moderate';
        if (kp >= 4) return 'minor';
        return 'none';
    }

    /**
     * Create JSON response
     */
    json(data, status = 200) {
        return new Response(JSON.stringify(data), {
            status,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    /**
     * Create error response
     */
    error(message, status = 400) {
        return this.json({ success: false, error: message }, status);
    }
}
