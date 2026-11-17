#!/usr/bin/env node
'use strict';

/**
 * Unit tests for PasswordService
 * Tests password hashing, verification, and validation
 */

require('./mock-browser');
const { TestHarness, assertEqual, assertTrue, assertFalse } = require('./test-harness');

// Node 22 provides native crypto (WebCrypto), btoa, and atob — no shims needed.

const harness = new TestHarness();

// Import the real PasswordService and run tests
(async () => {
    const { PasswordService } = await import('../src/services/password.js');

    // Tests
harness.describe('PasswordService', () => {
    harness.it('should accept valid password', () => {
        const result = PasswordService.validate('Password123');
        assertTrue(result.valid, 'Password should be valid');
        assertTrue(result.errors.length === 0, 'Should have no errors');
    });

    harness.it('should reject short password', () => {
        const result = PasswordService.validate('Pass1');
        assertFalse(result.valid, 'Short password should be invalid');
        assertTrue(result.errors.includes('Password must be at least 8 characters'));
    });

    harness.it('should reject password without lowercase', () => {
        const result = PasswordService.validate('PASSWORD123');
        assertFalse(result.valid);
        assertTrue(result.errors.includes('Password must contain at least one lowercase letter'));
    });

    harness.it('should reject password without uppercase', () => {
        const result = PasswordService.validate('password123');
        assertFalse(result.valid);
        assertTrue(result.errors.includes('Password must contain at least one uppercase letter'));
    });

    harness.it('should reject password without number', () => {
        const result = PasswordService.validate('PasswordOnly');
        assertFalse(result.valid);
        assertTrue(result.errors.includes('Password must contain at least one number'));
    });

    harness.it('should reject too long password', () => {
        const longPassword = 'A'.repeat(130) + '1a';
        const result = PasswordService.validate(longPassword);
        assertFalse(result.valid);
        assertTrue(result.errors.includes('Password must be less than 128 characters'));
    });

    harness.it('should hash password', async () => {
        const hash = await PasswordService.hash('Password123');
        assertTrue(typeof hash === 'string', 'Hash should be a string');
        assertTrue(hash.length > 0, 'Hash should not be empty');
        assertTrue(hash.length >= 64, 'Hash should be at least 64 chars');
    });

    harness.it('should produce different hashes for same password', async () => {
        const hash1 = await PasswordService.hash('Password123');
        const hash2 = await PasswordService.hash('Password123');
        assertTrue(hash1 !== hash2, 'Same password should produce different hashes (salt)');
    });

    harness.it('should verify correct password', async () => {
        const hash = await PasswordService.hash('Password123');
        const valid = await PasswordService.verify('Password123', hash);
        assertTrue(valid, 'Correct password should verify');
    });

    harness.it('should reject incorrect password', async () => {
        const hash = await PasswordService.hash('Password123');
        const valid = await PasswordService.verify('WrongPassword', hash);
        assertFalse(valid, 'Wrong password should not verify');
    });

    harness.it('should handle invalid hash gracefully', async () => {
        const valid = await PasswordService.verify('Password123', 'invalid-hash');
        assertFalse(valid, 'Invalid hash should return false');
    });

    harness.it('should handle empty password', async () => {
        const hash = await PasswordService.hash('Password123');
        const valid = await PasswordService.verify('', hash);
        assertFalse(valid, 'Empty password should not verify');
    });

    harness.it('should return true for equal arrays (constant time)', () => {
        const a = new Uint8Array([1, 2, 3, 4, 5]);
        const b = new Uint8Array([1, 2, 3, 4, 5]);
        assertTrue(PasswordService.constantTimeEquals(a, b));
    });

    harness.it('should return false for different arrays (constant time)', () => {
        const a = new Uint8Array([1, 2, 3, 4, 5]);
        const b = new Uint8Array([1, 2, 3, 4, 6]);
        assertFalse(PasswordService.constantTimeEquals(a, b));
    });

    harness.it('should return false for different lengths (constant time)', () => {
        const a = new Uint8Array([1, 2, 3, 4, 5]);
        const b = new Uint8Array([1, 2, 3]);
        assertFalse(PasswordService.constantTimeEquals(a, b));
    });
});

    harness.run().then(passed => process.exit(passed ? 0 : 1));
})();
