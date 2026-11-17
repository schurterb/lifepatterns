#!/usr/bin/env node
'use strict';

/**
 * Tests the real FoodCapture.stripExif function (www/js/food-capture.js) using
 * a synthetic JPEG byte stream parsed by the real DataView implementation.
 * Uses Node's native File/Blob (no mocks). Image resize and AI network calls
 * require a browser / server and are covered by integration tests.
 */

const path = require('path');
const { TestHarness, assertEqual, assertTrue, assertFalse } = require('./test-harness');
const { loadModule } = require('./module-loader');

// `window` aliases the global scope (modules assign `window.X`); document is
// referenced only inside methods we do not invoke here. File/Blob are native
// in Node 22.
global.window = global;

loadModule(path.join(__dirname, '../www/js/food-capture.js'));
const FoodCapture = global.window.FoodCapture;
if (!FoodCapture) {
    console.error('Failed to load real FoodCapture');
    process.exit(1);
}

function makeFile(bytes, name = 'test.jpg', type = 'image/jpeg') {
    return new File([bytes], name, { type });
}

const harness = new TestHarness();

harness.describe('FoodCapture.stripExif (real)', () => {
    harness.it('removes APP1 (EXIF) segment and preserves APP0', async () => {
        // JPEG segment length field is inclusive of itself (2 bytes) + payload.
        // SOI + APP1(FFE1, len=6 → 4-byte "Exif" payload) + APP0(FFE0, len=6 → 4 data bytes) + EOI
        const input = new Uint8Array([
            0xFF, 0xD8,
            0xFF, 0xE1, 0x00, 0x06, 0x45, 0x78, 0x69, 0x66,
            0xFF, 0xE0, 0x00, 0x06, 0xAA, 0xBB, 0xCC, 0xDD,
            0xFF, 0xD9
        ]);
        const result = await FoodCapture.stripExif(makeFile(input));
        const out = new Uint8Array(await result.arrayBuffer());

        // SOI preserved
        assertEqual(out[0], 0xFF);
        assertEqual(out[1], 0xD8);

        // APP1 (FFE1) gone
        let hasApp1 = false;
        for (let i = 0; i < out.length - 1; i++) {
            if (out[i] === 0xFF && out[i + 1] === 0xE1) { hasApp1 = true; break; }
        }
        assertFalse(hasApp1, 'APP1/EXIF segment must be removed');

        // APP0 (FFE0) preserved
        let hasApp0 = false;
        for (let i = 0; i < out.length - 1; i++) {
            if (out[i] === 0xFF && out[i + 1] === 0xE0) { hasApp0 = true; break; }
        }
        assertTrue(hasApp0, 'APP0 segment must be preserved');

        // "Exif" ASCII bytes must not appear
        const ascii = Buffer.from(out).toString('latin1');
        assertFalse(ascii.includes('Exif'), '"Exif" bytes must be gone');
    });

    harness.it('returns original file unchanged for non-JPEG', async () => {
        const png = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
        const file = makeFile(png, 'test.png', 'image/png');
        const result = await FoodCapture.stripExif(file);
        assertEqual(result, file, 'Non-JPEG must be returned as-is');
    });

    harness.it('preserves JPEG with no EXIF segment', async () => {
        // SOI + APP0 + EOI — no EXIF to remove
        const input = new Uint8Array([
            0xFF, 0xD8,
            0xFF, 0xE0, 0x00, 0x06, 0x01, 0x02, 0x03, 0x04,
            0xFF, 0xD9
        ]);
        const result = await FoodCapture.stripExif(makeFile(input));
        const out = new Uint8Array(await result.arrayBuffer());

        assertEqual(out[0], 0xFF);
        assertEqual(out[1], 0xD8);
        let hasApp0 = false;
        for (let i = 0; i < out.length - 1; i++) {
            if (out[i] === 0xFF && out[i + 1] === 0xE0) { hasApp0 = true; break; }
        }
        assertTrue(hasApp0, 'APP0 segment must still be present');
    });
});

harness.run().then(ok => process.exit(ok ? 0 : 1));
