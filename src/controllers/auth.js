/**
 * Authentication Controller
 * Handles user registration, login, logout, and token refresh
 */

import { PasswordService } from '../services/password.js';

/**
 * AuthController handles authentication endpoints
 */
export class AuthController {
    /**
     * @param {D1Database} db - D1 database instance
     * @param {JWTService} jwtService - JWT service instance
     * @param {RateLimiter} rateLimiter - Rate limiter instance
     */
    constructor(db, jwtService, rateLimiter) {
        this.db = db;
        this.jwtService = jwtService;
        this.rateLimiter = rateLimiter;
    }

    /**
     * Register a new user
     * POST /auth/register
     */
    async register(request) {
        try {
            const body = await request.json();
            const { email, password } = body;

            // Validate input
            if (!email || !password) {
                return this.error('Email and password are required', 400);
            }

            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                return this.error('Invalid email format', 400);
            }

            // Validate password strength
            const passwordValidation = PasswordService.validate(password);
            if (!passwordValidation.valid) {
                return this.error(passwordValidation.errors.join(', '), 400);
            }

            // Check if user already exists
            const existing = await this.db.prepare(
                'SELECT id FROM users WHERE email = ?'
            ).bind(email.toLowerCase()).first();

            if (existing) {
                return this.error('Email already registered', 409);
            }

            // Hash password
            const passwordHash = await PasswordService.hash(password);

            // Generate user ID and tokens before inserting — if signing fails
            // (e.g. misconfigured secret), no orphaned user row is left behind
            const userId = crypto.randomUUID();
            const userAgentHash = await this.hashUserAgent(request);
            const tokens = await this.jwtService.generateTokens(
                userId,
                email.toLowerCase(),
                'free',
                userAgentHash
            );

            // Insert user
            const now = new Date().toISOString();
            await this.db.prepare(
                `INSERT INTO users (id, email, password_hash, tier, created_at, updated_at)
                 VALUES (?, ?, ?, 'free', ?, ?)`
            ).bind(userId, email.toLowerCase(), passwordHash, now, now).run();

            // Create response with HttpOnly cookies
            const response = this.json({
                success: true,
                user: {
                    id: userId,
                    email: email.toLowerCase(),
                    tier: 'free'
                }
            }, 201);

            // Set cookies
            this.setTokenCookies(response, tokens);

            return response;

        } catch (error) {
            console.error('Registration error:', error);
            return this.error('Registration failed', 500);
        }
    }

    /**
     * Login user
     * POST /auth/login
     */
    async login(request) {
        try {
            // Check rate limiting
            const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
            const rateLimitKey = `login:${clientIp}`;

            if (await this.rateLimiter.isExceeded(rateLimitKey, 5, 60000)) {
                return this.error('Too many login attempts. Please try again later.', 429);
            }

            const body = await request.json();
            const { email, password } = body;

            if (!email || !password) {
                return this.error('Email and password are required', 400);
            }

            // Find user
            const user = await this.db.prepare(
                'SELECT id, email, password_hash, tier FROM users WHERE email = ?'
            ).bind(email.toLowerCase()).first();

            if (!user) {
                // Use generic error to prevent email enumeration
                return this.error('Invalid credentials', 401);
            }

            // Verify password
            const valid = await PasswordService.verify(password, user.password_hash);
            if (!valid) {
                await this.rateLimiter.increment(rateLimitKey);
                return this.error('Invalid credentials', 401);
            }

            // Generate tokens
            const userAgentHash = await this.hashUserAgent(request);
            const tokens = await this.jwtService.generateTokens(
                user.id,
                user.email,
                user.tier,
                userAgentHash
            );

            // Update last login
            await this.db.prepare(
                'UPDATE users SET updated_at = ? WHERE id = ?'
            ).bind(new Date().toISOString(), user.id).run();

            const response = this.json({
                success: true,
                user: {
                    id: user.id,
                    email: user.email,
                    tier: user.tier
                }
            });

            this.setTokenCookies(response, tokens);

            return response;

        } catch (error) {
            console.error('Login error:', error);
            return this.error('Login failed', 500);
        }
    }

    /**
     * Logout user
     * POST /auth/logout
     */
    async logout(request) {
        try {
            const token = this.extractToken(request);
            if (!token) {
                return this.error('No token provided', 401);
            }

            // Verify and decode token
            const payload = await this.jwtService.verify(token);
            if (!payload) {
                return this.error('Invalid token', 401);
            }

            // Revoke token
            const ttl = payload.exp - Date.now();
            if (ttl > 0) {
                await this.jwtService.revoke(payload.jti || token.slice(-32), ttl);
            }

            const response = this.json({ success: true });

            // Clear cookies
            this.clearTokenCookies(response);

            return response;

        } catch (error) {
            console.error('Logout error:', error);
            return this.error('Logout failed', 500);
        }
    }

    /**
     * Refresh access token
     * POST /auth/refresh
     */
    async refresh(request) {
        try {
            // Get refresh token from cookie
            const cookie = request.headers.get('Cookie') || '';
            const refreshToken = this.extractCookie(cookie, 'refresh_token');

            if (!refreshToken) {
                return this.error('No refresh token', 401);
            }

            // Verify refresh token
            const payload = await this.jwtService.verify(refreshToken);
            if (!payload || payload.type !== 'refresh') {
                return this.error('Invalid refresh token', 401);
            }

            // Get user
            const user = await this.db.prepare(
                'SELECT id, email, tier FROM users WHERE id = ?'
            ).bind(payload.sub).first();

            if (!user) {
                return this.error('User not found', 401);
            }

            // Generate new tokens (rotate refresh token)
            const userAgentHash = await this.hashUserAgent(request);
            const tokens = await this.jwtService.generateTokens(
                user.id,
                user.email,
                user.tier,
                userAgentHash
            );

            // Revoke old refresh token
            const oldTtl = payload.exp - Date.now();
            if (oldTtl > 0) {
                await this.jwtService.revoke(payload.jti || refreshToken.slice(-32), oldTtl);
            }

            const response = this.json({ success: true });
            this.setTokenCookies(response, tokens);

            return response;

        } catch (error) {
            console.error('Token refresh error:', error);
            return this.error('Token refresh failed', 500);
        }
    }

    /**
     * Hash user agent for token binding
     */
    async hashUserAgent(request) {
        const ua = request.headers.get('User-Agent') || '';
        const encoder = new TextEncoder();
        const data = encoder.encode(ua);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
    }

    /**
     * Extract token from Authorization header or cookie
     */
    extractToken(request) {
        const authHeader = request.headers.get('Authorization');
        if (authHeader && authHeader.startsWith('Bearer ')) {
            return authHeader.slice(7);
        }

        const cookie = request.headers.get('Cookie') || '';
        return this.extractCookie(cookie, 'access_token');
    }

    /**
     * Extract value from cookie string
     */
    extractCookie(cookieString, name) {
        const cookies = cookieString.split(';');
        for (const cookie of cookies) {
            const [key, value] = cookie.trim().split('=');
            if (key === name) {
                return value;
            }
        }
        return null;
    }

    /**
     * Set HttpOnly cookies for tokens
     */
    setTokenCookies(response, tokens) {
        const accessCookie = `access_token=${tokens.accessToken}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${tokens.expiresIn / 1000}`;
        const refreshCookie = `refresh_token=${tokens.refreshToken}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${7 * 24 * 60 * 60}`;

        response.headers.append('Set-Cookie', accessCookie);
        response.headers.append('Set-Cookie', refreshCookie);
    }

    /**
     * Clear token cookies
     */
    clearTokenCookies(response) {
        const clearAccess = 'access_token=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0';
        const clearRefresh = 'refresh_token=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0';

        response.headers.append('Set-Cookie', clearAccess);
        response.headers.append('Set-Cookie', clearRefresh);
    }

    /**
     * Create JSON response
     */
    json(data, status = 200) {
        return new Response(JSON.stringify(data), {
            status,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    /**
     * Create error response
     */
    error(message, status = 400) {
        return this.json({ success: false, error: message }, status);
    }
}
