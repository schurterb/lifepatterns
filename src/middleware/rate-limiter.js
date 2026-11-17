/**
 * Rate Limiter Middleware
 * Uses KV for distributed rate limiting
 */

/**
 * RateLimiter provides rate limiting functionality
 */
export class RateLimiter {
    /**
     * @param {KVNamespace} kv - KV namespace for rate limit storage
     */
    constructor(kv) {
        this.kv = kv;
    }

    /**
     * Check if rate limit is exceeded
     * @param {string} key - Rate limit key (e.g., 'login:ip-address')
     * @param {number} maxRequests - Maximum requests allowed
     * @param {number} windowMs - Time window in milliseconds
     * @returns {Promise<boolean>} - True if exceeded
     */
    async isExceeded(key, maxRequests, windowMs) {
        if (!this.kv) {
            // If no KV, skip rate limiting
            return false;
        }

        const current = await this.get(key);
        return current >= maxRequests;
    }

    /**
     * Increment rate limit counter
     * @param {string} key - Rate limit key
     * @param {number} windowMs - Time window in milliseconds (default 60s)
     * @returns {Promise<number>} - New counter value
     */
    async increment(key, windowMs = 60000) {
        if (!this.kv) {
            return 0;
        }

        const current = await this.get(key);
        const newValue = current + 1;

        await this.kv.put(`ratelimit:${key}`, String(newValue), {
            expirationTtl: Math.ceil(windowMs / 1000)
        });

        return newValue;
    }

    /**
     * Get current counter value
     * @param {string} key - Rate limit key
     * @returns {Promise<number>} - Current value
     */
    async get(key) {
        if (!this.kv) {
            return 0;
        }

        const value = await this.kv.get(`ratelimit:${key}`);
        return value ? parseInt(value, 10) : 0;
    }

    /**
     * Reset rate limit counter
     * @param {string} key - Rate limit key
     */
    async reset(key) {
        if (!this.kv) {
            return;
        }

        await this.kv.delete(`ratelimit:${key}`);
    }

    /**
     * Create rate limit headers for response
     * @param {string} key - Rate limit key
     * @param {number} maxRequests - Maximum requests allowed
     * @param {number} windowMs - Time window in milliseconds
     * @returns {Promise<object>} - Headers object
     */
    async getHeaders(key, maxRequests, windowMs) {
        const current = await this.get(key);
        const remaining = Math.max(0, maxRequests - current);

        return {
            'X-RateLimit-Limit': String(maxRequests),
            'X-RateLimit-Remaining': String(remaining),
            'X-RateLimit-Reset': String(Math.ceil(windowMs / 1000))
        };
    }
}
