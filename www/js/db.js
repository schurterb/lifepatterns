// IndexedDB Database Setup
const db = new Dexie('PatternTracker');

db.version(1).stores({
    entries: '++id, schemaVersion, timestamp, timezone, type, [type+timestamp]',
});

db.version(2).stores({
    entries: '++id, schemaVersion, timestamp, timezone, type, [type+timestamp]',
    environmentalData: '++id, date, latitude, longitude, [date+latitude+longitude]',
});

// Entry validation and CRUD operations
const EntryService = {
    async createEntry(data) {
        const entry = {
            id: this.generateUUID(),
            schemaVersion: 1,
            timestamp: data.timestamp,
            timezone: data.timezone,
            type: data.type,
            value: data.value,
            notes: this.sanitizeNotes(data.notes || ''),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        await db.entries.add(entry);
        return entry;
    },

    async updateEntry(id, data) {
        const entry = await db.entries.get(id);
        if (!entry) throw new Error('Entry not found');

        const updated = {
            ...entry,
            ...data,
            notes: this.sanitizeNotes(data.notes || entry.notes),
            updatedAt: new Date().toISOString(),
        };

        await db.entries.put(updated);
        return updated;
    },

    async deleteEntry(id) {
        await db.entries.delete(id);
    },

    async getEntry(id) {
        return db.entries.get(id);
    },

    async getEntriesByType(type, startDate, endDate) {
        return db.entries
            .where('type')
            .equals(type)
            .filter(entry => {
                const entryDate = new Date(entry.timestamp);
                return entryDate >= startDate && entryDate <= endDate;
            })
            .toArray();
    },

    async getEntriesByDateRange(startDate, endDate) {
        return db.entries
            .where('timestamp')
            .between(startDate.toISOString(), endDate.toISOString())
            .toArray();
    },

    async getAllEntries() {
        return db.entries.toArray();
    },

    async getRecentEntries(limit = 10) {
        const entries = await db.entries.toArray();
        return entries
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, limit);
    },

    async checkDuplicate(type, timestamp) {
        const entryTime = new Date(timestamp);
        const entries = await this.getEntriesByType(type, new Date(0), new Date());

        const duplicateWindow = this.getDuplicateWindow(type);
        const windowStart = new Date(entryTime.getTime() - duplicateWindow * 60 * 60 * 1000);

        return entries.filter(entry => {
            const checkTime = new Date(entry.timestamp);
            return checkTime >= windowStart && checkTime <= entryTime;
        });
    },

    getDuplicateWindow(type) {
        const windows = {
            mood: 1,
            pain: 1,
            temperature: 1,
            sleep: 8,
            water: 0,
            nutrition: 0,
            exercise: 0,
            medication: 0,
            weight: 1,
        };
        return windows[type] || 0;
    },

    sanitizeNotes(notes) {
        if (!notes) return '';
        return notes
            .trim()
            .replace(/<[^>]*>/g, '')
            .slice(0, 500);
    },

    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    },

    validateEntry(data) {
        const errors = [];

        if (!data.type) errors.push('Type is required');
        if (data.value === null || data.value === undefined) errors.push('Value is required');
        if (!data.timestamp) errors.push('Timestamp is required');
        if (!data.timezone) errors.push('Timezone is required');

        const constraints = this.getTypeConstraints(data.type);
        if (constraints) {
            if (typeof data.value === 'number') {
                if (data.value < constraints.min) {
                    errors.push(`Value must be at least ${constraints.min}`);
                }
                if (data.value > constraints.max) {
                    errors.push(`Value must be at most ${constraints.max}`);
                }
            }
        }

        if (data.notes && data.notes.length > 500) {
            errors.push('Notes must be 500 characters or less');
        }

        return { valid: errors.length === 0, errors };
    },

    getTypeConstraints(type) {
        const constraints = {
            mood: { min: 1, max: 10, unit: 'scale' },
            sleep: { min: 0, max: 24, unit: 'hours' },
            exercise: { min: 0, max: 480, unit: 'minutes' },
            nutrition: { min: 0, max: 5000, unit: 'calories' },
            water: { min: 0, max: 20, unit: 'cups/liters' },
            medication: { min: 0, max: 100, unit: 'name' },
            weight: { min: 44, max: 660, unit: 'lbs' },
            temperature: { min: 80, max: 110, unit: '°F' },
            pain: { min: 0, max: 10, unit: 'scale' },
        };
        if (constraints[type]) return constraints[type];
        
        // Check custom types
        if (typeof CustomTypeService !== 'undefined') {
            return CustomTypeService.getTypeConstraints(type);
        }
        return null;
    },
};

