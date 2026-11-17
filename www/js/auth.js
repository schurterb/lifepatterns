'use strict';

/**
 * AuthService - Client-side authentication and push notification management
 * Communicates with the Cloudflare Worker backend (Phase 3).
 *
 * Token storage: HttpOnly cookies managed by the browser automatically.
 * Only non-sensitive user info (id, email, tier) is cached in localStorage.
 */

const AuthService = {
    // Override this with the Worker URL when deployed cross-origin
    // e.g., window.__PATTERN_TRACKER_API = 'https://pattern-tracker.workers.dev'
    _apiBase: '',

    getApiBase() {
        return window.__PATTERN_TRACKER_API || this._apiBase;
    },

    // -------------------------------------------------------------------------
    // Authentication
    // -------------------------------------------------------------------------

    async login(email, password) {
        const { ok, data } = await this._request('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });
        if (ok && data.success) {
            this._saveUserLocal(data.user);
            return { success: true, user: data.user };
        }
        return { success: false, error: data.error || 'Login failed' };
    },

    async register(email, password) {
        const { ok, data } = await this._request('/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });
        if (ok && data.success) {
            this._saveUserLocal(data.user);
            return { success: true, user: data.user };
        }
        return { success: false, error: data.error || 'Registration failed' };
    },

    async logout() {
        try {
            await fetch(`${this.getApiBase()}/auth/logout`, {
                method: 'POST',
                credentials: 'include',
            });
        } catch (e) {
            // Ignore network errors — we still clear local state
        } finally {
            this._clearUserLocal();
        }
    },

    // Silent token refresh using the refresh cookie
    async refresh() {
        try {
            const res = await fetch(`${this.getApiBase()}/auth/refresh`, {
                method: 'POST',
                credentials: 'include',
            });
            return res.ok;
        } catch (e) {
            return false;
        }
    },

    // Check session by calling GET /account. Retries once after refresh on 401.
    // Skips the network entirely when no local session exists, clears stale
    // local state on definitive 401, and falls back to cache when offline.
    async checkSession() {
        const cached = this._loadUserLocal();
        if (!cached) return null;

        const first = await this._fetchAccountStatus();
        if (first.account) return first.account;
        if (first.status === 0 || first.status >= 500) return cached;

        if (first.status === 401 && await this.refresh()) {
            const second = await this._fetchAccountStatus();
            if (second.account) return second.account;
            if (second.status === 0 || second.status >= 500) return cached;
        }

        this._clearUserLocal();
        return null;
    },

    // -------------------------------------------------------------------------
    // Account Management
    // -------------------------------------------------------------------------

    async getAccount() {
        return this._fetchAccount();
    },

    async updateAccount(updates) {
        const { ok, data } = await this._request('/account', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates),
        });
        if (ok && data.success) {
            const current = this._loadUserLocal() || {};
            this._saveUserLocal({ ...current, ...updates });
            return { success: true };
        }
        return { success: false, error: data.error || 'Update failed' };
    },

    async deleteAccount() {
        const { ok, data } = await this._request('/account', { method: 'DELETE' });
        if (ok && data.success) {
            this._clearUserLocal();
            return { success: true };
        }
        return { success: false, error: data.error || 'Account deletion failed' };
    },

    async exportAccountData() {
        try {
            const res = await fetch(`${this.getApiBase()}/account/export`, {
                credentials: 'include',
            });
            if (res.ok) {
                return await res.blob();
            }
            return null;
        } catch (e) {
            return null;
        }
    },

    // -------------------------------------------------------------------------
    // Push Notifications
    // -------------------------------------------------------------------------

    isPushSupported() {
        return 'serviceWorker' in navigator && 'PushManager' in window;
    },

    async getPushPermission() {
        if (!this.isPushSupported()) return 'unsupported';
        return Notification.permission;
    },

    async requestPushPermission() {
        if (!this.isPushSupported()) return 'unsupported';
        try {
            return await Notification.requestPermission();
        } catch (e) {
            return 'denied';
        }
    },

    async getPushSubscription() {
        if (!this.isPushSupported()) return null;
        try {
            const reg = await navigator.serviceWorker.ready;
            return await reg.pushManager.getSubscription();
        } catch (e) {
            return null;
        }
    },

    async subscribePush(vapidPublicKey) {
        if (!this.isPushSupported()) {
            return { success: false, error: 'Push not supported on this device' };
        }
        try {
            const permission = await this.requestPushPermission();
            if (permission !== 'granted') {
                return { success: false, error: 'Notification permission denied' };
            }

            const reg = await navigator.serviceWorker.ready;
            const applicationServerKey = this._urlBase64ToUint8Array(vapidPublicKey);
            const subscription = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey,
            });

            const sub = subscription.toJSON();
            const res = await fetch(`${this.getApiBase()}/push/subscribe`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    endpoint: sub.endpoint,
                    keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
                }),
            });
            const data = await res.json();
            return data.success ? { success: true } : { success: false, error: data.error };
        } catch (e) {
            return { success: false, error: e.message || 'Push subscription failed' };
        }
    },

    async unsubscribePush() {
        try {
            const subscription = await this.getPushSubscription();
            if (subscription) {
                await subscription.unsubscribe();
            }
            const res = await fetch(`${this.getApiBase()}/push/unsubscribe`, {
                method: 'DELETE',
                credentials: 'include',
            });
            const data = await res.json();
            return data.success ? { success: true } : { success: false, error: data.error };
        } catch (e) {
            return { success: false, error: e.message || 'Unsubscribe failed' };
        }
    },

    // -------------------------------------------------------------------------
    // Local Storage Helpers
    // -------------------------------------------------------------------------

    _saveUserLocal(user) {
        try {
            localStorage.setItem('ptAuthUser', JSON.stringify({
                id: user.id,
                email: user.email,
                tier: user.tier || 'free',
            }));
        } catch (e) {
            // Ignore storage errors
        }
    },

    _loadUserLocal() {
        try {
            const stored = localStorage.getItem('ptAuthUser');
            return stored ? JSON.parse(stored) : null;
        } catch (e) {
            return null;
        }
    },

    _clearUserLocal() {
        try {
            localStorage.removeItem('ptAuthUser');
        } catch (e) {
            // Ignore
        }
    },

    // -------------------------------------------------------------------------
    // Private Helpers
    // -------------------------------------------------------------------------

    // Returns { ok, status, data }. Never throws.
    async _request(path, options = {}) {
        let res;
        try {
            res = await fetch(`${this.getApiBase()}${path}`, { credentials: 'include', ...options });
        } catch (e) {
            return { ok: false, status: 0, data: { error: 'Network error. Please check your connection.' } };
        }
        try {
            return { ok: res.ok, status: res.status, data: await res.json() };
        } catch (e) {
            return { ok: false, status: res.status, data: { error: `Server returned an unexpected response (HTTP ${res.status}). Please try again later.` } };
        }
    },

    async _fetchAccount() {
        const { account } = await this._fetchAccountStatus();
        return account;
    },

    // Returns { status, account }. status 0 = network failure.
    async _fetchAccountStatus() {
        const { ok, status, data } = await this._request('/account');
        if (ok && data.success && data.account) {
            this._saveUserLocal(data.account);
            return { status, account: data.account };
        }
        return { status, account: null };
    },

    // Converts a base64url-encoded VAPID public key to a Uint8Array
    /* istanbul ignore next */
    _urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = atob(base64);
        return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
    },
};

// Expose as global for browser scripts and Node.js test environments
/* global globalThis */
globalThis.AuthService = AuthService;
