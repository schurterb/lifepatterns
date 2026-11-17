'use strict';

const CorrelationAnalyzer = {
    calculatePearson(xValues, yValues) {
        if (xValues.length !== yValues.length || xValues.length < 2) {
            return null;
        }

        const n = xValues.length;
        const sumX = xValues.reduce((a, b) => a + b, 0);
        const sumY = yValues.reduce((a, b) => a + b, 0);
        const sumXY = xValues.reduce((sum, x, i) => sum + x * yValues[i], 0);
        const sumX2 = xValues.reduce((sum, x) => sum + x * x, 0);
        const sumY2 = yValues.reduce((sum, y) => sum + y * y, 0);

        const numerator = n * sumXY - sumX * sumY;
        const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

        if (denominator === 0) return 0;

        return numerator / denominator;
    },

    async analyzeCorrelation(type1, type2, days = 90, lag = 0) {
        const startDate = DateUtils.getDateRangeStart(days);
        const endDate = new Date();
        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = endDate.toISOString().split('T')[0];

        // Get data for both types (handling environmental types differently)
        const data1 = await this.getTypeData(type1, startDate, endDate, startDateStr, endDateStr);
        const data2 = await this.getTypeData(type2, startDate, endDate, startDateStr, endDateStr);

        const MIN_SAMPLE_SIZE = 20; // Minimum for meaningful correlation (~3 weeks of daily data)
        if (data1.length < MIN_SAMPLE_SIZE || data2.length < MIN_SAMPLE_SIZE) {
            return {
                type1,
                type2,
                correlation: null,
                strength: 'insufficient data',
                sampleSize: Math.min(data1.length, data2.length),
                lag,
            };
        }

        const alignedData = this.alignDataWithLag(data1, data2, lag);

        if (alignedData.x.length < MIN_SAMPLE_SIZE) {
            return {
                type1,
                type2,
                correlation: null,
                strength: 'insufficient overlap',
                sampleSize: alignedData.x.length,
                lag,
            };
        }

        const r = this.calculatePearson(alignedData.x, alignedData.y);

        return {
            type1,
            type2,
            correlation: r !== null ? Math.round(r * 1000) / 1000 : null,
            strength: this.interpretStrength(r),
            sampleSize: alignedData.x.length,
            lag,
        };
    },

    async getTypeData(type, startDate, endDate, startDateStr, endDateStr) {
        // Check if this is an environmental type
        if (typeof TypeUtils !== 'undefined' && TypeUtils.isEnvironmentalType(type)) {
            return this.getEnvironmentalData(type, startDateStr, endDateStr);
        }

        // Regular entry type
        const entries = await EntryService.getEntriesByType(type, startDate, endDate);
        return this.aggregateByDay(entries, type);
    },

    async getEnvironmentalData(type, startDate, endDate) {
        // Get user location from localStorage
        const locationStr = localStorage.getItem('userLocation');
        if (!locationStr) return [];

        const location = JSON.parse(locationStr);

        // For lunar phase, calculate on-the-fly
        if (type === 'lunar_phase') {
            return this.getLunarData(startDate, endDate);
        }

        // For other environmental types, query IndexedDB
        if (typeof EnvironmentalDataService === 'undefined') return [];

        const records = await EnvironmentalDataService.getByDateRange(
            startDate,
            endDate,
            location.latitude,
            location.longitude
        );

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
                value: r[field],
            }));
    },

    getLunarData(startDate, endDate) {
        if (typeof LunarPhaseCalculator === 'undefined') return [];

        const result = [];
        const start = new Date(startDate);
        const end = new Date(endDate);

        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const lunar = LunarPhaseCalculator.calculate(d);
            result.push({
                date: lunar.date,
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
                value: aggregatedValue,
            });
        });

        return result;
    },

    getAggregationMethod(type) {
        const customMethod = CustomTypeService.getAggregationMethod(type);
        if (customMethod) return customMethod;

        const methods = {
            mood: (entries) => {
                const sum = entries.reduce((acc, e) => acc + e.value, 0);
                return sum / entries.length;
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
                return entries.reduce((acc, e) => acc + e.value, 0);
            },
            medication: (entries) => {
                return entries.length;
            },
            weight: (entries) => {
                return entries[entries.length - 1].value;
            },
            temperature: (entries) => {
                const sum = entries.reduce((acc, e) => acc + e.value, 0);
                return sum / entries.length;
            },
            pain: (entries) => {
                const sum = entries.reduce((acc, e) => acc + e.value, 0);
                return sum / entries.length;
            },
        };

        return methods[type] || ((entries) => entries[0].value);
    },

    alignDataWithLag(data1, data2, lag = 0) {
        const dateMap1 = new Map(data1.map(d => [d.date, d.value]));
        const dateMap2 = new Map(data2.map(d => [d.date, d.value]));

        const allDates = [...new Set([...data1.map(d => d.date), ...data2.map(d => d.date)])].sort();

        const x = [];
        const y = [];

        allDates.forEach((date, index) => {
            const laggedIndex = index + lag;
            
            if (laggedIndex < 0 || laggedIndex >= allDates.length) {
                return;
            }

            const laggedDate = allDates[laggedIndex];
            const val1 = dateMap1.get(date);
            const val2 = dateMap2.get(laggedDate);

            if (val1 !== undefined && val2 !== undefined) {
                x.push(val1);
                y.push(val2);
            }
        });

        return { x, y };
    },

    interpretStrength(r) {
        if (r === null) return 'unknown';
        
        const abs = Math.abs(r);
        
        if (abs < 0.1) return 'negligible';
        if (abs < 0.3) return 'weak';
        if (abs < 0.5) return 'moderate';
        if (abs < 0.7) return 'strong';
        return 'very strong';
    },

    async findBestLag(type1, type2, days = 90, maxLag = 7) {
        const results = [];

        for (let lag = -maxLag; lag <= maxLag; lag++) {
            const result = await this.analyzeCorrelation(type1, type2, days, lag);
            if (result.correlation !== null) {
                results.push(result);
            }
        }

        if (results.length === 0) return null;

        results.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
        return results[0];
    },

    async analyzeAllPairs(types, days = 90) {
        const results = [];

        for (let i = 0; i < types.length; i++) {
            for (let j = i + 1; j < types.length; j++) {
                const result = await this.analyzeCorrelation(types[i], types[j], days);
                if (result.correlation !== null) {
                    results.push(result);
                }
            }
        }

        results.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
        return results;
    }
};
