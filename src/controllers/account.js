/**
 * Account Controller
 * Handles account management endpoints
 */

/**
 * AccountController handles account management
 */
export class AccountController {
    /**
     * @param {D1Database} db - D1 database instance
     * @param {JWTService} jwtService - JWT service instance
     */
    constructor(db, jwtService) {
        this.db = db;
        this.jwtService = jwtService;
    }

    /**
     * Get account details
     * GET /account
     */
    async get(request) {
        try {
            const userId = await this.getUserId(request);
            if (!userId) {
                return this.error('Unauthorized', 401);
            }

            const user = await this.db.prepare(
                'SELECT id, email, tier, created_at, reminder_time, reminder_types FROM users WHERE id = ?'
            ).bind(userId).first();

            if (!user) {
                return this.error('User not found', 404);
            }

            // Get push subscription count
            const subscriptions = await this.db.prepare(
                'SELECT COUNT(*) as count FROM push_subscriptions WHERE user_id = ?'
            ).bind(userId).first();

            return this.json({
                success: true,
                account: {
                    id: user.id,
                    email: user.email,
                    tier: user.tier,
                    createdAt: user.created_at,
                    reminderTime: user.reminder_time,
                    reminderTypes: user.reminder_types ? JSON.parse(user.reminder_types) : [],
                    pushSubscriptions: subscriptions?.count || 0
                }
            });

        } catch (error) {
            console.error('Get account error:', error);
            return this.error('Failed to get account', 500);
        }
    }

    /**
     * Delete account
     * DELETE /account
     */
    async delete(request) {
        try {
            const userId = await this.getUserId(request);
            if (!userId) {
                return this.error('Unauthorized', 401);
            }

            // Verify user exists
            const user = await this.db.prepare(
                'SELECT id FROM users WHERE id = ?'
            ).bind(userId).first();

            if (!user) {
                return this.error('User not found', 404);
            }

            // Delete push subscriptions (cascade should handle this, but be explicit)
            await this.db.prepare(
                'DELETE FROM push_subscriptions WHERE user_id = ?'
            ).bind(userId).run();

            // Delete user
            await this.db.prepare(
                'DELETE FROM users WHERE id = ?'
            ).bind(userId).run();

            // Revoke all tokens for this user
            // Note: This would require tracking all token IDs, which we'll implement later

            const response = this.json({ success: true });

            // Clear cookies
            response.headers.append('Set-Cookie', 'access_token=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');
            response.headers.append('Set-Cookie', 'refresh_token=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');

            return response;

        } catch (error) {
            console.error('Delete account error:', error);
            return this.error('Failed to delete account', 500);
        }
    }

    /**
     * Export account data
     * GET /account/export
     */
    async export(request) {
        try {
            const userId = await this.getUserId(request);
            if (!userId) {
                return this.error('Unauthorized', 401);
            }

            // Get user data
            const user = await this.db.prepare(
                'SELECT id, email, tier, created_at, reminder_time, reminder_types FROM users WHERE id = ?'
            ).bind(userId).first();

            if (!user) {
                return this.error('User not found', 404);
            }

            // Get push subscriptions (without sensitive keys)
            const subscriptions = await this.db.prepare(
                'SELECT id, endpoint, created_at FROM push_subscriptions WHERE user_id = ?'
            ).bind(userId).all();

            // Build export data
            const exportData = {
                exportedAt: new Date().toISOString(),
                version: '3.0.0',
                account: {
                    id: user.id,
                    email: user.email,
                    tier: user.tier,
                    createdAt: user.created_at,
                    reminderTime: user.reminder_time,
                    reminderTypes: user.reminder_types ? JSON.parse(user.reminder_types) : []
                },
                pushSubscriptions: subscriptions.results,
                // Note: Entry data is stored client-side in IndexedDB
                // Users should export from the client separately
                entriesNote: 'Entry data is stored locally in your browser. Use the export feature in the app to download your entries.'
            };

            // Return as downloadable JSON
            return new Response(JSON.stringify(exportData, null, 2), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Disposition': `attachment; filename="pattern-tracker-account-${userId.slice(0, 8)}.json"`
                }
            });

        } catch (error) {
            console.error('Export account error:', error);
            return this.error('Failed to export account', 500);
        }
    }

    /**
     * Update account settings
     * PUT /account
     */
    async update(request) {
        try {
            const userId = await this.getUserId(request);
            if (!userId) {
                return this.error('Unauthorized', 401);
            }

            const body = await request.json();
            const { reminderTime, reminderTypes } = body;

            // Validate reminder time format
            if (reminderTime && !/^\d{2}:\d{2}$/.test(reminderTime)) {
                return this.error('Invalid reminder time format (use HH:MM)', 400);
            }

            // Validate reminder types
            if (reminderTypes && !Array.isArray(reminderTypes)) {
                return this.error('Reminder types must be an array', 400);
            }

            const updates = [];
            const values = [];

            if (reminderTime !== undefined) {
                updates.push('reminder_time = ?');
                values.push(reminderTime);
            }

            if (reminderTypes !== undefined) {
                updates.push('reminder_types = ?');
                values.push(JSON.stringify(reminderTypes));
            }

            if (updates.length === 0) {
                return this.error('No updates provided', 400);
            }

            updates.push('updated_at = ?');
            values.push(new Date().toISOString());
            values.push(userId);

            await this.db.prepare(
                `UPDATE users SET ${updates.join(', ')} WHERE id = ?`
            ).bind(...values).run();

            return this.json({ success: true });

        } catch (error) {
            console.error('Update account error:', error);
            return this.error('Failed to update account', 500);
        }
    }

    /**
     * Extract user ID from request token
     */
    async getUserId(request) {
        const authHeader = request.headers.get('Authorization');
        const token = authHeader?.startsWith('Bearer ')
            ? authHeader.slice(7)
            : request.headers.get('Cookie')?.match(/(?:^|;\s*)access_token=([^;]+)/)?.[1];
        if (!token) {
            return null;
        }

        const payload = await this.jwtService.verify(token);
        return payload?.sub || null;
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
