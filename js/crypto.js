const CypherCrypto = {
    SALT_PREFIX: 'CypherBay-v1-',
    PBKDF2_ITERATIONS: 100000,

    async deriveKey(password, sessionId) {
        const salt = new TextEncoder().encode(this.SALT_PREFIX + sessionId);
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(password),
            'PBKDF2',
            false,
            ['deriveKey']
        );
        return await crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: this.PBKDF2_ITERATIONS,
                hash: 'SHA-256'
            },
            keyMaterial,
            {
                name: 'AES-GCM',
                length: 256
            },
            false,
            ['encrypt', 'decrypt']
        );
    },

    async encrypt(plaintext, key) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ciphertext = await crypto.subtle.encrypt(
            {
                name: 'AES-GCM',
                iv: iv
            },
            key,
            new TextEncoder().encode(plaintext)
        );
        const combined = new Uint8Array(iv.length + ciphertext.byteLength);
        combined.set(iv);
        combined.set(new Uint8Array(ciphertext), iv.length);
        return this.arrayBufferToBase64(combined);
    },

    async decrypt(encryptedData, key) {
        try {
            const combined = this.base64ToArrayBuffer(encryptedData);
            const iv = combined.slice(0, 12);
            const ciphertext = combined.slice(12);
            const plaintext = await crypto.subtle.decrypt(
                {
                    name: 'AES-GCM',
                    iv: iv
                },
                key,
                ciphertext
            );
            
            return new TextDecoder().decode(plaintext);
        } catch (e) {
            return null;
        }
    },

    generateSessionId() {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        const randomBytes = crypto.getRandomValues(new Uint8Array(16));
        let result = '';
        for (let i = 0; i < randomBytes.length; i++) {
            result += chars[randomBytes[i] % chars.length];
        }
        return `${result.slice(0, 4)}-${result.slice(4, 8)}-${result.slice(8, 12)}-${result.slice(12, 16)}`;
    },

    generateMessageId() {
        const timestamp = Date.now().toString(36);
        const random = crypto.getRandomValues(new Uint8Array(4));
        const randomStr = Array.from(random).map(b => b.toString(16).padStart(2, '0')).join('');
        return `${timestamp}-${randomStr}`;
    },

    arrayBufferToBase64(buffer) {
        let binary = '';
        for (let i = 0; i < buffer.length; i++) {
            binary += String.fromCharCode(buffer[i]);
        }
        return btoa(binary);
    },

    base64ToArrayBuffer(base64) {
        const binary = atob(base64);
        const buffer = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            buffer[i] = binary.charCodeAt(i);
        }
        return buffer;
    },

    isValidSessionId(sessionId) {
        return /^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/.test(sessionId);
    }
};

window.CypherCrypto = CypherCrypto;
