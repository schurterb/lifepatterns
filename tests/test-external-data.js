#!/usr/bin/env node
'use strict';

require('./mock-browser');
const {
    TestHarness,
    assertEqual,
    assertTrue,
    assertFalse,
    assertNotNull,
    assertGreaterThan,
    assertLessThan
} = require('./test-harness');

const { loadModule } = require('./module-loader');

// Load the module to test
const path = require('path');
const context = loadModule(path.join(__dirname, '../www/js/externalData.js'));

// Extract exports from context
const { WeatherService, GeomagneticService, LunarPhaseCalculator, ExternalDataService } = context;

const harness = new TestHarness();

harness.describe('LunarPhaseCalculator', () => {
    harness.it('should calculate lunar phase for a date', () => {
        const date = new Date('2024-01-01');
        const result = LunarPhaseCalculator.calculate(date);

        assertNotNull(result.phaseName);
        assertNotNull(result.phaseEmoji);
        assertGreaterThan(result.phase, 0);
        assertLessThan(result.phase, 30);
        assertGreaterThan(result.phasePercent, 0);
        assertLessThan(result.phasePercent, 100);
    });

    harness.it('should return valid phase names', () => {
        const validPhases = [
            'New Moon',
            'Waxing Crescent',
            'First Quarter',
            'Waxing Gibbous',
            'Full Moon',
            'Waning Gibbous',
            'Last Quarter',
            'Waning Crescent'
        ];

        const date = new Date('2024-06-15');
        const result = LunarPhaseCalculator.calculate(date);

        assertTrue(validPhases.includes(result.phaseName));
    });

    harness.it('should return valid phase emojis', () => {
        const validEmojis = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'];

        const date = new Date('2024-06-15');
        const result = LunarPhaseCalculator.calculate(date);

        assertTrue(validEmojis.includes(result.phaseEmoji));
    });

    harness.it('should include date in result', () => {
        const date = new Date('2024-01-15');
        const result = LunarPhaseCalculator.calculate(date);

        assertEqual(result.date, '2024-01-15');
    });

    harness.it('should calculate age of moon', () => {
        const date = new Date('2024-01-01');
        const result = LunarPhaseCalculator.calculate(date);

        assertGreaterThan(result.age, 0);
        assertLessThan(result.age, 30);
    });
});

harness.describe('WeatherService', () => {
    harness.it('should have correct cache configuration', () => {
        assertEqual(WeatherService.CACHE_KEY, 'weatherCache');
        assertEqual(WeatherService.CACHE_DURATION_MS, 60 * 60 * 1000);
        assertEqual(WeatherService.RATE_LIMIT_MS, 6000);
    });

    harness.it('should save data to cache', () => {
        const cacheKey = 'test-key';
        const data = {
            date: '2024-01-01',
            tempMax: 20,
            tempMin: 10,
            fetchedAt: new Date().toISOString()
        };

        WeatherService.saveToCache(cacheKey, data);
        const cached = WeatherService.getFromCache(cacheKey);

        assertNotNull(cached);
        assertEqual(cached.tempMax, 20);
        assertEqual(cached.tempMin, 10);
    });

    harness.it('should return null for non-existent cache key', () => {
        const cached = WeatherService.getFromCache('nonexistent-key');
        assertEqual(cached, null);
    });

    harness.it('should expire old cache entries', () => {
        const cacheKey = 'old-key';
        const oldData = {
            date: '2024-01-01',
            tempMax: 20,
            fetchedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() // 2 hours ago
        };

        WeatherService.saveToCache(cacheKey, oldData);
        const cached = WeatherService.getFromCache(cacheKey);

        assertEqual(cached, null);
    });

    harness.it('should limit cache size to 100 entries', () => {
        WeatherService.clearCache();

        for (let i = 0; i < 105; i++) {
            WeatherService.saveToCache(`key-${i}`, {
                date: '2024-01-01',
                tempMax: 20,
                fetchedAt: new Date(Date.now() - i * 1000).toISOString()
            });
        }

        const cache = JSON.parse(localStorage.getItem(WeatherService.CACHE_KEY));
        const keys = Object.keys(cache);

        assertLessThan(keys.length, 101);
    });

    harness.it('should clear cache', () => {
        WeatherService.saveToCache('test', { data: 'test' });
        WeatherService.clearCache();

        const cached = WeatherService.getFromCache('test');
        assertEqual(cached, null);
    });
});

