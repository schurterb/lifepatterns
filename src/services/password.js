/**
 * Password Service for Pattern Tracker
 * Uses PBKDF2 via Web Crypto API for secure password hashing
 * Compatible with Cloudflare Workers (native Web Crypto API)
 */

// PBKDF2 parameters
// Note: Cloudflare Workers have CPU time limits (10-50ms depending on tier)
// 100,000 iterations provides ~100ms hash time, balancing security and feasibility
// For production with paid tier, consider increasing to 310,000 (OWASP min for PBKDF2-SHA256)
const PBKDF2_ITERATIONS = 100000;
const KEY_LENGTH = 32;             // 256 bits

/**
 * PasswordService handles secure password hashing and verification
 */
export class PasswordService {
    /**
     * Hash a password using PBKDF2-SHA256
     * @param {string} password - Plain text password
     * @returns {Promise<string>} - Hashed password with salt (base64 encoded)
     */
    static async hash(password) {
        // Generate random salt (16 bytes)
        const salt = new Uint8Array(16);
        crypto.getRandomValues(salt);

        // Import password as key material
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(password),
            'PBKDF2',
            false,
            ['deriveBits']
        );

        // Derive key using PBKDF2
        const hashBuffer = await crypto.subtle.deriveBits(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: PBKDF2_ITERATIONS,
                hash: 'SHA-256'
            },
            keyMaterial,
            KEY_LENGTH * 8  // bits
        );

        const hash = new Uint8Array(hashBuffer);

        // Combine salt + hash for storage
        const combined = new Uint8Array(salt.length + hash.length);
        combined.set(salt, 0);
        combined.set(hash, salt.length);

        // Return as base64
        return this.base64Encode(combined);
    }

    /**
     * Verify a password against a stored hash
     * @param {string} password - Plain text password to verify
     * @param {string} storedHash - Stored hash (base64 encoded)
     * @returns {Promise<boolean>} - True if password matches
     */
    static async verify(password, storedHash) {
        try {
            // Decode stored hash
            const combined = this.base64Decode(storedHash);

            // Extract salt and hash
            const salt = combined.slice(0, 16);
            const expectedHash = combined.slice(16);

            // Import password as key material
            const keyMaterial = await crypto.subtle.importKey(
                'raw',
                new TextEncoder().encode(password),
                'PBKDF2',
                false,
                ['deriveBits']
            );

            // Derive key using PBKDF2
            const hashBuffer = await crypto.subtle.deriveBits(
                {
                    name: 'PBKDF2',
                    salt: salt,
                    iterations: PBKDF2_ITERATIONS,
                    hash: 'SHA-256'
                },
                keyMaterial,
                KEY_LENGTH * 8
            );

            const actualHash = new Uint8Array(hashBuffer);

            // Constant-time comparison
            return this.constantTimeEquals(expectedHash, actualHash);
        } catch (error) {
            console.error('Password verification error:', error);
            return false;
        }
    }

    /**
     * Validate password strength
     * @param {string} password - Password to validate
     * @returns {{ valid: boolean, errors: string[] }}
     */
    static validate(password) {
        const errors = [];

        if (password.length < 8) {
            errors.push('Password must be at least 8 characters');
        }
        if (password.length > 128) {
            errors.push('Password must be less than 128 characters');
        }
        if (!/[a-z]/.test(password)) {
            errors.push('Password must contain at least one lowercase letter');
        }
        if (!/[A-Z]/.test(password)) {
            errors.push('Password must contain at least one uppercase letter');
        }
        if (!/[0-9]/.test(password)) {
            errors.push('Password must contain at least one number');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Base64 encode a Uint8Array
     */
    static base64Encode(bytes) {
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    /**
     * Base64 decode to Uint8Array
     */
    static base64Decode(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    /**
     * Constant-time comparison to prevent timing attacks
     */
    static constantTimeEquals(a, b) {
        if (a.length !== b.length) {
            return false;
        }

        let result = 0;
        for (let i = 0; i < a.length; i++) {
            result |= a[i] ^ b[i];
        }

        return result === 0;
    }
}
