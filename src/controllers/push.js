/**
 * Push Notification Controller
 * Handles push subscription management
 */

/**
 * PushController handles push notification endpoints
 */
export class PushController {
    /**
     * @param {D1Database} db - D1 database instance
     * @param {JWTService} jwtService - JWT service instance
     */
    constructor(db, jwtService) {
        this.db = db;
        this.jwtService = jwtService;
    }

    /**
     * Subscribe to push notifications
     * POST /push/subscribe
     */
    async subscribe(request) {
        try {
            // Verify authentication
            const userId = await this.getUserId(request);
            if (!userId) {
                return this.error('Unauthorized', 401);
            }

            const body = await request.json();
            const { endpoint, keys } = body;

            if (!endpoint || !keys?.p256dh || !keys?.auth) {
                return this.error('Missing subscription data', 400);
            }

            // Generate subscription ID
            const subscriptionId = crypto.randomUUID();

            // Hash user agent for token binding
            const userAgentHash = await this.hashUserAgent(request);

            const now = new Date().toISOString();

            // Check if subscription already exists for this endpoint
            const existing = await this.db.prepare(
                'SELECT id FROM push_subscriptions WHERE endpoint = ? AND user_id = ?'
            ).bind(endpoint, userId).first();

            if (existing) {
                // Update existing subscription
                await this.db.prepare(
                    `UPDATE push_subscriptions 
                     SET p256dh_key = ?, auth_key = ?, user_agent_hash = ?, updated_at = ?
                     WHERE id = ?`
                ).bind(keys.p256dh, keys.auth, userAgentHash, now, existing.id).run();

                return this.json({
                    success: true,
                    subscriptionId: existing.id
                });
            }

            // Insert new subscription
            await this.db.prepare(
                `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh_key, auth_key, user_agent_hash, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
            ).bind(subscriptionId, userId, endpoint, keys.p256dh, keys.auth, userAgentHash, now, now).run();

            return this.json({
                success: true,
                subscriptionId
            }, 201);

        } catch (error) {
            console.error('Push subscribe error:', error);
            return this.error('Subscription failed', 500);
        }
    }

    /**
     * Unsubscribe from push notifications
     * DELETE /push/unsubscribe
     */
    async unsubscribe(request) {
        try {
            // Verify authentication
            const userId = await this.getUserId(request);
            if (!userId) {
                return this.error('Unauthorized', 401);
            }

            const url = new URL(request.url);
            const subscriptionId = url.searchParams.get('subscriptionId');

            if (!subscriptionId) {
                return this.error('Subscription ID required', 400);
            }

            // Delete subscription (only if owned by user)
            const result = await this.db.prepare(
                'DELETE FROM push_subscriptions WHERE id = ? AND user_id = ?'
            ).bind(subscriptionId, userId).run();

            if (result.changes === 0) {
                return this.error('Subscription not found', 404);
            }

            return this.json({ success: true });

        } catch (error) {
            console.error('Push unsubscribe error:', error);
            return this.error('Unsubscription failed', 500);
        }
    }

    /**
     * Get user's push subscriptions
     * GET /push/subscriptions
     */
    async getSubscriptions(request) {
        try {
            const userId = await this.getUserId(request);
            if (!userId) {
                return this.error('Unauthorized', 401);
            }

            const result = await this.db.prepare(
                'SELECT id, endpoint, created_at FROM push_subscriptions WHERE user_id = ?'
            ).bind(userId).all();

            return this.json({
                success: true,
                subscriptions: result.results
            });

        } catch (error) {
            console.error('Get subscriptions error:', error);
            return this.error('Failed to get subscriptions', 500);
        }
    }

    /**
     * Extract user ID from request token
     */
    async getUserId(request) {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return null;
        }

        const token = authHeader.slice(7);
        const payload = await this.jwtService.verify(token);

        return payload?.sub || null;
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
