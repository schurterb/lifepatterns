/**
 * Pattern Tracker Cloudflare Worker
 * Phase 3: Backend Foundation
 * 
 * Handles API routing for authentication, push notifications, and data caching
 */

import { PasswordService } from './services/password.js';
import { JWTService } from './services/jwt.js';
import { AuthController } from './controllers/auth.js';
import { PushController } from './controllers/push.js';
import { DataController } from './controllers/data.js';
import { AccountController } from './controllers/account.js';
import { SubscriptionController } from './controllers/subscription.js';
import { SyncController } from './controllers/sync.js';
import { AIController } from './controllers/ai.js';
import { RateLimiter } from './middleware/rate-limiter.js';

/**
 * Main Worker entry point
 */
export default {
    async requireAuth(request, jwtService) {
        const authHeader = request.headers.get('Authorization');
        const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
        
        if (!token) {
            const cookie = request.headers.get('Cookie');
            const match = cookie?.match(/access_token=([^;]+)/);
            if (match) {
                const payload = await jwtService.verify(match[1]);
                return payload?.sub || null;
            }
            return null;
        }

        const payload = await jwtService.verify(token);
        return payload?.sub || null;
    },

    authError(corsHeaders) {
        return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
    },

    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;
        const method = request.method;

        // CORS headers for all responses
        const corsHeaders = {
            'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Max-Age': '86400',
        };

        // Handle CORS preflight
        if (method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: corsHeaders });
        }

        // Initialize services
        const jwtService = new JWTService(env.JWT_SECRET, env.TOKEN_KV);
        const rateLimiter = new RateLimiter(env.RATE_LIMIT_KV);

        // Initialize controllers
        const authController = new AuthController(env.DB, jwtService, rateLimiter);
        const pushController = new PushController(env.DB, jwtService);
        const dataController = new DataController(env.DB, env.EXTERNAL_KV);
        const accountController = new AccountController(env.DB, jwtService);
        const subscriptionController = new SubscriptionController(env);
        const syncController = new SyncController(env);
        const aiController = new AIController(env);

        try {
            // Route request to appropriate handler
            let response;

            // Health check
            if (path === '/health' && method === 'GET') {
                response = jsonResponse({ status: 'ok', version: '3.0.0' });
            }

            // Authentication routes
            else if (path === '/auth/register' && method === 'POST') {
                response = await authController.register(request);
            }
            else if (path === '/auth/login' && method === 'POST') {
                response = await authController.login(request);
            }
            else if (path === '/auth/logout' && method === 'POST') {
                response = await authController.logout(request);
            }
            else if (path === '/auth/refresh' && method === 'POST') {
                response = await authController.refresh(request);
            }

            // Push notification routes
            else if (path === '/push/subscribe' && method === 'POST') {
                response = await pushController.subscribe(request);
            }
            else if (path === '/push/unsubscribe' && method === 'DELETE') {
                response = await pushController.unsubscribe(request);
            }

            // Data routes (weather, geomagnetic)
            else if (path === '/data/weather' && method === 'GET') {
                response = await dataController.getWeather(request);
            }
            else if (path === '/data/geomagnetic' && method === 'GET') {
                response = await dataController.getGeomagnetic(request);
            }

            // Account management routes
            else if (path === '/account' && method === 'GET') {
                response = await accountController.get(request);
            }
            else if (path === '/account' && method === 'PUT') {
                response = await accountController.update(request);
            }
            else if (path === '/account' && method === 'DELETE') {
                response = await accountController.delete(request);
            }
            else if (path === '/account/export' && method === 'GET') {
                response = await accountController.export(request);
            }

            // Subscription routes
            else if (path === '/subscription/status' && method === 'GET') {
                const userId = await this.requireAuth(request, jwtService);
                if (!userId) return this.authError(corsHeaders);
                response = await subscriptionController.getStatus(userId);
            }
            else if (path === '/subscription/create' && method === 'POST') {
                const userId = await this.requireAuth(request, jwtService);
                if (!userId) return this.authError(corsHeaders);
                response = await subscriptionController.createCheckout(request, userId);
            }
            else if (path === '/subscription/cancel' && method === 'POST') {
                const userId = await this.requireAuth(request, jwtService);
                if (!userId) return this.authError(corsHeaders);
                response = await subscriptionController.cancel(userId);
            }
            else if (path === '/subscription/webhook' && method === 'POST') {
                response = await subscriptionController.handleWebhook(request);
            }

            // Sync routes (paid tier)
            else if (path === '/sync/upload' && method === 'POST') {
                const userId = await this.requireAuth(request, jwtService);
                if (!userId) return this.authError(corsHeaders);
                response = await syncController.upload(request, userId);
            }
            else if (path === '/sync/download' && method === 'GET') {
                const userId = await this.requireAuth(request, jwtService);
                if (!userId) return this.authError(corsHeaders);
                response = await syncController.download(userId);
            }
            else if (path === '/sync/status' && method === 'GET') {
                const userId = await this.requireAuth(request, jwtService);
                if (!userId) return this.authError(corsHeaders);
                response = await syncController.getStatus(userId);
            }

            // AI routes (paid tier)
            else if (path === '/ai/insights' && method === 'POST') {
                const userId = await this.requireAuth(request, jwtService);
                if (!userId) return this.authError(corsHeaders);
                response = await aiController.handleInsights(request, userId);
            }
            else if (path === '/ai/food-analysis' && method === 'POST') {
                const userId = await this.requireAuth(request, jwtService);
                if (!userId) return this.authError(corsHeaders);
                response = await aiController.handleFoodAnalysis(request, userId);
            }

            // 404 for unknown routes
            else {
                response = jsonResponse(
                    { success: false, error: 'Not found' },
                    404
                );
            }

            // Add CORS headers to response
            const headers = new Headers(response.headers);
            Object.entries(corsHeaders).forEach(([key, value]) => {
                headers.set(key, value);
            });

            return new Response(response.body, {
                status: response.status,
                headers
            });

        } catch (error) {
            console.error('Worker error:', error);
            return jsonResponse(
                { success: false, error: 'Internal server error' },
                500,
                corsHeaders
            );
        }
    },

    /**
     * Scheduled handler for cron triggers
     * - Send push notifications at configured times
     * - Refresh cached environmental data
     */
    async scheduled(event, env, ctx) {
        const cron = event.cron;
        
        // Hourly: Send push reminders
        if (cron === '0 * * * *') {
            await this.sendPushReminders(env);
        }

        // Daily: Refresh environmental data cache
        if (cron === '0 0 * * *') {
            await this.refreshEnvironmentalCache(env);
        }
    },

    /**
     * Send push notifications to users with matching reminder times
     */
    async sendPushReminders(env) {
        const currentHour = new Date().getHours();
        const reminderTime = `${currentHour.toString().padStart(2, '0')}:00`;

        // Query users with this reminder time
        const users = await env.DB.prepare(
            'SELECT id FROM users WHERE reminder_time = ?'
        ).bind(reminderTime).all();

        // TODO: Integrate with PushForge to send notifications
        console.log(`Sending reminders to ${users.results.length} users`);
    },

    /**
     * Refresh cached weather and geomagnetic data
     */
    async refreshEnvironmentalCache(env) {
        // TODO: Fetch from Open-Meteo and NOAA APIs
        console.log('Refreshing environmental data cache');
    }
};

/**
 * Helper: Create JSON response
 */
function jsonResponse(data, status = 200, extraHeaders = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...extraHeaders
        }
    });
}
