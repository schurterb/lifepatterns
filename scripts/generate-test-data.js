/**
 * Generate 1 month of simulated test data for Life Patterns app.
 * 
 * Usage: Copy and paste this entire script into the browser console
 * while on the Life Patterns app page, then run:
 *   await generateTestData();
 * 
 * Or to clear existing data first:
 *   await generateTestData({ clearExisting: true });
 */

(function() {
    'use strict';

    const DATA_TYPES = {
        mood: { min: 1, max: 10, pattern: 'wave', frequency: 1 },
        sleep: { min: 4, max: 9, pattern: 'stable', variance: 1.5 },
        exercise: { min: 0, max: 120, pattern: 'sporadic', probability: 0.6 },
        water: { min: 2, max: 12, pattern: 'stable', variance: 2 },
        nutrition: { min: 1200, max: 2500, pattern: 'stable', variance: 300 },
        pain: { min: 0, max: 10, pattern: 'inverse-mood', frequency: 1 },
        temperature: { min: 97.0, max: 99.5, pattern: 'stable', variance: 0.5 },
        weight: { min: 150, max: 180, pattern: 'trend', direction: -0.05 },
    };

    function generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    function generateValue(type, config, dayIndex, totalDays) {
        const { min, max, pattern, variance, frequency, probability, direction } = config;
        const range = max - min;
        const midpoint = (max + min) / 2;
        
        let value;
        
        switch (pattern) {
            case 'wave':
                // Sinusoidal pattern with some noise
                const phase = (dayIndex / totalDays) * Math.PI * 2 * (frequency || 1);
                value = midpoint + (range / 3) * Math.sin(phase) + (Math.random() - 0.5) * (range / 4);
                break;
                
            case 'inverse-mood':
                // Inverse of mood pattern (for pain correlation)
                const moodPhase = (dayIndex / totalDays) * Math.PI * 2 * (frequency || 1);
                const moodValue = midpoint + (range / 3) * Math.sin(moodPhase);
                value = max - (moodValue - min) + (Math.random() - 0.5) * (range / 4);
                break;
                
            case 'stable':
                // Stable around midpoint with variance
                value = midpoint + (Math.random() - 0.5) * 2 * (variance || range / 4);
                break;
                
            case 'sporadic':
                // Random with probability of occurrence
                if (Math.random() > (probability || 0.5)) {
                    return null; // Skip this day
                }
                value = min + Math.random() * range;
                break;
                
            case 'trend':
                // Gradual trend over time
                const trendOffset = dayIndex * (direction || 0);
                value = midpoint + trendOffset + (Math.random() - 0.5) * (variance || range / 4);
                break;
                
            default:
                value = min + Math.random() * range;
        }
        
        // Clamp to valid range
        value = Math.max(min, Math.min(max, value));
        
        // Round appropriately
        if (type === 'temperature') {
            return Math.round(value * 10) / 10;
        } else if (type === 'weight') {
            return Math.round(value * 10) / 10;
        } else if (['mood', 'pain', 'sleep', 'water'].includes(type)) {
            return Math.round(value);
        } else {
            return Math.round(value);
        }
    }

    function getRandomTime(baseDate, type) {
        const date = new Date(baseDate);
        
        // Set realistic times based on type
        switch (type) {
            case 'sleep':
                // Morning entry for previous night's sleep
                date.setHours(7 + Math.floor(Math.random() * 3), Math.floor(Math.random() * 60));
                break;
            case 'mood':
                // Random time during waking hours
                date.setHours(8 + Math.floor(Math.random() * 14), Math.floor(Math.random() * 60));
                break;
            case 'exercise':
                // Morning or evening
                date.setHours(Math.random() > 0.5 ? 6 + Math.floor(Math.random() * 3) : 17 + Math.floor(Math.random() * 3), Math.floor(Math.random() * 60));
                break;
            case 'weight':
                // Morning
                date.setHours(6 + Math.floor(Math.random() * 2), Math.floor(Math.random() * 60));
                break;
            case 'temperature':
                // Morning or evening
                date.setHours(Math.random() > 0.5 ? 7 : 19, Math.floor(Math.random() * 60));
                break;
            default:
                // Random waking hours
                date.setHours(8 + Math.floor(Math.random() * 12), Math.floor(Math.random() * 60));
        }
        
        return date.toISOString();
    }

    function getTimezone() {
        return Intl.DateTimeFormat().resolvedOptions().timeZone;
    }

    async function generateTestData(options = {}) {
        const { 
            clearExisting = false, 
            days = 30,
            types = null // null means use all enabled types from settings
        } = options;

        console.log('🔄 Starting test data generation...');

        // Check if we're on the right page
        if (typeof db === 'undefined' || typeof EntryService === 'undefined') {
            console.error('❌ Error: This script must be run on the Life Patterns app page.');
            console.error('   Make sure you are on the app and the page is fully loaded.');
            return;
        }

        // Get enabled types from settings or use provided types
        let enabledTypes;
        if (types) {
            enabledTypes = types;
        } else {
            const settings = SettingsService.loadSettings();
            enabledTypes = settings.enabledTypes || ['mood', 'sleep'];
        }

        console.log(`📊 Generating data for types: ${enabledTypes.join(', ')}`);
        console.log(`📅 Date range: ${days} days`);

        // Clear existing data if requested
        if (clearExisting) {
            console.log('🗑️  Clearing existing entries...');
            await db.entries.clear();
        }

        const now = new Date();
        const entries = [];
        const totalDays = days;

        // Generate entries for each day
        for (let dayOffset = days - 1; dayOffset >= 0; dayOffset--) {
            const date = new Date(now);
            date.setDate(date.getDate() - dayOffset);
            date.setHours(0, 0, 0, 0);

            for (const type of enabledTypes) {
                const config = DATA_TYPES[type];
                if (!config) {
                    console.warn(`⚠️  Unknown type: ${type}, skipping...`);
                    continue;
                }

                const value = generateValue(type, config, totalDays - dayOffset, totalDays);
                
                // Skip if value is null (sporadic pattern)
                if (value === null) continue;

                const timestamp = getRandomTime(date, type);
                const entry = {
                    id: generateUUID(),
                    schemaVersion: 1,
                    timestamp: timestamp,
                    timezone: getTimezone(),
                    type: type,
                    value: value,
                    notes: '',
                    createdAt: timestamp,
                    updatedAt: timestamp,
                };

                entries.push(entry);
            }
        }

        // Bulk insert entries
        console.log(`💾 Inserting ${entries.length} entries...`);
        
        try {
            await db.entries.bulkAdd(entries);
            console.log(`✅ Successfully added ${entries.length} test entries!`);
            
            // Refresh the app state if Alpine is available
            if (typeof Alpine !== 'undefined') {
                const appEl = document.querySelector('[x-data]');
                if (appEl && appEl._x_dataStack) {
                    const appData = appEl._x_dataStack[0];
                    if (appData && typeof appData.loadEntries === 'function') {
                        await appData.loadEntries();
                        if (typeof appData.loadChartData === 'function') {
                            await appData.loadChartData();
                        }
                        console.log('🔄 App state refreshed!');
                    }
                }
            }
            
            console.log('\n📈 Data generation complete!');
            console.log('   Refresh the page or navigate to see the new data.');
            
            return { success: true, count: entries.length };
        } catch (error) {
            console.error('❌ Error inserting entries:', error);
            return { success: false, error: error.message };
        }
    }

    // Expose to global scope
    window.generateTestData = generateTestData;

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  📊 Life Patterns Test Data Generator Loaded!');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    console.log('  Usage:');
    console.log('    await generateTestData()');
    console.log('');
    console.log('  Options:');
    console.log('    await generateTestData({ clearExisting: true })  // Clear first');
    console.log('    await generateTestData({ days: 60 })             // 60 days');
    console.log('    await generateTestData({ types: ["mood","sleep"] })');
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');

})();
