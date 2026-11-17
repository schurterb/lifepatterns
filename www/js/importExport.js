'use strict';

const FileDownload = {
    save(filename, content, mimeType = 'text/plain') {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
};

const CSVExporter = {
    DANGEROUS_PREFIXES: ['=', '+', '-', '@', '\\t', '\\r', '\\n', '|', '%'],

    sanitizeCell(value) {
        if (value === null || value === undefined) return '';
        let text = String(value);
        if (!text.length) return '';
        const firstChar = text[0];
        if (this.DANGEROUS_PREFIXES.includes(firstChar)) {
            text = `'${text}`;
        }
        return text;
    },

    wrapInQuotes(value) {
        const text = String(value ?? '');
        const safe = text.replace(/"/g, '""');
        return `"${safe}"`;
    },

    buildRow(entry) {
        const ordered = [
            entry.id || '',
            entry.timestamp,
            entry.timezone,
            entry.type,
            entry.value,
            entry.notes || '',
            entry.createdAt || '',
            entry.updatedAt || ''
        ];

        return ordered
            .map(value => this.wrapInQuotes(this.sanitizeCell(value)))
            .join(',');
    },

    exportEntries(entries = []) {
        const headerWarning = '# WARNING: Do not enable macros or formulas';
        const header = 'id,timestamp,timezone,type,value,notes,createdAt,updatedAt';
        const rows = entries.map(entry => this.buildRow(entry));
        return [headerWarning, header, ...rows].join('\n');
    }
};

const CSVParser = {
    stripFormulaPrefix(text) {
        if (!text) return '';
        if (text.startsWith("'")) {
            return text.slice(1);
        }
        return text;
    },

    parse(csvText = '') {
        const entries = [];
        const lines = [];
        let current = '';
        let inQuotes = false;
        let fieldBuffer = [];

        const pushField = () => {
            fieldBuffer.push(current);
            current = '';
        };

        const pushLine = () => {
            if (fieldBuffer.length > 0 || current.length > 0) {
                fieldBuffer.push(current);
                lines.push(fieldBuffer);
            }
            fieldBuffer = [];
            current = '';
        };

        for (let i = 0; i < csvText.length; i++) {
            const char = csvText[i];
            const nextChar = csvText[i + 1];

            if (char === '"') {
                if (inQuotes && nextChar === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                pushField();
            } else if ((char === '\n' || char === '\r') && !inQuotes) {
                if (char === '\r' && nextChar === '\n') {
                    i++;
                }
                pushLine();
            } else {
                current += char;
            }
        }

        if (current.length > 0 || fieldBuffer.length > 0) {
            pushLine();
        }

        const filteredLines = lines.filter(line => line.length && !line[0].trim().startsWith('#'));
        if (!filteredLines.length) return entries;

        const headers = filteredLines[0].map(h => h.trim());
        const required = ['id', 'timestamp', 'timezone', 'type', 'value'];
        for (const column of required) {
            if (!headers.includes(column)) {
                throw new Error(`Missing required column: ${column}`);
            }
        }

        for (let i = 1; i < filteredLines.length; i++) {
            const line = filteredLines[i];
            if (!line.length) continue;
            const entry = {};
            headers.forEach((header, idx) => {
                entry[header] = this.stripFormulaPrefix(line[idx] ?? '');
            });
            if (!entry.type || !entry.timestamp) continue;
            entry.value = entry.type === 'medication'
                ? entry.value
                : Number(entry.value);
            entries.push(entry);
        }

        return entries;
    }
};

const JSONExporter = {
    exportEntries(entries = []) {
        const payload = {
            schemaVersion: 1,
            exportedAt: new Date().toISOString(),
            entryCount: entries.length,
            entries,
        };
        return JSON.stringify(payload, null, 2);
    }
};

const JSONImporter = {
    parseJSON(text = '') {
        try {
            return JSON.parse(text);
        } catch (error) {
            throw new Error('Invalid JSON format');
        }
    },

    extractEntries(parsed) {
        if (Array.isArray(parsed)) {
            return parsed;
        }

        if (!parsed || typeof parsed !== 'object') {
            throw new Error('Invalid JSON structure');
        }

        const { schemaVersion, entries } = parsed;
        if (!schemaVersion) {
            throw new Error('Schema version is required');
        }
        if (schemaVersion !== 1) {
            throw new Error(`Unsupported schema version: ${schemaVersion}`);
        }
        if (!Array.isArray(entries)) {
            throw new Error('Entries array is required');
        }
        return entries;
    }
};

const ImportValidator = {
    FILE_SIZE_LIMIT: 5 * 1024 * 1024,
    MAX_BATCH_ENTRIES: 10000,
    MIN_TIMESTAMP: new Date('2020-01-01T00:00:00Z'),
    MAX_FUTURE_OFFSET_MS: 24 * 60 * 60 * 1000,

    validateFileSize(file) {
        if (file.size > this.FILE_SIZE_LIMIT) {
            return {
                valid: false,
                error: 'File exceeds 5MB limit',
            };
        }
        return { valid: true };
    },

    validateEntries(entries = []) {
        const validEntries = [];
        const errors = [];

        if (entries.length > this.MAX_BATCH_ENTRIES) {
            return {
                validEntries: [],
                errors: [{ index: 'all', message: 'Import limit is 10,000 entries per file' }]
            };
        }

        entries.forEach((entry, index) => {
            const cleaned = this.normalizeEntry(entry);
            const entryErrors = this.validateEntry(cleaned);
            if (entryErrors.length) {
                errors.push({ index, message: entryErrors.join('; ') });
            } else {
                validEntries.push(cleaned);
            }
        });

        return { validEntries, errors };
    },

    normalizeEntry(entry) {
        const normalized = { ...entry };
        normalized.id = normalized.id || null;
        normalized.type = (normalized.type || '').trim();
        normalized.notes = EntryService.sanitizeNotes(normalized.notes || '');
        normalized.timestamp = normalized.timestamp ? new Date(normalized.timestamp).toISOString() : null;
        normalized.timezone = (normalized.timezone || '').trim();

        if (normalized.type !== 'medication') {
            normalized.value = normalized.value === '' || normalized.value === null || normalized.value === undefined
                ? null
                : Number(normalized.value);
        }

        if (!normalized.createdAt) {
            normalized.createdAt = new Date().toISOString();
        }
        if (!normalized.updatedAt) {
            normalized.updatedAt = normalized.createdAt;
        }

        normalized.schemaVersion = 1;
        return normalized;
    },

    validateEntry(entry) {
        const errors = [];

        if (!entry.type) {
            errors.push('Type is required');
        }

        if (!entry.timestamp || Number.isNaN(new Date(entry.timestamp).getTime())) {
            errors.push('Invalid timestamp');
        } else {
            const timestamp = new Date(entry.timestamp);
            if (timestamp < this.MIN_TIMESTAMP) {
                errors.push('Timestamp must be after 2020-01-01');
            }
            const now = Date.now();
            if (timestamp.getTime() - now > this.MAX_FUTURE_OFFSET_MS) {
                errors.push('Timestamp cannot be more than 1 day in the future');
            }
        }

        if (!entry.timezone || !ValidationUtils.validateTimezone(entry.timezone)) {
            errors.push('Invalid timezone');
        }

        if (entry.notes && entry.notes.length > 500) {
            errors.push('Notes must be 500 characters or less');
        }

        const constraints = EntryService.getTypeConstraints(entry.type);
        if (constraints) {
            if (entry.type !== 'medication' && (typeof entry.value !== 'number' || Number.isNaN(entry.value))) {
                errors.push('Value must be a number');
            }
            if (typeof entry.value === 'number') {
                if (entry.value < constraints.min || entry.value > constraints.max) {
                    const label = (TypeUtils && TypeUtils.getTypeLabel) ? TypeUtils.getTypeLabel(entry.type) : entry.type;
                    errors.push(`${label} value must be between ${constraints.min} and ${constraints.max}`);
                }
            }
            if (entry.type === 'medication') {
                if (typeof entry.value !== 'string' || !entry.value.trim()) {
                    errors.push('Medication name must be text');
                }
                if (entry.value && entry.value.length > 100) {
                    errors.push('Medication name must be 100 characters or less');
                }
            }
        } else if (!entry.type.startsWith('custom:')) {
            errors.push(`Unsupported data type: ${entry.type}`);
        }

        return errors;
    },
};

const ImportService = {
    async importEntries(entries = []) {
        if (!entries.length) return 0;

        for (const entry of entries) {
            const record = {
                id: entry.id || EntryService.generateUUID(),
                schemaVersion: 1,
                timestamp: entry.timestamp,
                timezone: entry.timezone,
                type: entry.type,
                value: entry.value,
                notes: entry.notes || '',
                createdAt: entry.createdAt,
                updatedAt: entry.updatedAt,
            };

            const existing = record.id ? await db.entries.get(record.id) : null;
            if (existing) {
                await db.entries.put({ ...existing, ...record });
            } else {
                await db.entries.add(record);
            }
        }
        return entries.length;
    }
};
