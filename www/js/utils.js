// Utility Functions

const DateUtils = {
    getLocalTimezone() {
        return Intl.DateTimeFormat().resolvedOptions().timeZone;
    },

    formatTime(isoString) {
        const date = new Date(isoString);
        return date.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: true 
        });
    },

    formatDate(isoString) {
        const date = new Date(isoString);
        return date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    formatDateShort(isoString) {
        const date = new Date(isoString);
        return date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric'
        });
    },

    getDateRangeStart(days) {
        const end = new Date();
        const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
        return start;
    },

    getLocalDateString(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    },

    getCurrentISOString() {
        return new Date().toISOString();
    },

    parseLocalDateTime(localDateTimeString) {
        return new Date(localDateTimeString).toISOString();
    },
};

const TypeUtils = {
    // Environmental data type definitions
    ENVIRONMENTAL_TYPES: {
        env_temperature: { emoji: '🌡️', label: 'Env. Temperature', unit: '°C' },
        env_pressure: { emoji: '🔵', label: 'Pressure', unit: 'hPa' },
        env_precipitation: { emoji: '🌧️', label: 'Precipitation', unit: 'mm' },
        env_uv: { emoji: '☀️', label: 'UV Index', unit: '' },
        env_kp: { emoji: '🧲', label: 'Geomagnetic (Kp)', unit: '' },
        lunar_phase: { emoji: '🌙', label: 'Lunar Phase', unit: '%' },
    },

    isEnvironmentalType(type) {
        return type.startsWith('env_') || type.startsWith('lunar_');
    },

    getEnvironmentalTypes() {
        return Object.keys(this.ENVIRONMENTAL_TYPES);
    },

    getTypeEmoji(type) {
        // Check environmental types first
        if (this.ENVIRONMENTAL_TYPES[type]) {
            return this.ENVIRONMENTAL_TYPES[type].emoji;
        }

        const emojis = {
            mood: '😊',
            sleep: '😴',
            exercise: '🏃',
            nutrition: '🍎',
            water: '💧',
            medication: '💊',
            weight: '⚖️',
            temperature: '🌡️',
            pain: '😣',
        };
        if (emojis[type]) return emojis[type];
        
        // Check custom types
        if (typeof CustomTypeService !== 'undefined') {
            const customTypes = CustomTypeService.getCustomTypes();
            const customType = customTypes.find(t => t.id === type);
            if (customType) return customType.emoji || '📊';
        }
        return '📊';
    },

    getTypeLabel(type) {
        // Check environmental types first
        if (this.ENVIRONMENTAL_TYPES[type]) {
            return this.ENVIRONMENTAL_TYPES[type].label;
        }

        const labels = {
            mood: 'Mood',
            sleep: 'Sleep',
            exercise: 'Exercise',
            nutrition: 'Nutrition',
            water: 'Water',
            medication: 'Medication',
            weight: 'Weight',
            temperature: 'Temperature',
            pain: 'Pain',
        };
        if (labels[type]) return labels[type];
        
        // Check custom types
        if (typeof CustomTypeService !== 'undefined') {
            const customTypes = CustomTypeService.getCustomTypes();
            const customType = customTypes.find(t => t.id === type);
            if (customType) return customType.name;
        }
        return type;
    },

    getTypeUnit(type) {
        // Check environmental types first
        if (this.ENVIRONMENTAL_TYPES[type]) {
            return this.ENVIRONMENTAL_TYPES[type].unit;
        }

        const units = {
            mood: '1-10',
            sleep: 'hours',
            exercise: 'minutes',
            nutrition: 'calories',
            water: 'cups',
            medication: 'name',
            weight: 'lbs',
            temperature: '°F',
            pain: '0-10',
        };
        if (units[type]) return units[type];
        
        // Check custom types
        if (typeof CustomTypeService !== 'undefined') {
            const customTypes = CustomTypeService.getCustomTypes();
            const customType = customTypes.find(t => t.id === type);
            if (customType) return customType.unit || '';
        }
        return '';
    },

    formatEntryValue(entry) {
        const constraints = EntryService.getTypeConstraints(entry.type);
        if (!constraints) return entry.value;

        if (entry.type === 'mood' || entry.type === 'pain') {
            return `${entry.value}/10`;
        } else if (entry.type === 'medication') {
            return entry.value || 'Not taken';
        } else {
            return `${entry.value} ${constraints.unit}`;
        }
    },
};

