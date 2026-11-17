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
    assertMatch,
    assertIncludes,
    assertNotNull
} = require('./test-harness');

const { loadModule, loadModules } = require('./module-loader');
const path = require('path');

// Load the real vendored Dexie (UMD) — `new Dexie()` + version().stores() do
// not touch IndexedDB until db.open(), which no test here calls.
global.Dexie = require('../www/vendor/dexie.min.js');

// Load real dependencies so tested code runs against real implementations
// of EntryService, ValidationUtils, TypeUtils, and DateUtils.
loadModules([
    path.join(__dirname, '../www/js/utils.js'),
    path.join(__dirname, '../www/js/customTypes.js'),
    path.join(__dirname, '../www/js/db.js')
]);

// Load the module under test
const context = loadModule(path.join(__dirname, '../www/js/importExport.js'));

// Extract exports from context
const { FileDownload, CSVExporter, CSVParser, JSONExporter, JSONImporter, ImportValidator, ImportService } = context;

const harness = new TestHarness();

// CSV Exporter Tests
harness.describe('CSVExporter', () => {
    harness.it('should sanitize dangerous cell prefixes', () => {
        assertEqual(CSVExporter.sanitizeCell('=1+1'), "'=1+1");
        assertEqual(CSVExporter.sanitizeCell('+1+1'), "'+1+1");
        assertEqual(CSVExporter.sanitizeCell('-1-1'), "'-1-1");
        assertEqual(CSVExporter.sanitizeCell('@SUM(A1)'), "'@SUM(A1)");
        assertEqual(CSVExporter.sanitizeCell('|pipe'), "'|pipe");
        assertEqual(CSVExporter.sanitizeCell('%percent'), "'%percent");
    });

    harness.it('should not sanitize safe values', () => {
        assertEqual(CSVExporter.sanitizeCell('normal text'), 'normal text');
        assertEqual(CSVExporter.sanitizeCell('123'), '123');
        assertEqual(CSVExporter.sanitizeCell('test@email.com'), 'test@email.com');
    });

    harness.it('should handle null and undefined', () => {
        assertEqual(CSVExporter.sanitizeCell(null), '');
        assertEqual(CSVExporter.sanitizeCell(undefined), '');
    });

    harness.it('should wrap values in quotes and escape internal quotes', () => {
        assertEqual(CSVExporter.wrapInQuotes('test'), '"test"');
        assertEqual(CSVExporter.wrapInQuotes('say "hello"'), '"say ""hello"""');
        assertEqual(CSVExporter.wrapInQuotes(''), '""');
    });

    harness.it('should export entries to CSV format', () => {
        const entries = [
            {
                id: 'test-1',
                timestamp: '2024-01-01T12:00:00.000Z',
                timezone: 'America/New_York',
                type: 'mood',
                value: 7,
                notes: 'Feeling good',
                createdAt: '2024-01-01T12:00:00.000Z',
                updatedAt: '2024-01-01T12:00:00.000Z'
            }
        ];

        const csv = CSVExporter.exportEntries(entries);
        
        // CSV includes warning header, so check for header row after warning
        assertIncludes(csv, 'id,timestamp,timezone,type,value,notes');
        assertIncludes(csv, 'test-1');
        assertIncludes(csv, 'mood');
        assertIncludes(csv, 'Feeling good');
    });

    harness.it('should handle entries with dangerous characters', () => {
        const entries = [
            {
                id: 'test-1',
                timestamp: '2024-01-01T12:00:00.000Z',
                timezone: 'America/New_York',
                type: 'mood',
                value: 7,
                notes: '=DANGEROUS',
                createdAt: '2024-01-01T12:00:00.000Z',
                updatedAt: '2024-01-01T12:00:00.000Z'
            }
        ];

        const csv = CSVExporter.exportEntries(entries);
        assertIncludes(csv, "'=DANGEROUS");
    });
});

// CSV Parser Tests
harness.describe('CSVParser', () => {
    harness.it('should parse basic CSV', () => {
        const csv = `id,timestamp,timezone,type,value,notes
test-1,2024-01-01T12:00:00.000Z,America/New_York,mood,7,Good day`;

        const entries = CSVParser.parse(csv);
        
        assertEqual(entries.length, 1);
        assertEqual(entries[0].id, 'test-1');
        assertEqual(entries[0].type, 'mood');
        assertEqual(entries[0].value, 7);
        assertEqual(entries[0].notes, 'Good day');
    });

    harness.it('should handle quoted fields', () => {
        const csv = `id,timestamp,timezone,type,value,notes
test-1,2024-01-01T12:00:00.000Z,America/New_York,mood,7,"Notes with, comma"`;

        const entries = CSVParser.parse(csv);
        assertEqual(entries[0].notes, 'Notes with, comma');
    });

    harness.it('should handle escaped quotes', () => {
        const csv = `id,timestamp,timezone,type,value,notes
test-1,2024-01-01T12:00:00.000Z,America/New_York,mood,7,"Say ""hello"""`;

        const entries = CSVParser.parse(csv);
        assertEqual(entries[0].notes, 'Say "hello"');
    });

    harness.it('should strip formula injection prefixes', () => {
        const csv = `id,timestamp,timezone,type,value,notes
test-1,2024-01-01T12:00:00.000Z,America/New_York,mood,7,"'=FORMULA"`;

        const entries = CSVParser.parse(csv);
        assertEqual(entries[0].notes, '=FORMULA');
    });

    harness.it('should convert numeric values', () => {
        const csv = `id,timestamp,timezone,type,value,notes
test-1,2024-01-01T12:00:00.000Z,America/New_York,mood,7.5,Test`;

        const entries = CSVParser.parse(csv);
        assertEqual(entries[0].value, 7.5);
    });

    harness.it('should preserve medication names as strings', () => {
        const csv = `id,timestamp,timezone,type,value,notes
test-1,2024-01-01T12:00:00.000Z,America/New_York,medication,Aspirin,Test`;

        const entries = CSVParser.parse(csv);
        assertEqual(entries[0].value, 'Aspirin');
    });
});

