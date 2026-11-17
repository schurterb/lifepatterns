'use strict';

const WeatherService = {
    CACHE_KEY: 'weatherCache',
    CACHE_DURATION_MS: 60 * 60 * 1000,
    API_URL: 'https://api.open-meteo.com/v1/forecast',
    ARCHIVE_API_URL: 'https://archive-api.open-meteo.com/v1/archive',
    RATE_LIMIT_MS: 6000,
    lastRequestTime: 0,

    async fetchWeather(latitude, longitude, date = new Date()) {
        const cacheKey = `${latitude},${longitude},${date.toISOString().split('T')[0]}`;
        const cached = this.getFromCache(cacheKey);
        
        if (cached) {
            return cached;
        }

        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < this.RATE_LIMIT_MS) {
            await new Promise(resolve => setTimeout(resolve, this.RATE_LIMIT_MS - timeSinceLastRequest));
        }

        try {
            const dateStr = date.toISOString().split('T')[0];
            const url = `${this.API_URL}?latitude=${latitude}&longitude=${longitude}&start_date=${dateStr}&end_date=${dateStr}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,uv_index_max,surface_pressure_max&timezone=auto`;
            
            this.lastRequestTime = Date.now();
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`Weather API error: ${response.status}`);
            }

            const data = await response.json();
            const weatherData = {
                date: dateStr,
                tempMax: data.daily?.temperature_2m_max?.[0] ?? null,
                tempMin: data.daily?.temperature_2m_min?.[0] ?? null,
                pressure: data.daily?.surface_pressure_max?.[0] ?? null,
                precipitation: data.daily?.precipitation_sum?.[0] ?? null,
                uvIndex: data.daily?.uv_index_max?.[0] ?? null,
                fetchedAt: new Date().toISOString(),
            };

            this.saveToCache(cacheKey, weatherData);
            return weatherData;
        } catch (error) {
            console.error('Weather fetch error:', error);
            return null;
        }
    },

    async fetchHistoricalWeather(latitude, longitude, dates) {
        if (!dates || dates.length === 0) return [];

        const results = [];
        const sortedDates = [...dates].sort();
        
        // Group consecutive dates into batches for efficient API calls
        const batches = this.groupConsecutiveDates(sortedDates);
        
        for (const batch of batches) {
            const startDate = batch[0];
            const endDate = batch[batch.length - 1];
            
            // Determine which API to use based on date age
            const daysSinceStart = Math.floor((Date.now() - new Date(startDate).getTime()) / (24 * 60 * 60 * 1000));
            const useArchive = daysSinceStart > 90;
            
            try {
                const batchResults = await this.fetchDateRange(latitude, longitude, startDate, endDate, useArchive);
                results.push(...batchResults);
            } catch (error) {
                console.error(`Error fetching weather for ${startDate} to ${endDate}:`, error);
            }
            
            // Rate limiting between batches
            await new Promise(resolve => setTimeout(resolve, this.RATE_LIMIT_MS));
        }
        
        return results;
    },

    async fetchDateRange(latitude, longitude, startDate, endDate, useArchive = false) {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < this.RATE_LIMIT_MS) {
            await new Promise(resolve => setTimeout(resolve, this.RATE_LIMIT_MS - timeSinceLastRequest));
        }

        try {
            const baseUrl = useArchive ? this.ARCHIVE_API_URL : this.API_URL;
            const url = `${baseUrl}?latitude=${latitude}&longitude=${longitude}&start_date=${startDate}&end_date=${endDate}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,uv_index_max,surface_pressure_max&timezone=auto`;
            
            this.lastRequestTime = Date.now();
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`Weather API error: ${response.status}`);
            }

            const data = await response.json();
            const results = [];
            
            if (data.daily && data.daily.time) {
                for (let i = 0; i < data.daily.time.length; i++) {
                    results.push({
                        date: data.daily.time[i],
                        tempMax: data.daily.temperature_2m_max?.[i] ?? null,
                        tempMin: data.daily.temperature_2m_min?.[i] ?? null,
                        pressure: data.daily.surface_pressure_max?.[i] ?? null,
                        precipitation: data.daily.precipitation_sum?.[i] ?? null,
                        uvIndex: data.daily.uv_index_max?.[i] ?? null,
                        fetchedAt: new Date().toISOString(),
                    });
                }
            }
            
            return results;
        } catch (error) {
            console.error('Weather date range fetch error:', error);
            return [];
        }
    },

    groupConsecutiveDates(dates) {
        if (dates.length === 0) return [];
        
        const batches = [];
        let currentBatch = [dates[0]];
        
        for (let i = 1; i < dates.length; i++) {
            const prevDate = new Date(dates[i - 1]);
            const currDate = new Date(dates[i]);
            const diffDays = (currDate - prevDate) / (24 * 60 * 60 * 1000);
            
            // If consecutive (within 1 day) and batch not too large, add to current batch
            if (diffDays === 1 && currentBatch.length < 30) {
                currentBatch.push(dates[i]);
            } else {
                batches.push(currentBatch);
                currentBatch = [dates[i]];
            }
        }
        
        if (currentBatch.length > 0) {
            batches.push(currentBatch);
        }
        
        return batches;
    },

    async saveToIndexedDB(data, latitude, longitude) {
        if (typeof EnvironmentalDataService === 'undefined') {
            console.warn('EnvironmentalDataService not available');
            return null;
        }
        
        return EnvironmentalDataService.saveEnvironmentalData({
            ...data,
            latitude,
            longitude,
        });
    },

    async getFromIndexedDB(startDate, endDate, latitude, longitude) {
        if (typeof EnvironmentalDataService === 'undefined') {
            console.warn('EnvironmentalDataService not available');
            return [];
        }
        
        return EnvironmentalDataService.getByDateRange(startDate, endDate, latitude, longitude);
    },

    getFromCache(key) {
        try {
            const cache = JSON.parse(localStorage.getItem(this.CACHE_KEY) || '{}');
            const entry = cache[key];
            
            if (!entry) return null;
            
            const age = Date.now() - new Date(entry.fetchedAt).getTime();
            if (age > this.CACHE_DURATION_MS) {
                delete cache[key];
                localStorage.setItem(this.CACHE_KEY, JSON.stringify(cache));
                return null;
            }
            
            return entry;
        } catch (error) {
            console.error('Weather cache read error:', error);
            return null;
        }
    },

    saveToCache(key, data) {
        try {
            const cache = JSON.parse(localStorage.getItem(this.CACHE_KEY) || '{}');
            cache[key] = data;
            
            const keys = Object.keys(cache);
            if (keys.length > 100) {
                const oldest = keys.sort((a, b) => {
                    const aTime = new Date(cache[a].fetchedAt).getTime();
                    const bTime = new Date(cache[b].fetchedAt).getTime();
                    return aTime - bTime;
                })[0];
                delete cache[oldest];
            }
            
            localStorage.setItem(this.CACHE_KEY, JSON.stringify(cache));
        } catch (error) {
            console.error('Weather cache write error:', error);
        }
    },

    clearCache() {
        localStorage.removeItem(this.CACHE_KEY);
    }
};