const ChartUtils = {
    async prepareChartData(type, days, settings) {
        const startDate = DateUtils.getDateRangeStart(days);
        const endDate = new Date();

        const entries = await EntryService.getEntriesByType(type, startDate, endDate);
        if (entries.length === 0) return [];

        const aggregated = this.aggregateByDay(entries, type);
        return aggregated;
    },

    async prepareMultiTypeChartData(types, days, settings) {
        const startDate = DateUtils.getDateRangeStart(days);
        const endDate = new Date();
        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = endDate.toISOString().split('T')[0];

        const datasets = [];
        for (const type of types) {
            // Handle environmental types differently
            if (TypeUtils.isEnvironmentalType(type)) {
                const envData = await this.prepareEnvironmentalChartData(type, startDateStr, endDateStr);
                if (envData.length > 0) {
                    datasets.push({
                        type: type,
                        data: envData
                    });
                }
            } else {
                // Regular entry types
                const entries = await EntryService.getEntriesByType(type, startDate, endDate);
                if (entries.length > 0) {
                    const aggregated = this.aggregateByDay(entries, type);
                    datasets.push({
                        type: type,
                        data: aggregated
                    });
                }
            }
        }

        return datasets;
    },

    async prepareEnvironmentalChartData(type, startDate, endDate) {
        // Get user location from localStorage
        const locationStr = localStorage.getItem('userLocation');
        if (!locationStr) return [];

        const location = JSON.parse(locationStr);
        
        // For lunar phase, calculate on-the-fly
        if (type === 'lunar_phase') {
            return this.prepareLunarChartData(startDate, endDate);
        }

        // For other environmental types, query IndexedDB
        if (typeof EnvironmentalDataService === 'undefined') return [];

        const records = await EnvironmentalDataService.getByDateRange(
            startDate, 
            endDate, 
            location.latitude, 
            location.longitude
        );

        if (records.length === 0) return [];

        // Map type to field name
        const fieldMap = {
            env_temperature: 'tempMax',
            env_pressure: 'pressure',
            env_precipitation: 'precipitation',
            env_uv: 'uvIndex',
            env_kp: 'kpIndex',
        };

        const field = fieldMap[type];
        if (!field) return [];

        return records
            .filter(r => r[field] !== null && r[field] !== undefined)
            .map(r => ({
                date: r.date,
                label: DateUtils.formatDateShort(new Date(r.date + 'T00:00:00')),
                value: r[field],
            }));
    },

    prepareLunarChartData(startDate, endDate) {
        if (typeof LunarPhaseCalculator === 'undefined') return [];

        const result = [];
        const start = new Date(startDate);
        const end = new Date(endDate);
        
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const lunar = LunarPhaseCalculator.calculate(d);
            result.push({
                date: lunar.date,
                label: DateUtils.formatDateShort(d),
                value: lunar.phasePercent,
            });
        }

        return result;
    },

    aggregateByDay(entries, type) {
        const grouped = {};

        entries.forEach(entry => {
            const date = new Date(entry.timestamp);
            const dateKey = date.toLocaleDateString('en-CA');

            if (!grouped[dateKey]) {
                grouped[dateKey] = [];
            }
            grouped[dateKey].push(entry);
        });

        const aggregationMethod = this.getAggregationMethod(type);
        const result = [];

        Object.keys(grouped).sort().forEach(dateKey => {
            const dayEntries = grouped[dateKey];
            const aggregatedValue = aggregationMethod(dayEntries);

            result.push({
                date: dateKey,
                label: DateUtils.formatDateShort(new Date(dateKey + 'T00:00:00')),
                value: aggregatedValue,
            });
        });

        return result;
    },

    getAggregationMethod(type) {
        const methods = {
            mood: (entries) => {
                const sum = entries.reduce((acc, e) => acc + e.value, 0);
                return Math.round((sum / entries.length) * 10) / 10;
            },
            sleep: (entries) => {
                return entries.reduce((acc, e) => acc + e.value, 0);
            },
            exercise: (entries) => {
                return entries.reduce((acc, e) => acc + e.value, 0);
            },
            nutrition: (entries) => {
                return entries.reduce((acc, e) => acc + e.value, 0);
            },
            water: (entries) => {
                return Math.round(entries.reduce((acc, e) => acc + e.value, 0) * 10) / 10;
            },
            medication: (entries) => {
                return entries.length;
            },
            weight: (entries) => {
                return entries[entries.length - 1].value;
            },
            temperature: (entries) => {
                const sum = entries.reduce((acc, e) => acc + e.value, 0);
                return Math.round((sum / entries.length) * 10) / 10;
            },
            pain: (entries) => {
                const sum = entries.reduce((acc, e) => acc + e.value, 0);
                return Math.round((sum / entries.length) * 10) / 10;
            },
        };
        return methods[type] || ((entries) => entries[0].value);
    },

    createChartConfig(type, data) {
        const isDiscreteType = ['mood', 'pain'].includes(type);
        const chartType = isDiscreteType ? 'bar' : 'line';

        return {
            type: chartType,
            data: {
                labels: data.map(d => d.label),
                datasets: [{
                    label: TypeUtils.getTypeLabel(type),
                    data: data.map(d => d.value),
                    borderColor: '#3b82f6',
                    backgroundColor: chartType === 'line' 
                        ? 'rgba(59, 130, 246, 0.1)' 
                        : 'rgba(59, 130, 246, 0.5)',
                    borderWidth: 2,
                    fill: chartType === 'line',
                    tension: 0.4,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                    },
                    title: {
                        display: true,
                        text: TypeUtils.getTypeLabel(type),
                    },
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                if (type === 'mood' || type === 'pain') {
                                    return Math.round(value);
                                }
                                return value;
                            },
                        },
                    },
                },
            },
        };
    },

    determineDataScale(data) {
        if (!data || data.length === 0) return 0;
        
        const values = data.map(d => d.value).filter(v => v != null && v > 0);
        if (values.length === 0) return 0;
        
        const maxValue = Math.max(...values);
        
        // Determine order of magnitude
        if (maxValue <= 15) return 10; // 0-10 scale (mood, pain, water)
        if (maxValue <= 150) return 100; // 0-100 scale (exercise, sleep hours)
        if (maxValue <= 1500) return 1000; // 0-1000 scale (calories, weight)
        return 10000; // 0-10000+ scale
    },

    getScaleConfig(scaleType, position) {
        const configs = {
            10: {
                suggestedMax: 10,
                ticks: {
                    stepSize: 2,
                    callback: function(value) {
                        return Math.round(value);
                    }
                }
            },
            100: {
                suggestedMax: 100,
                ticks: {
                    stepSize: 20
                }
            },
            1000: {
                suggestedMax: undefined,
                ticks: {
                    stepSize: undefined
                }
            },
            10000: {
                suggestedMax: undefined,
                ticks: {
                    stepSize: undefined
                }
            }
        };

        const config = configs[scaleType] || configs[1000];
        return {
            type: 'linear',
            display: true,
            position: position,
            beginAtZero: true,
            ...config,
            grid: {
                drawOnChartArea: position === 'left'
            }
        };
    },

    createMultiTypeChartConfig(types, datasetsData) {
        const colors = [
            { border: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)' },
            { border: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' },
            { border: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)' },
            { border: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)' },
            { border: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.1)' },
            { border: '#ec4899', bg: 'rgba(236, 72, 153, 0.1)' },
            { border: '#06b6d4', bg: 'rgba(6, 182, 212, 0.1)' },
            { border: '#84cc16', bg: 'rgba(132, 204, 22, 0.1)' },
            { border: '#f97316', bg: 'rgba(249, 115, 22, 0.1)' },
        ];

        // Get all unique dates from all datasets
        const allDates = new Set();
        datasetsData.forEach(ds => {
            ds.data.forEach(d => allDates.add(d.date));
        });
        const sortedDates = Array.from(allDates).sort();
        const labels = sortedDates.map(date => DateUtils.formatDateShort(new Date(date + 'T00:00:00')));

        // Determine scale for each dataset and group by scale
        const datasetScales = datasetsData.map(ds => ({
            type: ds.type,
            data: ds.data,
            scale: this.determineDataScale(ds.data)
        }));

        // Get unique scales and assign axis IDs
        const uniqueScales = [...new Set(datasetScales.map(ds => ds.scale))].sort((a, b) => a - b);
        const scaleToAxisId = {};
        const positions = ['left', 'right'];
        
        uniqueScales.forEach((scale, index) => {
            if (index < 2) {
                scaleToAxisId[scale] = `y${index === 0 ? '' : index}`;
            } else {
                scaleToAxisId[scale] = `y${index}`;
            }
        });

        // Create datasets for Chart.js
        const datasets = datasetsData.map((ds, index) => {
            const color = colors[index % colors.length];
            const scale = this.determineDataScale(ds.data);
            const yAxisID = scaleToAxisId[scale];
            
            // Create data array aligned with all dates
            const dataMap = new Map(ds.data.map(d => [d.date, d.value]));
            const alignedData = sortedDates.map(date => dataMap.get(date) || null);

            return {
                label: TypeUtils.getTypeLabel(ds.type),
                data: alignedData,
                borderColor: color.border,
                backgroundColor: color.bg,
                borderWidth: 2,
                fill: false,
                tension: 0.4,
                pointRadius: 4,
                pointHoverRadius: 6,
                spanGaps: true,
                yAxisID: yAxisID,
            };
        });

        // Build scales configuration
        const scales = {
            x: {
                display: true,
                grid: {
                    display: true
                }
            },
            y: {
                display: true,
                ticks: {
                    display: false  // Hide Y-axis labels by default
                },
                grid: {
                    drawOnChartArea: true
                }
            }
        };

        return {
            type: 'line',
            data: {
                labels: labels,
                datasets: datasets,
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                    },
                    title: {
                        display: false,
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    label += context.parsed.y;
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: scales,
            },
        };
    }
};

const ValidationUtils = {
    validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    },

    validateTimestamp(timestamp) {
        const date = new Date(timestamp);
        return !isNaN(date.getTime());
    },

    validateTimezone(timezone) {
        try {
            Intl.DateTimeFormat(undefined, { timeZone: timezone });
            return true;
        } catch (ex) {
            return false;
        }
    },
};

// Initialize app on load (browser only — utils.js also runs in Worker/Node contexts)
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function() {
        console.log('Life Patterns initialized');
    });
}