// JSON Exporter Tests
harness.describe('JSONExporter', () => {
    harness.it('should export entries to JSON with schema', () => {
        const entries = [
            {
                id: 'test-1',
                timestamp: '2024-01-01T12:00:00.000Z',
                timezone: 'America/New_York',
                type: 'mood',
                value: 7,
                notes: 'Test',
                createdAt: '2024-01-01T12:00:00.000Z',
                updatedAt: '2024-01-01T12:00:00.000Z'
            }
        ];

        const json = JSONExporter.exportEntries(entries);
        const parsed = JSON.parse(json);

        assertEqual(parsed.schemaVersion, 1);
        assertEqual(parsed.entryCount, 1);
        assertTrue(parsed.exportedAt !== undefined);
        assertEqual(parsed.entries.length, 1);
        assertEqual(parsed.entries[0].id, 'test-1');
    });
});

// JSON Importer Tests
harness.describe('JSONImporter', () => {
    harness.it('should parse valid JSON', () => {
        const json = JSON.stringify({
            schemaVersion: 1,
            exportedAt: new Date().toISOString(),
            entryCount: 1,
            entries: [
                {
                    id: 'test-1',
                    timestamp: '2024-01-01T12:00:00.000Z',
                    timezone: 'America/New_York',
                    type: 'mood',
                    value: 7,
                    notes: 'Test'
                }
            ]
        });

        const parsed = JSONImporter.parseJSON(json);
        assertEqual(parsed.schemaVersion, 1);
        assertEqual(parsed.entries.length, 1);
    });

    harness.it('should reject JSON without schema version', () => {
        const parsed = {
            entries: []
        };

        let threw = false;
        try {
            JSONImporter.extractEntries(parsed);
        } catch (error) {
            threw = true;
        }
        assertTrue(threw, 'Should reject JSON without schemaVersion');
    });

    harness.it('should reject JSON without entries array', () => {
        const parsed = {
            schemaVersion: 1
        };

        let threw = false;
        try {
            JSONImporter.extractEntries(parsed);
        } catch (error) {
            threw = true;
        }
        assertTrue(threw, 'Should reject JSON without entries');
    });

    harness.it('should extract entries from parsed JSON', () => {
        const parsed = {
            schemaVersion: 1,
            entries: [
                { id: 'test-1', type: 'mood' },
                { id: 'test-2', type: 'sleep' }
            ]
        };

        const entries = JSONImporter.extractEntries(parsed);
        assertEqual(entries.length, 2);
    });
});

// Import Validator Tests
harness.describe('ImportValidator', () => {
    harness.it('should validate file size', () => {
        const smallFile = { size: 1024 * 1024 }; // 1MB
        const largeFile = { size: 6 * 1024 * 1024 }; // 6MB

        assertTrue(ImportValidator.validateFileSize(smallFile).valid);
        assertFalse(ImportValidator.validateFileSize(largeFile).valid);
    });

    harness.it('should enforce batch entry limit', () => {
        const largeBatch = new Array(10001).fill({
            type: 'mood',
            timestamp: '2024-01-01T12:00:00.000Z',
            timezone: 'America/New_York',
            value: 7
        });

        const largeResult = ImportValidator.validateEntries(largeBatch);

        assertTrue(largeResult.errors.length > 0, 'Should have errors for large batch');
        assertTrue(largeResult.errors.some(e => e.message.includes('10,000')), 'Should mention batch limit');
    });

    harness.it('should normalize entry data', () => {
        const entry = {
            type: '  mood  ',
            timestamp: '2024-01-01T12:00:00.000Z',
            timezone: '  America/New_York  ',
            value: '7',
            notes: '  Test  '
        };

        const normalized = ImportValidator.normalizeEntry(entry);

        assertEqual(normalized.type, 'mood');
        assertEqual(normalized.timezone, 'America/New_York');
        assertEqual(normalized.value, 7);
        assertTrue(normalized.id !== undefined, 'id should be defined');
        assertNotNull(normalized.createdAt);
    });

    harness.it('should validate timestamp bounds', () => {
        const oldEntry = {
            type: 'mood',
            timestamp: '2019-01-01T12:00:00.000Z',
            timezone: 'America/New_York',
            value: 7
        };

        const futureEntry = {
            type: 'mood',
            timestamp: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
            timezone: 'America/New_York',
            value: 7
        };

        const oldErrors = ImportValidator.validateEntry(oldEntry);
        const futureErrors = ImportValidator.validateEntry(futureEntry);

        assertTrue(oldErrors.some(e => e.includes('2020-01-01')));
        assertTrue(futureErrors.some(e => e.includes('future')));
    });

    harness.it('should validate notes length', () => {
        const entry = {
            type: 'mood',
            timestamp: '2024-01-01T12:00:00.000Z',
            timezone: 'America/New_York',
            value: 7,
            notes: 'a'.repeat(501)
        };

        const errors = ImportValidator.validateEntry(entry);
        assertTrue(errors.some(e => e.includes('500 characters')));
    });
});

// FileDownload.save requires a real DOM (document.createElement + click) and
// is not covered in Node — the previous version asserted nothing meaningful.

// Run tests
if (require.main === module) {
    harness.run().then(success => {
        process.exit(success ? 0 : 1);
    });
}

module.exports = harness;