const GeomagneticService = {
    CACHE_KEY: 'geomagneticCache',
    CACHE_DURATION_MS: 60 * 60 * 1000,
    API_URL: 'https://services.swpc.noaa.gov/json/planetary_k_index_1m.json',
    RATE_LIMIT_MS: 6000,
    lastRequestTime: 0,

    async fetchKpIndex(date = new Date()) {
        const dateStr = date.toISOString().split('T')[0];
        const cached = this.getFromCache(dateStr);
        
        if (cached) {
            return cached;
        }

        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < this.RATE_LIMIT_MS) {
            await new Promise(resolve => setTimeout(resolve, this.RATE_LIMIT_MS - timeSinceLastRequest));
        }

        try {
            this.lastRequestTime = Date.now();
            const response = await fetch(this.API_URL);
            
            if (!response.ok) {
                throw new Error(`Geomagnetic API error: ${response.status}`);
            }

            const data = await response.json();
            
            const targetDate = new Date(date);
            targetDate.setHours(0, 0, 0, 0);
            
            const dayData = data.filter(entry => {
                const entryDate = new Date(entry.time_tag);
                entryDate.setHours(0, 0, 0, 0);
                return entryDate.getTime() === targetDate.getTime();
            });

            if (dayData.length === 0) {
                return null;
            }

            const kpValues = dayData.map(entry => parseFloat(entry.kp_index)).filter(v => !isNaN(v));
            const avgKp = kpValues.length > 0 
                ? kpValues.reduce((sum, v) => sum + v, 0) / kpValues.length 
                : null;
            const maxKp = kpValues.length > 0 ? Math.max(...kpValues) : null;

            const geoData = {
                date: dateStr,
                avgKp: avgKp !== null ? Math.round(avgKp * 10) / 10 : null,
                maxKp: maxKp !== null ? Math.round(maxKp * 10) / 10 : null,
                stormLevel: this.getStormLevel(maxKp),
                fetchedAt: new Date().toISOString(),
            };

            this.saveToCache(dateStr, geoData);
            return geoData;
        } catch (error) {
            console.error('Geomagnetic fetch error:', error);
            return null;
        }
    },

    getStormLevel(kp) {
        if (kp === null) return 'unknown';
        if (kp < 5) return 'quiet';
        if (kp < 6) return 'unsettled';
        if (kp < 7) return 'active';
        if (kp < 8) return 'minor storm';
        if (kp < 9) return 'major storm';
        return 'severe storm';
    },

    getFromCache(key) {
        try {
            const cache = JSON.parse(localStorage.getItem(this.CACHE_KEY) || '{}');
            const entry = cache[key];
            
            if (!entry) return null;
            
            const age = Date.now() - new Date(entry.fetchedAt).getTime();
            if (age > this.CACHE_DURATION_MS) {
                delete cache[key];
                localStorage.setItem(this.CACHE_KEY, JSON.stringify(cache));
                return null;
            }
            
            return entry;
        } catch (error) {
            console.error('Geomagnetic cache read error:', error);
            return null;
        }
    },

    saveToCache(key, data) {
        try {
            const cache = JSON.parse(localStorage.getItem(this.CACHE_KEY) || '{}');
            cache[key] = data;
            
            const keys = Object.keys(cache);
            if (keys.length > 100) {
                const oldest = keys.sort((a, b) => {
                    const aTime = new Date(cache[a].fetchedAt).getTime();
                    const bTime = new Date(cache[b].fetchedAt).getTime();
                    return aTime - bTime;
                })[0];
                delete cache[oldest];
            }
            
            localStorage.setItem(this.CACHE_KEY, JSON.stringify(cache));
        } catch (error) {
            console.error('Geomagnetic cache write error:', error);
        }
    },

    clearCache() {
        localStorage.removeItem(this.CACHE_KEY);
    }
};