// Settings Management
const SettingsService = {
    STORAGE_KEY: 'patternTrackerSettings',

    getDefaultSettings() {
        return {
            schemaVersion: 1,
            enabledTypes: ['mood', 'sleep'],
            theme: 'auto',
            unitSystem: 'imperial',
            duplicateWarnings: true,
            enableEnvironmentalData: true,
        };
    },

    loadSettings() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            if (!stored) return this.getDefaultSettings();

            const settings = JSON.parse(stored);
            return this.migrateSettings(settings);
        } catch (error) {
            console.error('Error loading settings:', error);
            return this.getDefaultSettings();
        }
    },

    saveSettings(settings) {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(settings));
        } catch (error) {
            console.error('Error saving settings:', error);
        }
    },

    migrateSettings(settings) {
        const defaults = this.getDefaultSettings();

        if (!settings.schemaVersion) {
            settings.schemaVersion = 1;
        }

        for (const key in defaults) {
            if (!(key in settings)) {
                settings[key] = defaults[key];
            }
        }

        return settings;
    },
};

// Environmental Data Service
const EnvironmentalDataService = {
    async saveEnvironmentalData(data) {
        const record = {
            date: data.date,
            latitude: data.latitude,
            longitude: data.longitude,
            tempMax: data.tempMax ?? null,
            tempMin: data.tempMin ?? null,
            pressure: data.pressure ?? null,
            precipitation: data.precipitation ?? null,
            uvIndex: data.uvIndex ?? null,
            kpIndex: data.kpIndex ?? null,
            stormLevel: data.stormLevel ?? null,
            fetchedAt: new Date().toISOString(),
        };

        // Check if record already exists for this date/location
        const existing = await this.getByDateAndLocation(data.date, data.latitude, data.longitude);
        if (existing) {
            // Update existing record
            await db.environmentalData.update(existing.id, record);
            return { ...existing, ...record };
        }

        // Create new record
        const id = await db.environmentalData.add(record);
        return { id, ...record };
    },

    async getByDateAndLocation(date, latitude, longitude) {
        // Round coordinates to 2 decimal places for matching (approximately 1km precision)
        const roundedLat = Math.round(latitude * 100) / 100;
        const roundedLon = Math.round(longitude * 100) / 100;

        const records = await db.environmentalData
            .where('date')
            .equals(date)
            .toArray();

        return records.find(r => 
            Math.round(r.latitude * 100) / 100 === roundedLat &&
            Math.round(r.longitude * 100) / 100 === roundedLon
        ) || null;
    },

    async getByDateRange(startDate, endDate, latitude, longitude) {
        const allRecords = await db.environmentalData.toArray();
        const roundedLat = Math.round(latitude * 100) / 100;
        const roundedLon = Math.round(longitude * 100) / 100;

        return allRecords.filter(r => {
            const recordDate = r.date;
            const matchesLocation = 
                Math.round(r.latitude * 100) / 100 === roundedLat &&
                Math.round(r.longitude * 100) / 100 === roundedLon;
            return recordDate >= startDate && recordDate <= endDate && matchesLocation;
        }).sort((a, b) => a.date.localeCompare(b.date));
    },

    async getAllDates() {
        const records = await db.environmentalData.toArray();
        return [...new Set(records.map(r => r.date))].sort();
    },

    async getMissingDates(dates, latitude, longitude) {
        const existingDates = new Set();
        const roundedLat = Math.round(latitude * 100) / 100;
        const roundedLon = Math.round(longitude * 100) / 100;

        const records = await db.environmentalData.toArray();
        records.forEach(r => {
            if (Math.round(r.latitude * 100) / 100 === roundedLat &&
                Math.round(r.longitude * 100) / 100 === roundedLon) {
                existingDates.add(r.date);
            }
        });

        return dates.filter(date => !existingDates.has(date));
    },

    async getCount() {
        return db.environmentalData.count();
    },
};

// Initialize database
async function initializeDatabase() {
    try {
        const entryCount = await db.entries.count();
        const envCount = await db.environmentalData.count();
        console.log(`Database initialized. Entries: ${entryCount}, Environmental: ${envCount}`);
    } catch (error) {
        console.error('Database initialization error:', error);
    }
}

initializeDatabase();
