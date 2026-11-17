#!/usr/bin/env node
'use strict';

/**
 * Unit tests for JWTService
 * Tests JWT creation, verification, and token management
 */

require('./mock-browser');
const { TestHarness, assertTrue, assertFalse, assertEqual } = require('./test-harness');

// Node 22 provides native crypto (WebCrypto), btoa, and atob — no shims needed.

const harness = new TestHarness();

// Mock KV namespace
class MockKV {
    constructor() {
        this.data = new Map();
    }

    async get(key) {
        return this.data.get(key) || null;
    }

    async put(key, value, options = {}) {
        this.data.set(key, value);
    }

    async delete(key) {
        this.data.delete(key);
    }
}

// Import the real JWTService and run tests
(async () => {
    const { JWTService } = await import('../src/services/jwt.js');

    // Tests
    harness.describe('JWTService', () => {
    harness.it('should generate access and refresh tokens', async () => {
        const jwt = new JWTService('test-secret');
        const tokens = await jwt.generateTokens('user-123', 'test@example.com', 'free', 'ua-hash');

        assertTrue(!!tokens.accessToken, 'Should have access token');
        assertTrue(!!tokens.refreshToken, 'Should have refresh token');
        assertTrue(tokens.expiresIn > 0, 'Should have expiration time');
    });

    harness.it('tokens should be valid JWT format', async () => {
        const jwt = new JWTService('test-secret');
        const tokens = await jwt.generateTokens('user-123', 'test@example.com', 'free', 'ua-hash');

        const accessParts = tokens.accessToken.split('.');
        const refreshParts = tokens.refreshToken.split('.');

        assertTrue(accessParts.length === 3, 'Access token should have 3 parts');
        assertTrue(refreshParts.length === 3, 'Refresh token should have 3 parts');
    });

    harness.it('should include correct payload data', async () => {
        const jwt = new JWTService('test-secret');
        const tokens = await jwt.generateTokens('user-123', 'test@example.com', 'paid', 'ua-hash');

        const payload = await jwt.verify(tokens.accessToken);

        assertEqual(payload.sub, 'user-123', 'Should have correct user ID');
        assertEqual(payload.email, 'test@example.com', 'Should have correct email');
        assertEqual(payload.tier, 'paid', 'Should have correct tier');
        assertEqual(payload.type, 'access', 'Should be access token type');
    });

    harness.it('should verify valid token', async () => {
        const jwt = new JWTService('test-secret');
        const tokens = await jwt.generateTokens('user-123', 'test@example.com', 'free', 'ua-hash');

        const payload = await jwt.verify(tokens.accessToken);
        assertTrue(payload !== null, 'Valid token should verify');
        assertEqual(payload.sub, 'user-123', 'Should extract user ID');
    });

    harness.it('should reject invalid signature', async () => {
        const jwt1 = new JWTService('secret-1');
        const jwt2 = new JWTService('secret-2');

        const tokens = await jwt1.generateTokens('user-123', 'test@example.com', 'free', 'ua-hash');
        const payload = await jwt2.verify(tokens.accessToken);

        assertTrue(payload === null, 'Token with wrong secret should not verify');
    });

    harness.it('should reject malformed token', async () => {
        const jwt = new JWTService('test-secret');
        const payload = await jwt.verify('invalid.token.format');
        assertTrue(payload === null, 'Malformed token should not verify');
    });

    harness.it('should reject expired token', async () => {
        const jwt = new JWTService('test-secret');

        const expiredPayload = {
            sub: 'user-123',
            iat: Date.now() - 100000,
            exp: Date.now() - 1000,
            type: 'access'
        };

        const token = await jwt.sign(expiredPayload);
        const payload = await jwt.verify(token);

        assertTrue(payload === null, 'Expired token should not verify');
    });

    harness.it('should revoke token', async () => {
        const kv = new MockKV();
        const jwt = new JWTService('test-secret', kv);

        // Create token with jti for revocation testing
        const jti = jwt.generateTokenId();
        const payload = {
            sub: 'user-123',
            email: 'test@example.com',
            tier: 'free',
            iat: Date.now(),
            exp: Date.now() + 15 * 60 * 1000,
            type: 'access',
            jti
        };
        const token = await jwt.sign(payload);

        const verified = await jwt.verify(token);
        assertTrue(verified !== null, 'Token should verify before revocation');

        await jwt.revoke(jti, 3600000);

        const revokedPayload = await jwt.verify(token);
        assertTrue(revokedPayload === null, 'Revoked token should not verify');
    });

    harness.it('should throw clear error when secret is missing', async () => {
        const jwt = new JWTService(undefined);

        let error = null;
        try {
            await jwt.generateTokens('user-123', 'a@b.com', 'free', 'ua');
        } catch (e) {
            error = e;
        }

        assertTrue(error !== null, 'Signing without a secret must throw');
        assertTrue(error.message.includes('JWT_SECRET'), 'Error should name the missing secret');
    });

    harness.it('should throw error without KV', async () => {
        const jwt = new JWTService('test-secret');

        let error = null;
        try {
            await jwt.revoke('token-id', 3600000);
        } catch (e) {
            error = e;
        }

        assertTrue(error !== null, 'Should throw error without KV');
        assertTrue(error.message.includes('KV'), 'Error should mention KV');
    });

    harness.it('should extract token from Bearer header', () => {
        const jwt = new JWTService('test-secret');
        const token = jwt.extractFromHeader('Bearer my-token-123');
        assertEqual(token, 'my-token-123', 'Should extract token');
    });

    harness.it('should return null for invalid header', () => {
        const jwt = new JWTService('test-secret');
        assertTrue(jwt.extractFromHeader('Basic credentials') === null);
        assertTrue(jwt.extractFromHeader(null) === null);
        assertTrue(jwt.extractFromHeader('') === null);
    });

    harness.it('should generate unique token IDs', () => {
        const jwt = new JWTService('test-secret');
        const id1 = jwt.generateTokenId();
        const id2 = jwt.generateTokenId();

        assertTrue(id1 !== id2, 'Token IDs should be unique');
        assertEqual(id1.length, 32, 'Token ID should be 32 hex chars');
    });

    harness.it('should encode and decode base64url correctly', () => {
        const jwt = new JWTService('test-secret');
        const original = '{"test":"data"}';
        const encoded = jwt.base64UrlEncode(original);
        const decoded = jwt.base64UrlDecode(encoded);

        assertEqual(decoded, original, 'Should round-trip correctly');
    });

    harness.it('should use URL-safe characters in base64url', () => {
        const jwt = new JWTService('test-secret');
        const encoded = jwt.base64UrlEncode('test+data/test');

        assertFalse(encoded.includes('+'), 'Should not contain +');
        assertFalse(encoded.includes('/'), 'Should not contain /');
        assertFalse(encoded.includes('='), 'Should not contain padding');
    });
});

    harness.run().then(passed => process.exit(passed ? 0 : 1));
})();
