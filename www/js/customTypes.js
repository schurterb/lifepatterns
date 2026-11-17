'use strict';

const CustomTypeService = {
    STORAGE_KEY: 'customTypes',
    MAX_CUSTOM_TYPES: 10,

    getCustomTypes() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            if (!stored) return [];
            return JSON.parse(stored);
        } catch (error) {
            console.error('Error loading custom types:', error);
            return [];
        }
    },

    saveCustomTypes(types) {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(types));
        } catch (error) {
            console.error('Error saving custom types:', error);
        }
    },

    createCustomType(config) {
        const types = this.getCustomTypes();
        
        if (types.length >= this.MAX_CUSTOM_TYPES) {
            throw new Error(`Maximum of ${this.MAX_CUSTOM_TYPES} custom types allowed`);
        }

        const validation = this.validateTypeConfig(config);
        if (!validation.valid) {
            throw new Error(validation.errors.join('; '));
        }

        const typeId = `custom:${this.generateSlug(config.name)}`;
        
        if (types.find(t => t.id === typeId)) {
            throw new Error('A custom type with this name already exists');
        }

        const customType = {
            id: typeId,
            name: config.name.trim(),
            emoji: config.emoji || '📊',
            valueType: config.valueType || 'number',
            unit: config.unit?.trim() || '',
            min: config.min ?? 0,
            max: config.max ?? 100,
            step: config.step ?? 1,
            aggregation: config.aggregation || 'average',
            createdAt: new Date().toISOString(),
        };

        types.push(customType);
        this.saveCustomTypes(types);
        return customType;
    },

    updateCustomType(typeId, updates) {
        const types = this.getCustomTypes();
        const index = types.findIndex(t => t.id === typeId);
        
        if (index === -1) {
            throw new Error('Custom type not found');
        }

        const updated = { ...types[index], ...updates, id: typeId };
        const validation = this.validateTypeConfig(updated);
        
        if (!validation.valid) {
            throw new Error(validation.errors.join('; '));
        }

        types[index] = updated;
        this.saveCustomTypes(types);
        return updated;
    },

    deleteCustomType(typeId) {
        const types = this.getCustomTypes();
        const filtered = types.filter(t => t.id !== typeId);
        this.saveCustomTypes(filtered);
    },

    validateTypeConfig(config) {
        const errors = [];

        if (!config.name || config.name.trim().length === 0) {
            errors.push('Name is required');
        }

        if (config.name && config.name.length > 50) {
            errors.push('Name must be 50 characters or less');
        }

        if (config.valueType && !['number', 'text'].includes(config.valueType)) {
            errors.push('Value type must be "number" or "text"');
        }

        if (config.valueType === 'number') {
            if (typeof config.min !== 'number' || typeof config.max !== 'number') {
                errors.push('Min and max must be numbers');
            }

            if (config.min >= config.max) {
                errors.push('Min must be less than max');
            }

            if (config.step && config.step <= 0) {
                errors.push('Step must be greater than 0');
            }
        }

        if (config.aggregation && !['average', 'sum', 'last', 'count'].includes(config.aggregation)) {
            errors.push('Aggregation must be one of: average, sum, last, count');
        }

        return {
            valid: errors.length === 0,
            errors,
        };
    },

    generateSlug(name) {
        return name
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 30);
    },

    getTypeConstraints(typeId) {
        const types = this.getCustomTypes();
        const customType = types.find(t => t.id === typeId);
        
        if (!customType) return null;

        if (customType.valueType === 'number') {
            return {
                min: customType.min,
                max: customType.max,
                step: customType.step || 1,
                unit: customType.unit,
            };
        }

        return {
            min: 0,
            max: 500,
            step: 1,
            unit: 'text',
        };
    },

    getAllTypeConstraints() {
        const builtIn = {
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

        const custom = {};
        this.getCustomTypes().forEach(type => {
            custom[type.id] = this.getTypeConstraints(type.id);
        });

        return { ...builtIn, ...custom };
    },

    getAggregationMethod(typeId) {
        const types = this.getCustomTypes();
        const customType = types.find(t => t.id === typeId);
        
        if (!customType) return null;

        const methods = {
            average: (entries) => {
                const sum = entries.reduce((acc, e) => acc + parseFloat(e.value || 0), 0);
                return Math.round((sum / entries.length) * 10) / 10;
            },
            sum: (entries) => {
                return entries.reduce((acc, e) => acc + parseFloat(e.value || 0), 0);
            },
            last: (entries) => {
                return entries[entries.length - 1].value;
            },
            count: (entries) => {
                return entries.length;
            },
        };

        return methods[customType.aggregation] || methods.average;
    }
};
