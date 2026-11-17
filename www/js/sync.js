/**
 * Sync Service
 * Handles cloud sync upload/download with encryption
 */

const SyncService = {
    encryptionPassword: null,

    setPassword(password) {
        this.encryptionPassword = password;
    },

    clearPassword() {
        this.encryptionPassword = null;
    },

    async upload() {
        if (!this.encryptionPassword) {
            throw new Error('Encryption password not set');
        }

        const data = await this.collectData();
        const encrypted = await EncryptionService.encrypt(data, this.encryptionPassword);

        const res = await fetch('/sync/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream' },
            credentials: 'include',
            body: encrypted
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Upload failed');
        }

        return res.json();
    },

    async download() {
        if (!this.encryptionPassword) {
            throw new Error('Encryption password not set');
        }

        const res = await fetch('/sync/download', {
            credentials: 'include'
        });

        if (!res.ok) {
            if (res.status === 404) return null;
            const err = await res.json();
            throw new Error(err.error || 'Download failed');
        }

        const encrypted = await res.arrayBuffer();
        return EncryptionService.decrypt(encrypted, this.encryptionPassword);
    },

    async getStatus() {
        const res = await fetch('/sync/status', {
            credentials: 'include'
        });

        return res.json();
    },

    async collectData() {
        const db = window.db;
        if (!db) throw new Error('Database not initialized');

        const entries = await db.entries.toArray();
        const settings = await db.settings.toArray();
        const dataTypes = await db.dataTypes?.toArray() || [];

        return {
            version: 1,
            exportedAt: new Date().toISOString(),
            entries,
            settings,
            dataTypes
        };
    },

    async mergeData(remoteData) {
        const db = window.db;
        if (!db) throw new Error('Database not initialized');

        const localEntries = await db.entries.toArray();
        const localMap = new Map(localEntries.map(e => [e.id, e]));

        for (const entry of remoteData.entries) {
            const local = localMap.get(entry.id);
            if (!local || new Date(entry.updatedAt) > new Date(local.updatedAt)) {
                await db.entries.put(entry);
            }
        }

        return { merged: remoteData.entries.length };
    }
};

window.SyncService = SyncService;
