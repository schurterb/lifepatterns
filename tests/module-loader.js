#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Load browser-based JavaScript modules into Node.js context
 * This uses direct eval in a function scope to capture global assignments
 */
function loadModule(modulePath, context = {}) {
    const fullPath = path.resolve(modulePath);
    
    if (!fs.existsSync(fullPath)) {
        throw new Error(`Module not found: ${fullPath}`);
    }

    let code = fs.readFileSync(fullPath, 'utf8');
    
    // Remove 'use strict' to allow implicit globals
    code = code.replace(/['"]use strict['"];?\s*/g, '');
    
    // Create a function that will execute the code and return all defined globals
    const wrapper = `
        (function(context) {
            ${code}
            
            // Return all objects that were defined in this scope
            return {
                FileDownload: typeof FileDownload !== 'undefined' ? FileDownload : undefined,
                CSVExporter: typeof CSVExporter !== 'undefined' ? CSVExporter : undefined,
                CSVParser: typeof CSVParser !== 'undefined' ? CSVParser : undefined,
                JSONExporter: typeof JSONExporter !== 'undefined' ? JSONExporter : undefined,
                JSONImporter: typeof JSONImporter !== 'undefined' ? JSONImporter : undefined,
                ImportValidator: typeof ImportValidator !== 'undefined' ? ImportValidator : undefined,
                ImportService: typeof ImportService !== 'undefined' ? ImportService : undefined,
                CustomTypeService: typeof CustomTypeService !== 'undefined' ? CustomTypeService : undefined,
                WeatherService: typeof WeatherService !== 'undefined' ? WeatherService : undefined,
                GeomagneticService: typeof GeomagneticService !== 'undefined' ? GeomagneticService : undefined,
                LunarPhaseCalculator: typeof LunarPhaseCalculator !== 'undefined' ? LunarPhaseCalculator : undefined,
                ExternalDataService: typeof ExternalDataService !== 'undefined' ? ExternalDataService : undefined,
                CorrelationAnalyzer: typeof CorrelationAnalyzer !== 'undefined' ? CorrelationAnalyzer : undefined,
                EntryService: typeof EntryService !== 'undefined' ? EntryService : undefined,
                SettingsService: typeof SettingsService !== 'undefined' ? SettingsService : undefined,
                EnvironmentalDataService: typeof EnvironmentalDataService !== 'undefined' ? EnvironmentalDataService : undefined,
                DateUtils: typeof DateUtils !== 'undefined' ? DateUtils : undefined,
                TypeUtils: typeof TypeUtils !== 'undefined' ? TypeUtils : undefined,
                ValidationUtils: typeof ValidationUtils !== 'undefined' ? ValidationUtils : undefined,
                FoodCapture: typeof FoodCapture !== 'undefined' ? FoodCapture : undefined,
                EncryptionService: typeof EncryptionService !== 'undefined' ? EncryptionService : undefined,
                AIService: typeof AIService !== 'undefined' ? AIService : undefined,
                ...context
            };
        })
    `;

    try {
        const fn = eval(wrapper);
        const result = fn(context);
        
        // Filter out undefined values
        const filtered = {};
        for (const key in result) {
            if (result[key] !== undefined) {
                filtered[key] = result[key];
            }
        }
        
        return filtered;
    } catch (error) {
        console.error(`Error loading module ${modulePath}:`, error.message);
        throw error;
    }
}

/**
 * Load multiple modules in sequence, passing context between them
 */
function loadModules(modulePaths, initialContext = {}) {
    let context = { ...initialContext };
    
    for (const modulePath of modulePaths) {
        const exports = loadModule(modulePath, context);
        Object.assign(context, exports);
        
        // Also make exports available globally so modules can reference each other
        for (const key in exports) {
            if (exports[key] !== undefined) {
                global[key] = exports[key];
            }
        }
    }
    
    return context;
}

module.exports = {
    loadModule,
    loadModules
};
