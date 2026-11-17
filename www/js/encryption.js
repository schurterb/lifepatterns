/**
 * Encryption Service
 * Client-side AES-GCM encryption for cloud sync
 */

const EncryptionService = {
    ITERATIONS: 600000,
    KEY_LENGTH: 256,
    IV_LENGTH: 12,
    SALT_LENGTH: 16,

    async deriveKey(password, salt) {
        const encoder = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            encoder.encode(password),
            'PBKDF2',
            false,
            ['deriveBits', 'deriveKey']
        );

        return crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt,
                iterations: this.ITERATIONS,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'AES-GCM', length: this.KEY_LENGTH },
            false,
            ['encrypt', 'decrypt']
        );
    },

    async encrypt(data, password) {
        const encoder = new TextEncoder();
        const salt = crypto.getRandomValues(new Uint8Array(this.SALT_LENGTH));
        const iv = crypto.getRandomValues(new Uint8Array(this.IV_LENGTH));
        const key = await this.deriveKey(password, salt);

        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            key,
            encoder.encode(JSON.stringify(data))
        );

        const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
        combined.set(salt, 0);
        combined.set(iv, salt.length);
        combined.set(new Uint8Array(encrypted), salt.length + iv.length);

        return combined;
    },

    async decrypt(encryptedData, password) {
        const data = new Uint8Array(encryptedData);
        const salt = data.slice(0, this.SALT_LENGTH);
        const iv = data.slice(this.SALT_LENGTH, this.SALT_LENGTH + this.IV_LENGTH);
        const ciphertext = data.slice(this.SALT_LENGTH + this.IV_LENGTH);

        const key = await this.deriveKey(password, salt);

        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            key,
            ciphertext
        );

        const decoder = new TextDecoder();
        return JSON.parse(decoder.decode(decrypted));
    },

    generateRecoveryKey() {
        const bytes = crypto.getRandomValues(new Uint8Array(32));
        return Array.from(bytes)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('')
            .match(/.{1,4}/g)
            .join('-')
            .toUpperCase();
    },

    validatePassword(password, loginPassword) {
        if (password === loginPassword) {
            return { valid: false, error: 'Encryption password must be different from login password' };
        }
        if (password.length < 12) {
            return { valid: false, error: 'Encryption password must be at least 12 characters' };
        }
        return { valid: true };
    }
};

window.EncryptionService = EncryptionService;
