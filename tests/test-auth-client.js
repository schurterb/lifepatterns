#!/usr/bin/env node
'use strict';

/**
 * Unit tests for AuthService (client-side)
 * Tests localStorage helpers, API call construction, and push utilities
 */

require('./mock-browser');
const { TestHarness, assertEqual, assertTrue, assertFalse } = require('./test-harness');

const harness = new TestHarness();

// ---------------------------------------------------------------------------
// Load AuthService into the test environment
// ---------------------------------------------------------------------------
// auth.js assigns to globalThis.AuthService so we can simply require it.
const path = require('path');
require(path.join(__dirname, '../www/js/auth.js'));

// ---------------------------------------------------------------------------
// Mock fetch for API call tests
// ---------------------------------------------------------------------------

function mockFetch(responseData, status = 200, ok = true) {
    global.fetch = async () => ({
        ok,
        status,
        json: async () => responseData,
        blob: async () => new Blob([JSON.stringify(responseData)]),
    });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

harness.describe('AuthService', () => {

    // --- localStorage helpers ---

    harness.it('should save and load user from localStorage', () => {
        const user = { id: 'u1', email: 'test@example.com', tier: 'free' };
        AuthService._saveUserLocal(user);
        const loaded = AuthService._loadUserLocal();
        assertEqual(loaded.id, 'u1');
        assertEqual(loaded.email, 'test@example.com');
        assertEqual(loaded.tier, 'free');
    });

    harness.it('should clear user from localStorage', () => {
        AuthService._saveUserLocal({ id: 'u1', email: 'a@b.com', tier: 'free' });
        AuthService._clearUserLocal();
        const loaded = AuthService._loadUserLocal();
        assertTrue(loaded === null, 'User should be null after clear');
    });

    harness.it('should return null when no user stored', () => {
        AuthService._clearUserLocal();
        const loaded = AuthService._loadUserLocal();
        assertTrue(loaded === null);
    });

    harness.it('should handle corrupted localStorage gracefully', () => {
        localStorage.setItem('ptAuthUser', 'not-valid-json{{{');
        const loaded = AuthService._loadUserLocal();
        assertTrue(loaded === null, 'Should return null on parse error');
    });

    // --- login ---

    harness.it('should return user on successful login', async () => {
        mockFetch({ success: true, user: { id: 'u2', email: 'user@test.com', tier: 'free' } }, 200, true);
        const result = await AuthService.login('user@test.com', 'Password123');
        assertTrue(result.success, 'Login should succeed');
        assertEqual(result.user.email, 'user@test.com');
    });

    harness.it('should return error on failed login', async () => {
        mockFetch({ success: false, error: 'Invalid credentials' }, 401, false);
        const result = await AuthService.login('user@test.com', 'wrongpass');
        assertFalse(result.success, 'Login should fail');
        assertEqual(result.error, 'Invalid credentials');
    });

    harness.it('should return network error when fetch throws', async () => {
        global.fetch = async () => { throw new Error('Network failure'); };
        const result = await AuthService.login('user@test.com', 'Password123');
        assertFalse(result.success);
        assertTrue(result.error.includes('Network error'));
    });

    // --- register ---

    harness.it('should return user on successful registration', async () => {
        mockFetch({ success: true, user: { id: 'u3', email: 'new@test.com', tier: 'free' } }, 201, true);
        const result = await AuthService.register('new@test.com', 'Password123');
        assertTrue(result.success);
        assertEqual(result.user.email, 'new@test.com');
    });

    harness.it('should return error on duplicate email registration', async () => {
        mockFetch({ success: false, error: 'Email already registered' }, 409, false);
        const result = await AuthService.register('existing@test.com', 'Password123');
        assertFalse(result.success);
        assertEqual(result.error, 'Email already registered');
    });

    harness.it('should report unexpected response when register gets HTML', async () => {
        global.fetch = async () => ({
            ok: true,
            status: 200,
            json: async () => { throw new SyntaxError('Unexpected token <'); },
        });
        const result = await AuthService.register('new@test.com', 'Password123');
        assertFalse(result.success);
        assertFalse(result.error.includes('Network error'), 'HTML reply is not a network error');
        assertTrue(result.error.includes('HTTP 200'));
    });

    harness.it('should return network error when register fetch throws', async () => {
        global.fetch = async () => { throw new Error('Network failure'); };
        const result = await AuthService.register('new@test.com', 'Password123');
        assertTrue(result.error.includes('Network error'));
    });

    // --- logout ---

    harness.it('should clear local user on logout', async () => {
        AuthService._saveUserLocal({ id: 'u1', email: 'a@b.com', tier: 'free' });
        mockFetch({ success: true }, 200, true);
        await AuthService.logout();
        const loaded = AuthService._loadUserLocal();
        assertTrue(loaded === null, 'User should be cleared after logout');
    });

    harness.it('should clear local user even if logout API fails', async () => {
        AuthService._saveUserLocal({ id: 'u1', email: 'a@b.com', tier: 'free' });
        global.fetch = async () => { throw new Error('Network failure'); };
        await AuthService.logout();
        const loaded = AuthService._loadUserLocal();
        assertTrue(loaded === null, 'User should be cleared even on network failure');
    });

    // --- checkSession ---

    harness.it('should skip network calls when no cached user exists', async () => {
        AuthService._clearUserLocal();
        let fetchCalls = 0;
        global.fetch = async () => { fetchCalls++; return { ok: true, status: 200, json: async () => ({}) }; };
        const result = await AuthService.checkSession();
        assertEqual(result, null);
        assertEqual(fetchCalls, 0, 'anonymous visitor should not hit the API');
    });

    harness.it('should return account when session is valid', async () => {
        AuthService._saveUserLocal({ id: 'u1', email: 'a@b.com', tier: 'free' });
        mockFetch({ success: true, account: { id: 'u1', email: 'a@b.com', tier: 'free' } }, 200, true);
        const result = await AuthService.checkSession();
        assertEqual(result.email, 'a@b.com');
    });

    harness.it('should clear cached user when account and refresh both 401', async () => {
        AuthService._saveUserLocal({ id: 'u1', email: 'a@b.com', tier: 'free' });
        global.fetch = async (url) => {
            const status = url.includes('/auth/refresh') || url.includes('/account') ? 401 : 200;
            return { ok: false, status, json: async () => ({ success: false, error: 'Unauthorized' }) };
        };
        const result = await AuthService.checkSession();
        assertEqual(result, null, 'expired session should clear cache');
        assertEqual(AuthService._loadUserLocal(), null);
    });

    harness.it('should keep cached user when offline', async () => {
        const user = { id: 'u1', email: 'a@b.com', tier: 'free' };
        AuthService._saveUserLocal(user);
        global.fetch = async () => { throw new Error('Network failure'); };
        const result = await AuthService.checkSession();
        assertEqual(result.email, 'a@b.com', 'offline should fall back to cached user');
    });

    // --- refresh ---

    harness.it('should return true on successful refresh', async () => {
        mockFetch({ success: true }, 200, true);
        const result = await AuthService.refresh();
        assertTrue(result);
    });

    harness.it('should return false on failed refresh', async () => {
        mockFetch({ success: false }, 401, false);
        const result = await AuthService.refresh();
        assertFalse(result);
    });

    // --- deleteAccount ---

    harness.it('should clear local user on account deletion', async () => {
        AuthService._saveUserLocal({ id: 'u1', email: 'a@b.com', tier: 'free' });
        mockFetch({ success: true }, 200, true);
        const result = await AuthService.deleteAccount();
        assertTrue(result.success);
        assertTrue(AuthService._loadUserLocal() === null);
    });

    // --- push support ---

    harness.it('should detect push support correctly', () => {
        // In Node.js test environment serviceWorker and PushManager are not available
        const supported = AuthService.isPushSupported();
        assertFalse(supported, 'Push should not be supported in Node.js environment');
    });

    // --- VAPID key conversion ---

    harness.it('should convert base64url to Uint8Array', () => {
        const key = 'BNcr2P5gVnWF2U5X1gFpq9lF-b1zQW4c_zEhcYL3wRpAB3Wr0w';
        const result = AuthService._urlBase64ToUint8Array(key);
        assertTrue(result instanceof Uint8Array, 'Should return Uint8Array');
        assertTrue(result.length > 0, 'Should have bytes');
    });

    // --- API base URL ---

    harness.it('should use window.__PATTERN_TRACKER_API if set', () => {
        window.__PATTERN_TRACKER_API = 'https://api.example.com';
        assertEqual(AuthService.getApiBase(), 'https://api.example.com');
        delete window.__PATTERN_TRACKER_API;
    });

    harness.it('should default to empty string for same-origin requests', () => {
        delete window.__PATTERN_TRACKER_API;
        assertEqual(AuthService.getApiBase(), '');
    });
});

harness.run().then(passed => process.exit(passed ? 0 : 1));