const LunarPhaseCalculator = {
    calculate(date = new Date()) {
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = date.getDate();

        let c = 0;
        let e = 0;
        let jd = 0;
        let b = 0;

        if (month < 3) {
            const y = year - 1;
            const m = month + 12;
            c = Math.floor(y / 100);
            e = Math.floor(c / 4);
            jd = 365.25 * (y + 4716);
            b = Math.floor(30.6001 * (m + 1));
        } else {
            c = Math.floor(year / 100);
            e = Math.floor(c / 4);
            jd = 365.25 * (year + 4716);
            b = Math.floor(30.6001 * (month + 1));
        }

        const a = Math.floor(c / 4);
        jd = jd + b + day + 2 - c + e - 1524.5;

        const daysSinceNew = jd - 2451549.5;
        const newMoons = daysSinceNew / 29.53058867;
        const phase = (newMoons - Math.floor(newMoons)) * 29.53058867;

        // Sinusoidal illumination pattern: 0% at new moon, 100% at full moon
        // Uses cosine to create smooth wave: new(0%) -> first quarter(50%) -> full(100%) -> last quarter(50%) -> new(0%)
        const lunarCyclePosition = (phase / 29.53058867) * 2 * Math.PI;
        const sinusoidalPercent = ((1 - Math.cos(lunarCyclePosition)) / 2) * 100;

        let phaseName = '';
        let phaseEmoji = '';

        if (phase < 1.84566) {
            phaseName = 'New Moon';
            phaseEmoji = '🌑';
        } else if (phase < 5.53699) {
            phaseName = 'Waxing Crescent';
            phaseEmoji = '🌒';
        } else if (phase < 9.22831) {
            phaseName = 'First Quarter';
            phaseEmoji = '🌓';
        } else if (phase < 12.91963) {
            phaseName = 'Waxing Gibbous';
            phaseEmoji = '🌔';
        } else if (phase < 16.61096) {
            phaseName = 'Full Moon';
            phaseEmoji = '🌕';
        } else if (phase < 20.30228) {
            phaseName = 'Waning Gibbous';
            phaseEmoji = '🌖';
        } else if (phase < 23.99361) {
            phaseName = 'Last Quarter';
            phaseEmoji = '🌗';
        } else if (phase < 27.68493) {
            phaseName = 'Waning Crescent';
            phaseEmoji = '🌘';
        } else {
            phaseName = 'New Moon';
            phaseEmoji = '🌑';
        }

        return {
            date: date.toISOString().split('T')[0],
            phase: Math.round(phase * 100) / 100,
            phasePercent: Math.round(sinusoidalPercent * 10) / 10,
            phaseName,
            phaseEmoji,
            age: Math.round(phase * 10) / 10,
        };
    }
};

