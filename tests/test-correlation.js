#!/usr/bin/env node
'use strict';

require('./mock-browser');
const {
    TestHarness,
    assertEqual,
    assertTrue,
    assertFalse,
    assertNull,
    assertGreaterThan,
    assertLessThan
} = require('./test-harness');

const { loadModules } = require('./module-loader');

// Load the real vendored Dexie (UMD) — `new Dexie()` + version().stores() do
// not touch IndexedDB until db.open(), which no test here calls.
global.Dexie = require('../www/vendor/dexie.min.js');

const path = require('path');
const context = loadModules([
    path.join(__dirname, '../www/js/utils.js'),
    path.join(__dirname, '../www/js/customTypes.js'),
    path.join(__dirname, '../www/js/db.js'),
    path.join(__dirname, '../www/js/correlation.js')
]);

// Extract exports from context
const { CorrelationAnalyzer, CustomTypeService } = context;

const harness = new TestHarness();

harness.describe('CorrelationAnalyzer', () => {
    harness.it('should calculate Pearson correlation for perfect positive correlation', () => {
        const x = [1, 2, 3, 4, 5];
        const y = [2, 4, 6, 8, 10];

        const r = CorrelationAnalyzer.calculatePearson(x, y);

        assertEqual(r, 1);
    });

    harness.it('should calculate Pearson correlation for perfect negative correlation', () => {
        const x = [1, 2, 3, 4, 5];
        const y = [10, 8, 6, 4, 2];

        const r = CorrelationAnalyzer.calculatePearson(x, y);

        assertEqual(r, -1);
    });

    harness.it('should calculate Pearson correlation for no correlation', () => {
        const x = [1, 2, 3, 4, 5];
        const y = [5, 3, 5, 3, 5];

        const r = CorrelationAnalyzer.calculatePearson(x, y);

        assertTrue(Math.abs(r) < 0.5);
    });

    harness.it('should return null for insufficient data', () => {
        const x = [1];
        const y = [2];

        const r = CorrelationAnalyzer.calculatePearson(x, y);

        assertNull(r);
    });

    harness.it('should return null for mismatched array lengths', () => {
        const x = [1, 2, 3];
        const y = [1, 2];

        const r = CorrelationAnalyzer.calculatePearson(x, y);

        assertNull(r);
    });

    harness.it('should return 0 for constant values', () => {
        const x = [5, 5, 5, 5];
        const y = [1, 2, 3, 4];

        const r = CorrelationAnalyzer.calculatePearson(x, y);

        assertEqual(r, 0);
    });

    harness.it('should interpret correlation strength correctly', () => {
        assertEqual(CorrelationAnalyzer.interpretStrength(0.05), 'negligible');
        assertEqual(CorrelationAnalyzer.interpretStrength(0.2), 'weak');
        assertEqual(CorrelationAnalyzer.interpretStrength(0.4), 'moderate');
        assertEqual(CorrelationAnalyzer.interpretStrength(0.6), 'strong');
        assertEqual(CorrelationAnalyzer.interpretStrength(0.8), 'very strong');
        assertEqual(CorrelationAnalyzer.interpretStrength(-0.6), 'strong');
        assertEqual(CorrelationAnalyzer.interpretStrength(null), 'unknown');
    });

    harness.it('should aggregate data by day using average', () => {
        // Ensure CustomTypeService is in global scope for the function
        if (typeof CustomTypeService === 'undefined') {
            global.CustomTypeService = context.CustomTypeService;
        }
        
        const entries = [
            { timestamp: '2024-01-01T10:00:00Z', value: 5 },
            { timestamp: '2024-01-01T14:00:00Z', value: 7 },
            { timestamp: '2024-01-02T10:00:00Z', value: 6 }
        ];

        const aggregated = CorrelationAnalyzer.aggregateByDay(entries, 'mood');

        assertEqual(aggregated.length, 2);
        assertEqual(aggregated[0].value, 6); // Average of 5 and 7
        assertEqual(aggregated[1].value, 6);
    });

    harness.it('should align data with zero lag', () => {
        const data1 = [
            { date: '2024-01-01', value: 5 },
            { date: '2024-01-02', value: 6 },
            { date: '2024-01-03', value: 7 }
        ];

        const data2 = [
            { date: '2024-01-01', value: 10 },
            { date: '2024-01-02', value: 12 },
            { date: '2024-01-03', value: 14 }
        ];

        const aligned = CorrelationAnalyzer.alignDataWithLag(data1, data2, 0);

        assertEqual(aligned.x.length, 3);
        assertEqual(aligned.y.length, 3);
        assertEqual(aligned.x[0], 5);
        assertEqual(aligned.y[0], 10);
    });

    harness.it('should align data with positive lag', () => {
        const data1 = [
            { date: '2024-01-01', value: 5 },
            { date: '2024-01-02', value: 6 },
            { date: '2024-01-03', value: 7 }
        ];

        const data2 = [
            { date: '2024-01-01', value: 10 },
            { date: '2024-01-02', value: 12 },
            { date: '2024-01-03', value: 14 }
        ];

        const aligned = CorrelationAnalyzer.alignDataWithLag(data1, data2, 1);

        assertEqual(aligned.x.length, 2);
        assertEqual(aligned.x[0], 5); // Day 1
        assertEqual(aligned.y[0], 12); // Day 2 (lagged)
    });

    harness.it('should align data with negative lag', () => {
        const data1 = [
            { date: '2024-01-01', value: 5 },
            { date: '2024-01-02', value: 6 },
            { date: '2024-01-03', value: 7 }
        ];

        const data2 = [
            { date: '2024-01-01', value: 10 },
            { date: '2024-01-02', value: 12 },
            { date: '2024-01-03', value: 14 }
        ];

        const aligned = CorrelationAnalyzer.alignDataWithLag(data1, data2, -1);

        assertEqual(aligned.x.length, 2);
        assertEqual(aligned.x[0], 6); // Day 2
        assertEqual(aligned.y[0], 10); // Day 1 (negative lag)
    });

    harness.it('should handle partial date overlap', () => {
        const data1 = [
            { date: '2024-01-01', value: 5 },
            { date: '2024-01-02', value: 6 }
        ];

        const data2 = [
            { date: '2024-01-02', value: 12 },
            { date: '2024-01-03', value: 14 }
        ];

        const aligned = CorrelationAnalyzer.alignDataWithLag(data1, data2, 0);

        assertEqual(aligned.x.length, 1);
        assertEqual(aligned.x[0], 6);
        assertEqual(aligned.y[0], 12);
    });

    harness.it('should get aggregation method for mood (average)', () => {
        if (typeof CustomTypeService === 'undefined') {
            global.CustomTypeService = context.CustomTypeService;
        }
        
        const method = CorrelationAnalyzer.getAggregationMethod('mood');
        const entries = [
            { value: 5 },
            { value: 7 },
            { value: 9 }
        ];

        const result = method(entries);
        assertEqual(result, 7);
    });

    harness.it('should get aggregation method for sleep (sum)', () => {
        if (typeof CustomTypeService === 'undefined') {
            global.CustomTypeService = context.CustomTypeService;
        }
        
        const method = CorrelationAnalyzer.getAggregationMethod('sleep');
        const entries = [
            { value: 7 },
            { value: 8 }
        ];

        const result = method(entries);
        assertEqual(result, 15);
    });

    harness.it('should get aggregation method for medication (count)', () => {
        if (typeof CustomTypeService === 'undefined') {
            global.CustomTypeService = context.CustomTypeService;
        }
        
        const method = CorrelationAnalyzer.getAggregationMethod('medication');
        const entries = [
            { value: 'Aspirin' },
            { value: 'Ibuprofen' },
            { value: 'Aspirin' }
        ];

        const result = method(entries);
        assertEqual(result, 3);
    });

    harness.it('should get aggregation method for weight (last)', () => {
        if (typeof CustomTypeService === 'undefined') {
            global.CustomTypeService = context.CustomTypeService;
        }
        
        const method = CorrelationAnalyzer.getAggregationMethod('weight');
        const entries = [
            { value: 150 },
            { value: 151 },
            { value: 149 }
        ];

        const result = method(entries);
        assertEqual(result, 149);
    });
});

// Run tests
if (require.main === module) {
    harness.run().then(success => {
        process.exit(success ? 0 : 1);
    });
}

module.exports = harness;
