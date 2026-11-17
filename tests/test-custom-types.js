#!/usr/bin/env node
'use strict';

require('./mock-browser');
const {
    TestHarness,
    assertEqual,
    assertDeepEqual,
    assertTrue,
    assertFalse,
    assertThrows,
    assertIncludes
} = require('./test-harness');

const { loadModule } = require('./module-loader');

// Load the module to test
const path = require('path');
const context = loadModule(path.join(__dirname, '../www/js/customTypes.js'));

// Extract exports from context
const { CustomTypeService } = context;

const harness = new TestHarness();

harness.describe('CustomTypeService', () => {
    // Clear storage before each test
    beforeEach(() => {
        global.localStorage.clear();
    });

    harness.it('should create a custom type', () => {
        const config = {
            name: 'Blood Pressure',
            emoji: '🩺',
            valueType: 'number',
            unit: 'mmHg',
            min: 60,
            max: 200,
            step: 1,
            aggregation: 'average'
        };

        const customType = CustomTypeService.createCustomType(config);

        assertEqual(customType.name, 'Blood Pressure');
        assertEqual(customType.emoji, '🩺');
        assertEqual(customType.valueType, 'number');
        assertEqual(customType.unit, 'mmHg');
        assertEqual(customType.min, 60);
        assertEqual(customType.max, 200);
        assertTrue(customType.id.startsWith('custom:'));
    });

    harness.it('should generate slug from name', () => {
        const slug = CustomTypeService.generateSlug('Blood Pressure Test');
        assertEqual(slug, 'blood-pressure-test');
    });

    harness.it('should handle special characters in slug', () => {
        const slug = CustomTypeService.generateSlug('Test@#$%Type!!!');
        assertEqual(slug, 'test-type');
    });

    harness.it('should limit slug length to 30 characters', () => {
        const longName = 'This is a very long custom type name that exceeds the limit';
        const slug = CustomTypeService.generateSlug(longName);
        assertTrue(slug.length <= 30);
    });

    harness.it('should retrieve custom types from storage', () => {
        const config = {
            name: 'Test Type',
            valueType: 'number',
            min: 0,
            max: 100
        };

        CustomTypeService.createCustomType(config);
        const types = CustomTypeService.getCustomTypes();

        assertEqual(types.length, 1);
        assertEqual(types[0].name, 'Test Type');
    });

    harness.it('should enforce maximum of 10 custom types', () => {
        for (let i = 0; i < 10; i++) {
            CustomTypeService.createCustomType({
                name: `Type ${i}`,
                valueType: 'number',
                min: 0,
                max: 100
            });
        }

        assertThrows(() => {
            CustomTypeService.createCustomType({
                name: 'Type 11',
                valueType: 'number',
                min: 0,
                max: 100
            });
        }, 'Should reject 11th custom type');
    });

    harness.it('should prevent duplicate type names', () => {
        CustomTypeService.createCustomType({
            name: 'Test Type',
            valueType: 'number',
            min: 0,
            max: 100
        });

        assertThrows(() => {
            CustomTypeService.createCustomType({
                name: 'Test Type',
                valueType: 'number',
                min: 0,
                max: 100
            });
        }, 'Should reject duplicate type name');
    });

    harness.it('should validate type configuration', () => {
        const invalidConfigs = [
            { name: '', valueType: 'number', min: 0, max: 100 },
            { name: 'Test', valueType: 'number', min: 100, max: 50 },
            { name: 'Test', valueType: 'number', min: 0, max: 100, step: -1 },
            { name: 'a'.repeat(51), valueType: 'number', min: 0, max: 100 }
        ];

        invalidConfigs.forEach(config => {
            const result = CustomTypeService.validateTypeConfig(config);
            assertFalse(result.valid, `Config should be invalid: ${JSON.stringify(config)}`);
        });
    });

    harness.it('should validate valid configurations', () => {
        const validConfig = {
            name: 'Test Type',
            valueType: 'number',
            unit: 'units',
            min: 0,
            max: 100,
            step: 1,
            aggregation: 'average'
        };

        const result = CustomTypeService.validateTypeConfig(validConfig);
        assertTrue(result.valid);
        assertEqual(result.errors.length, 0);
    });

    harness.it('should update existing custom type', () => {
        const customType = CustomTypeService.createCustomType({
            name: 'Test Type',
            valueType: 'number',
            min: 0,
            max: 100
        });

        const updated = CustomTypeService.updateCustomType(customType.id, {
            name: 'Updated Type',
            max: 200
        });

        assertEqual(updated.name, 'Updated Type');
        assertEqual(updated.max, 200);
        assertEqual(updated.min, 0); // Should preserve unchanged fields
    });

    harness.it('should throw error when updating non-existent type', () => {
        assertThrows(() => {
            CustomTypeService.updateCustomType('custom:nonexistent', {
                name: 'Test'
            });
        }, 'Should throw error for non-existent type');
    });

    harness.it('should delete custom type', () => {
        const customType = CustomTypeService.createCustomType({
            name: 'Test Type',
            valueType: 'number',
            min: 0,
            max: 100
        });

        CustomTypeService.deleteCustomType(customType.id);
        const types = CustomTypeService.getCustomTypes();

        assertEqual(types.length, 0);
    });

    harness.it('should get type constraints for number type', () => {
        const customType = CustomTypeService.createCustomType({
            name: 'Test Type',
            valueType: 'number',
            unit: 'units',
            min: 10,
            max: 50
        });

        const constraints = CustomTypeService.getTypeConstraints(customType.id);

        assertEqual(constraints.min, 10);
        assertEqual(constraints.max, 50);
        assertEqual(constraints.unit, 'units');
    });

    harness.it('should get type constraints for text type', () => {
        const customType = CustomTypeService.createCustomType({
            name: 'Test Type',
            valueType: 'text'
        });

        const constraints = CustomTypeService.getTypeConstraints(customType.id);

        assertEqual(constraints.min, 0);
        assertEqual(constraints.max, 500);
        assertEqual(constraints.unit, 'text');
    });

    harness.it('should return null for non-existent type', () => {
        const constraints = CustomTypeService.getTypeConstraints('custom:nonexistent');
        assertEqual(constraints, null);
    });

    harness.it('should get all type constraints including built-in', () => {
        CustomTypeService.createCustomType({
            name: 'Custom Type',
            valueType: 'number',
            min: 0,
            max: 100
        });

        const allConstraints = CustomTypeService.getAllTypeConstraints();

        assertTrue(allConstraints.mood !== undefined);
        assertTrue(allConstraints.sleep !== undefined);
        assertTrue(allConstraints['custom:custom-type'] !== undefined);
    });

    harness.it('should get aggregation method for custom type', () => {
        const customType = CustomTypeService.createCustomType({
            name: 'Test Type',
            valueType: 'number',
            min: 0,
            max: 100,
            aggregation: 'sum'
        });

        const method = CustomTypeService.getAggregationMethod(customType.id);
        assertTrue(typeof method === 'function');

        const entries = [
            { value: 10 },
            { value: 20 },
            { value: 30 }
        ];

        const result = method(entries);
        assertEqual(result, 60); // Sum aggregation
    });

    harness.it('should handle average aggregation', () => {
        const customType = CustomTypeService.createCustomType({
            name: 'Test Type',
            valueType: 'number',
            min: 0,
            max: 100,
            aggregation: 'average'
        });

        const method = CustomTypeService.getAggregationMethod(customType.id);
        const entries = [
            { value: 10 },
            { value: 20 },
            { value: 30 }
        ];

        const result = method(entries);
        assertEqual(result, 20); // Average
    });

    harness.it('should handle last aggregation', () => {
        const customType = CustomTypeService.createCustomType({
            name: 'Test Type',
            valueType: 'number',
            min: 0,
            max: 100,
            aggregation: 'last'
        });

        const method = CustomTypeService.getAggregationMethod(customType.id);
        const entries = [
            { value: 10 },
            { value: 20 },
            { value: 30 }
        ];

        const result = method(entries);
        assertEqual(result, 30); // Last value
    });

    harness.it('should handle count aggregation', () => {
        const customType = CustomTypeService.createCustomType({
            name: 'Test Type',
            valueType: 'number',
            min: 0,
            max: 100,
            aggregation: 'count'
        });

        const method = CustomTypeService.getAggregationMethod(customType.id);
        const entries = [
            { value: 10 },
            { value: 20 },
            { value: 30 }
        ];

        const result = method(entries);
        assertEqual(result, 3); // Count
    });
});

// Helper function for beforeEach
function beforeEach(fn) {
    const originalIt = harness.it.bind(harness);
    harness.it = function(name, testFn) {
        originalIt(name, async function() {
            fn();
            return await testFn();
        });
    };
}

// Run tests
if (require.main === module) {
    harness.run().then(success => {
        process.exit(success ? 0 : 1);
    });
}

module.exports = harness;