harness.describe('GeomagneticService', () => {
    harness.it('should have correct cache configuration', () => {
        assertEqual(GeomagneticService.CACHE_KEY, 'geomagneticCache');
        assertEqual(GeomagneticService.CACHE_DURATION_MS, 60 * 60 * 1000);
        assertEqual(GeomagneticService.RATE_LIMIT_MS, 6000);
    });

    harness.it('should classify storm levels correctly', () => {
        assertEqual(GeomagneticService.getStormLevel(null), 'unknown');
        assertEqual(GeomagneticService.getStormLevel(3), 'quiet');
        assertEqual(GeomagneticService.getStormLevel(5), 'unsettled');
        assertEqual(GeomagneticService.getStormLevel(6), 'active');
        assertEqual(GeomagneticService.getStormLevel(7), 'minor storm');
        assertEqual(GeomagneticService.getStormLevel(8), 'major storm');
        assertEqual(GeomagneticService.getStormLevel(9), 'severe storm');
    });

    harness.it('should save data to cache', () => {
        const dateKey = '2024-01-01';
        const data = {
            date: dateKey,
            avgKp: 3.5,
            maxKp: 5.0,
            stormLevel: 'unsettled',
            fetchedAt: new Date().toISOString()
        };

        GeomagneticService.saveToCache(dateKey, data);
        const cached = GeomagneticService.getFromCache(dateKey);

        assertNotNull(cached);
        assertEqual(cached.avgKp, 3.5);
        assertEqual(cached.maxKp, 5.0);
        assertEqual(cached.stormLevel, 'unsettled');
    });

    harness.it('should return null for non-existent cache key', () => {
        const cached = GeomagneticService.getFromCache('2099-12-31');
        assertEqual(cached, null);
    });

    harness.it('should expire old cache entries', () => {
        const dateKey = '2024-01-01';
        const oldData = {
            date: dateKey,
            avgKp: 3.5,
            fetchedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
        };

        GeomagneticService.saveToCache(dateKey, oldData);
        const cached = GeomagneticService.getFromCache(dateKey);

        assertEqual(cached, null);
    });

    harness.it('should clear cache', () => {
        GeomagneticService.saveToCache('2024-01-01', { data: 'test' });
        GeomagneticService.clearCache();

        const cached = GeomagneticService.getFromCache('2024-01-01');
        assertEqual(cached, null);
    });
});

harness.describe('ExternalDataService', () => {
    harness.it('should enrich entry with lunar phase', async () => {
        const entry = {
            id: 'test-1',
            timestamp: '2024-01-15T12:00:00Z',
            type: 'mood',
            value: 7
        };

        const enriched = await ExternalDataService.enrichEntry(entry);

        assertNotNull(enriched.lunarPhase);
        assertNotNull(enriched.lunarEmoji);
        assertEqual(enriched.id, 'test-1');
        assertEqual(enriched.value, 7);
    });

    harness.it('should preserve original entry data when enriching', async () => {
        const entry = {
            id: 'test-1',
            timestamp: '2024-01-15T12:00:00Z',
            type: 'mood',
            value: 7,
            notes: 'Test notes'
        };

        const enriched = await ExternalDataService.enrichEntry(entry);

        assertEqual(enriched.id, entry.id);
        assertEqual(enriched.timestamp, entry.timestamp);
        assertEqual(enriched.type, entry.type);
        assertEqual(enriched.value, entry.value);
        assertEqual(enriched.notes, entry.notes);
    });
});

// Run tests
if (require.main === module) {
    harness.run().then(success => {
        process.exit(success ? 0 : 1);
    });
}

module.exports = harness;
