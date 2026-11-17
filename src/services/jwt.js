/**
 * JWT Service for Pattern Tracker
 * Handles JWT creation, validation, and refresh for Cloudflare Workers
 * Uses Web Crypto API for HS256 signing
 */

// Token expiration times
const ACCESS_TOKEN_EXPIRY = 15 * 60 * 1000;    // 15 minutes
const REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * JWTService handles token lifecycle management
 */
export class JWTService {
    /**
     * @param {string} secret - JWT signing secret (from environment)
     * @param {KVNamespace} kv - KV namespace for token revocation
     */
    constructor(secret, kv = null) {
        this.secret = secret;
        this.kv = kv;
    }

    /**
     * Generate access and refresh tokens for a user
     * @param {string} userId - User ID
     * @param {string} email - User email
     * @param {string} tier - User tier (free/paid)
     * @param {string} userAgentHash - Hash of user agent for token binding
     * @returns {Promise<{ accessToken: string, refreshToken: string, expiresIn: number }>}
     */
    async generateTokens(userId, email, tier, userAgentHash) {
        const now = Date.now();

        // Access token payload
        const accessPayload = {
            sub: userId,
            email,
            tier,
            ua: userAgentHash,
            iat: now,
            exp: now + ACCESS_TOKEN_EXPIRY,
            type: 'access'
        };

        // Refresh token payload
        const refreshPayload = {
            sub: userId,
            ua: userAgentHash,
            iat: now,
            exp: now + REFRESH_TOKEN_EXPIRY,
            type: 'refresh'
        };

        const accessToken = await this.sign(accessPayload);
        const refreshToken = await this.sign(refreshPayload);

        return {
            accessToken,
            refreshToken,
            expiresIn: ACCESS_TOKEN_EXPIRY
        };
    }

    /**
     * Sign a JWT payload
     * @param {object} payload - JWT payload
     * @returns {Promise<string>} - Signed JWT
     */
    async sign(payload) {
        const header = { alg: 'HS256', typ: 'JWT' };
        
        const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
        const encodedPayload = this.base64UrlEncode(JSON.stringify(payload));
        
        const message = `${encodedHeader}.${encodedPayload}`;
        const signature = await this.hmacSha256(message, this.secret);
        
        return `${message}.${signature}`;
    }

    /**
     * Verify and decode a JWT
     * @param {string} token - JWT to verify
     * @returns {Promise<object|null>} - Decoded payload or null if invalid
     */
    async verify(token) {
        try {
            const parts = token.split('.');
            if (parts.length !== 3) {
                return null;
            }

            const [encodedHeader, encodedPayload, signature] = parts;
            const message = `${encodedHeader}.${encodedPayload}`;

            // Verify signature
            const expectedSignature = await this.hmacSha256(message, this.secret);
            if (!this.constantTimeEquals(signature, expectedSignature)) {
                return null;
            }

            // Decode payload
            const payload = JSON.parse(this.base64UrlDecode(encodedPayload));

            // Check expiration
            if (payload.exp && payload.exp < Date.now()) {
                return null;
            }

            // Check if revoked (if KV available)
            if (this.kv && payload.jti) {
                const revoked = await this.kv.get(`revoked:${payload.jti}`);
                if (revoked) {
                    return null;
                }
            }

            return payload;
        } catch (error) {
            console.error('JWT verification error:', error);
            return null;
        }
    }

    /**
     * Revoke a token by adding to revocation list
     * @param {string} tokenId - Token ID (jti claim)
     * @param {number} ttl - Time to live in milliseconds
     * @returns {Promise<void>}
     */
    async revoke(tokenId, ttl) {
        if (!this.kv) {
            throw new Error('KV namespace required for token revocation');
        }

        // Store in KV with TTL
        await this.kv.put(`revoked:${tokenId}`, '1', {
            expirationTtl: Math.ceil(ttl / 1000)
        });
    }

    /**
     * Generate a unique token ID
     */
    generateTokenId() {
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        return Array.from(bytes)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    /**
     * HMAC-SHA256 signing using Web Crypto API
     */
    async hmacSha256(message, secret) {
        if (!secret) {
            throw new Error('JWT_SECRET is not configured');
        }
        const encoder = new TextEncoder();
        const keyData = encoder.encode(secret);
        
        const key = await crypto.subtle.importKey(
            'raw',
            keyData,
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        );

        const signature = await crypto.subtle.sign(
            'HMAC',
            key,
            encoder.encode(message)
        );

        return this.base64UrlEncode(new Uint8Array(signature));
    }

    /**
     * Base64URL encode (JWT variant)
     */
    base64UrlEncode(input) {
        let str;
        if (typeof input === 'string') {
            str = btoa(input);
        } else {
            // Uint8Array
            let binary = '';
            for (let i = 0; i < input.length; i++) {
                binary += String.fromCharCode(input[i]);
            }
            str = btoa(binary);
        }
        return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    /**
     * Base64URL decode
     */
    base64UrlDecode(str) {
        // Restore padding
        str = str.replace(/-/g, '+').replace(/_/g, '/');
        while (str.length % 4) {
            str += '=';
        }
        return atob(str);
    }

    /**
     * Constant-time string comparison
     */
    constantTimeEquals(a, b) {
        if (a.length !== b.length) {
            return false;
        }
        let result = 0;
        for (let i = 0; i < a.length; i++) {
            result |= a.charCodeAt(i) ^ b.charCodeAt(i);
        }
        return result === 0;
    }

    /**
     * Extract token from Authorization header
     * @param {string} authHeader - Authorization header value
     * @returns {string|null} - Token or null
     */
    extractFromHeader(authHeader) {
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return null;
        }
        return authHeader.slice(7);
    }

    /**
     * Create HttpOnly cookie options for token storage
     * @param {boolean} isRefresh - Is this a refresh token cookie?
     * @returns {object} - Cookie options
     */
    static getCookieOptions(isRefresh = false) {
        return {
            httpOnly: true,
            secure: true,
            sameSite: 'Strict',
            path: '/',
            maxAge: isRefresh ? REFRESH_TOKEN_EXPIRY / 1000 : ACCESS_TOKEN_EXPIRY / 1000
        };
    }
}
