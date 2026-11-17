#!/usr/bin/env node
'use strict';

/**
 * Tests the real EncryptionService (www/js/encryption.js) end-to-end using
 * Node's native WebCrypto (same API as the browser). No crypto is mocked.
 * SyncService itself is a thin fetch wrapper around EncryptionService + the
 * /sync/* HTTP endpoints and is exercised via integration tests, not here.
 */

require('./mock-browser');
// Node 22 provides native crypto (WebCrypto) — no shims needed.

const path = require('path');
const { TestHarness, assertEqual, assertTrue, assertFalse } = require('./test-harness');
const { loadModule } = require('./module-loader');

loadModule(path.join(__dirname, '../www/js/encryption.js'));
const EncryptionService = global.window.EncryptionService;
if (!EncryptionService) {
    console.error('Failed to load real EncryptionService');
    process.exit(1);
}

const harness = new TestHarness();

harness.describe('EncryptionService (real AES-GCM + PBKDF2)', () => {
    harness.it('roundtrips arbitrary JSON with correct password', async () => {
        const data = {
            entries: [{ type: 'mood', value: 5, timestamp: '2024-01-01T00:00:00Z' }],
            settings: [{ key: 'theme', value: 'dark' }]
        };
        const encrypted = await EncryptionService.encrypt(data, 'correct-password-123');
        assertTrue(encrypted instanceof Uint8Array, 'encrypt returns Uint8Array');
        assertTrue(encrypted.length > 28, 'Ciphertext longer than salt+iv');

        const decrypted = await EncryptionService.decrypt(encrypted, 'correct-password-123');
        assertEqual(decrypted.entries[0].type, 'mood');
        assertEqual(decrypted.entries[0].value, 5);
        assertEqual(decrypted.settings[0].key, 'theme');
    });

    harness.it('decryption with wrong password fails (AES-GCM auth tag)', async () => {
        const encrypted = await EncryptionService.encrypt({ secret: 42 }, 'password-one');
        let threw = false;
        try {
            await EncryptionService.decrypt(encrypted, 'password-two');
        } catch (_e) {
            threw = true;
        }
        assertTrue(threw, 'Wrong password must throw on AES-GCM auth failure');
    });

    harness.it('produces different ciphertext for same plaintext (random salt+IV)', async () => {
        const a = await EncryptionService.encrypt({ x: 1 }, 'same-password');
        const b = await EncryptionService.encrypt({ x: 1 }, 'same-password');
        const identical = a.length === b.length && Array.from(a).every((v, i) => v === b[i]);
        assertFalse(identical, 'Each encrypt() must randomize salt+IV');
    });

    harness.it('salt (first 16 bytes) and IV (next 12 bytes) differ across calls', async () => {
        const a = await EncryptionService.encrypt({}, 'pw');
        const b = await EncryptionService.encrypt({}, 'pw');
        const saltEqual = Array.from(a.slice(0, 16)).every((v, i) => v === b[i]);
        const ivEqual = Array.from(a.slice(16, 28)).every((v, i) => v === b[16 + i]);
        assertFalse(saltEqual, 'Salt must be random');
        assertFalse(ivEqual, 'IV must be random');
    });

    harness.it('generateRecoveryKey produces 16 hex groups of 4 chars', () => {
        const key = EncryptionService.generateRecoveryKey();
        assertTrue(/^[0-9A-F]{4}(-[0-9A-F]{4}){15}$/.test(key), `Unexpected format: ${key}`);
    });

    harness.it('generateRecoveryKey values differ between calls', () => {
        const a = EncryptionService.generateRecoveryKey();
        const b = EncryptionService.generateRecoveryKey();
        assertTrue(a !== b, 'Recovery keys must be distinct');
    });

    harness.it('validatePassword rejects password equal to login password', () => {
        const r = EncryptionService.validatePassword('same-pw-123', 'same-pw-123');
        assertFalse(r.valid);
        assertTrue(r.error.includes('different'));
    });

    harness.it('validatePassword rejects password shorter than 12 characters', () => {
        const r = EncryptionService.validatePassword('short', 'loginpw');
        assertFalse(r.valid);
        assertTrue(r.error.includes('12 characters'));
    });

    harness.it('validatePassword accepts distinct 12+ char password', () => {
        const r = EncryptionService.validatePassword('strong-sync-passphrase', 'login-pw');
        assertTrue(r.valid);
    });
});

harness.run().then(ok => process.exit(ok ? 0 : 1));
