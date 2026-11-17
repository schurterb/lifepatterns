/**
 * Sync Controller
 * Handles cloud sync upload/download with R2
 */

const MAX_BLOB_SIZE = 50 * 1024 * 1024; // 50MB

export class SyncController {
    constructor(env) {
        this.db = env.DB;
        this.bucket = env.SYNC_BUCKET;
    }

    async upload(request, userId) {
        if (!this.bucket) {
            return this.error('Sync not configured', 503);
        }

        const isPaid = await this.checkPaidTier(userId);
        if (!isPaid) {
            return this.error('Paid subscription required', 403);
        }

        const contentLength = parseInt(request.headers.get('Content-Length') || '0');
        if (contentLength > MAX_BLOB_SIZE) {
            return this.error('Payload too large (max 50MB)', 413);
        }

        const blob = await request.arrayBuffer();
        const key = `user-${userId}.enc`;

        await this.bucket.put(key, blob, {
            customMetadata: { userId, uploadedAt: new Date().toISOString() }
        });

        const now = new Date().toISOString();
        await this.db.prepare(
            `INSERT INTO sync_metadata (user_id, last_sync, blob_size, updated_at)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(user_id) DO UPDATE SET last_sync = ?, blob_size = ?, updated_at = ?`
        ).bind(userId, now, blob.byteLength, now, now, blob.byteLength, now).run();

        return this.json({
            success: true,
            bytesStored: blob.byteLength,
            lastSync: now
        });
    }

    async download(userId) {
        if (!this.bucket) {
            return this.error('Sync not configured', 503);
        }

        const isPaid = await this.checkPaidTier(userId);
        if (!isPaid) {
            return this.error('Paid subscription required', 403);
        }

        const key = `user-${userId}.enc`;
        const object = await this.bucket.get(key);

        if (!object) {
            return this.error('No sync data found', 404);
        }

        return new Response(object.body, {
            headers: {
                'Content-Type': 'application/octet-stream',
                'Content-Length': object.size.toString()
            }
        });
    }

    async getStatus(userId) {
        const metadata = await this.db.prepare(
            'SELECT last_sync, blob_size FROM sync_metadata WHERE user_id = ?'
        ).bind(userId).first();

        return this.json({
            success: true,
            lastSync: metadata?.last_sync || null,
            bytesStored: metadata?.blob_size || 0
        });
    }

    async checkPaidTier(userId) {
        const user = await this.db.prepare(
            'SELECT tier FROM users WHERE id = ?'
        ).bind(userId).first();

        return user?.tier === 'paid';
    }

    json(data, status = 200) {
        return new Response(JSON.stringify(data), {
            status,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    error(message, status = 400) {
        return this.json({ success: false, error: message }, status);
    }
}
