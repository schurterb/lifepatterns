/**
 * Food Capture Module
 * Handles photo capture, EXIF stripping, and food analysis
 */

const FoodCapture = {
    MAX_SIZE: 1024,

    async captureAndAnalyze() {
        const file = await this.selectPhoto();
        if (!file) return null;

        const stripped = await this.stripExif(file);
        const resized = await this.resizeImage(stripped, this.MAX_SIZE);
        const base64 = await this.toBase64(resized);

        return this.analyze(base64);
    },

    selectPhoto() {
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.capture = 'environment';
            input.onchange = () => resolve(input.files[0] || null);
            input.click();
        });
    },

    async stripExif(file) {
        const arrayBuffer = await file.arrayBuffer();
        const view = new DataView(arrayBuffer);

        if (view.getUint16(0) !== 0xFFD8) {
            return file;
        }

        const segments = [];
        let offset = 2;

        while (offset < arrayBuffer.byteLength) {
            if (view.getUint8(offset) !== 0xFF) break;

            const marker = view.getUint8(offset + 1);
            if (marker === 0xD9) break;

            if (marker === 0xD8 || (marker >= 0xD0 && marker <= 0xD7)) {
                offset += 2;
                continue;
            }

            const length = view.getUint16(offset + 2);

            if (marker !== 0xE1) {
                segments.push(arrayBuffer.slice(offset, offset + 2 + length));
            }

            offset += 2 + length;
        }

        const imageData = arrayBuffer.slice(offset);
        const header = new Uint8Array([0xFF, 0xD8]);
        const parts = [header, ...segments.map(s => new Uint8Array(s)), new Uint8Array(imageData)];
        const blob = new Blob(parts, { type: 'image/jpeg' });

        return new File([blob], file.name, { type: 'image/jpeg' });
    },

    resizeImage(file, maxSize) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                let { width, height } = img;

                if (width > maxSize || height > maxSize) {
                    if (width > height) {
                        height = (height / width) * maxSize;
                        width = maxSize;
                    } else {
                        width = (width / height) * maxSize;
                        height = maxSize;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob(resolve, 'image/jpeg', 0.85);
            };
            img.src = URL.createObjectURL(file);
        });
    },

    toBase64(blob) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => {
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.readAsDataURL(blob);
        });
    },

    async analyze(imageBase64) {
        const res = await fetch('/ai/food-analysis', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ image: imageBase64 })
        });

        const data = await res.json();

        if (!data.success) {
            throw new Error(data.error || 'Analysis failed');
        }

        return data;
    },

    async saveEntries(entries) {
        const db = await this.getDB();
        const timestamp = new Date().toISOString();

        for (const entry of entries) {
            await db.entries.add({
                id: crypto.randomUUID(),
                type: entry.type,
                value: entry.value,
                timestamp,
                createdAt: timestamp,
                updatedAt: timestamp
            });
        }
    },

    async getDB() {
        if (window.db) return window.db;
        throw new Error('Database not initialized');
    }
};

window.FoodCapture = FoodCapture;