const ExternalDataService = {
    async getLocationPermission() {
        if (!navigator.geolocation) {
            throw new Error('Geolocation not supported');
        }

        return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
                position => resolve({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                }),
                error => reject(error),
                { 
                    timeout: 30000,           // 30 seconds (increased from 10s)
                    maximumAge: 86400000,     // 24 hours (allow cached position)
                    enableHighAccuracy: false // Don't require GPS, allow network location
                }
            );
        });
    },

    async enrichEntry(entry) {
        const enriched = { ...entry };
        const entryDate = new Date(entry.timestamp);

        try {
            const lunar = LunarPhaseCalculator.calculate(entryDate);
            enriched.lunarPhase = lunar.phaseName;
            enriched.lunarEmoji = lunar.phaseEmoji;
        } catch (error) {
            console.error('Lunar calculation error:', error);
        }

        return enriched;
    },

    async enrichWithWeather(entry, latitude, longitude) {
        const enriched = { ...entry };
        const entryDate = new Date(entry.timestamp);

        try {
            const weather = await WeatherService.fetchWeather(latitude, longitude, entryDate);
            if (weather) {
                enriched.weather = {
                    tempMax: weather.tempMax,
                    tempMin: weather.tempMin,
                    pressure: weather.pressure,
                    precipitation: weather.precipitation,
                    uvIndex: weather.uvIndex,
                };
            }
        } catch (error) {
            console.error('Weather enrichment error:', error);
        }

        return enriched;
    },

    async enrichWithGeomagnetic(entry) {
        const enriched = { ...entry };
        const entryDate = new Date(entry.timestamp);

        try {
            const geo = await GeomagneticService.fetchKpIndex(entryDate);
            if (geo) {
                enriched.geomagnetic = {
                    kpIndex: geo.maxKp,
                    stormLevel: geo.stormLevel,
                };
            }
        } catch (error) {
            console.error('Geomagnetic enrichment error:', error);
        }

        return enriched;
    }
};
