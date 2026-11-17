// Chart instance stored outside Alpine reactivity to prevent proxy conflicts
let _chartInstance = null;
let _chartCanvas = null;

function destroyChartInstance() {
    if (_chartInstance) {
        try {
            _chartInstance.destroy();
        } catch (e) {
            console.warn('Error destroying chart:', e);
        }
        _chartInstance = null;
        _chartCanvas = null;
    }
}

// Main Alpine.js App Component
function app() {
    return {
        // View Management
        currentView: 'home',
        showWelcome: true,

        // Settings and Data
        settings: {},
        entries: [],
        recentEntries: [],

        // Entry Form State
        entryFormOpen: false,
        entryFormType: null,
        entryFormData: {
            value: null,
            timestamp: '',
            notes: '',
        },
        duplicateWarning: null,
        confirmDuplicate: false,

        // Chart State
        chartTypes: ['mood', 'sleep'],
        chartRange: 7,
        chartData: [],
        chartDebounceTimer: null,
        isRenderingChart: false,
        isLoadingChartData: false,
        chartUpdateRequestId: 0,
        chartSelectorOpen: false,

        // Filter State
        filterType: '',

        // Reminder State
        reminderBanner: null,

        // Welcome Screen State
        welcomeSettings: {
            enabledTypes: ['mood', 'sleep', 'temperature', 'exercise'],
        },

        // Import/Export State
        showExportDialog: false,
        showImportDialog: false,
        importFile: null,
        importProgress: null,
        importErrors: [],

        // Custom Types State
        customTypes: [],
        showCustomTypeDialog: false,
        emojiSearch: '',
        emojiDropdownOpen: false,
        emojiOptions: [
            { emoji: '📊', name: 'Chart', keywords: ['data', 'analytics', 'graph', 'stats'] },
            { emoji: '😊', name: 'Smiling Face', keywords: ['happy', 'smile', 'joy'] },
            { emoji: '😴', name: 'Sleepy Face', keywords: ['sleep', 'tired', 'rest'] },
            { emoji: '🏃', name: 'Running', keywords: ['exercise', 'run', 'fitness'] },
            { emoji: '🍎', name: 'Red Apple', keywords: ['nutrition', 'food', 'healthy'] },
            { emoji: '💧', name: 'Droplet', keywords: ['water', 'drink', 'hydration'] },
            { emoji: '💊', name: 'Pill', keywords: ['medication', 'medicine', 'pill'] },
            { emoji: '⚖️', name: 'Balance Scale', keywords: ['weight', 'balance', 'measure'] },
            { emoji: '🌡️', name: 'Thermometer', keywords: ['temperature', 'fever', 'heat'] },
            { emoji: '😣', name: 'Persevering Face', keywords: ['pain', 'ache', 'discomfort'] },
            { emoji: '🧠', name: 'Brain', keywords: ['focus', 'mind', 'thinking'] },
            { emoji: '❤️', name: 'Red Heart', keywords: ['health', 'love', 'wellbeing'] },
            { emoji: '🌙', name: 'Crescent Moon', keywords: ['night', 'sleep', 'evening'] },
            { emoji: '☀️', name: 'Sun', keywords: ['day', 'energy', 'morning'] },
            { emoji: '📝', name: 'Memo', keywords: ['notes', 'journal', 'writing'] },
            { emoji: '🧘', name: 'Person in Lotus Position', keywords: ['meditation', 'mindfulness', 'calm'] },
            { emoji: '🚶', name: 'Walking', keywords: ['steps', 'movement', 'activity'] },
            { emoji: '🏋️', name: 'Weight Lifting', keywords: ['strength', 'gym', 'workout'] },
            { emoji: '🥗', name: 'Green Salad', keywords: ['diet', 'food', 'nutrition'] },
            { emoji: '📈', name: 'Chart Increasing', keywords: ['trend', 'growth', 'analysis'] },
            { emoji: '🌿', name: 'Herb', keywords: ['nature', 'wellness', 'calm'] },
            { emoji: '🍋', name: 'Lemon', keywords: ['vitamin c', 'fresh', 'energy'] },
            { emoji: '🍓', name: 'Strawberry', keywords: ['fruit', 'sweet', 'snack'] },
            { emoji: '🥑', name: 'Avocado', keywords: ['healthy', 'fat', 'food'] },
            { emoji: '🥦', name: 'Broccoli', keywords: ['vegetable', 'nutrition', 'green'] },
            { emoji: '🍵', name: 'Teacup Without Handle', keywords: ['tea', 'warm', 'relax'] },
            { emoji: '☕', name: 'Hot Beverage', keywords: ['coffee', 'caffeine', 'morning'] },
            { emoji: '🫖', name: 'Teapot', keywords: ['tea', 'brew', 'relax'] },
            { emoji: '🛌', name: 'Bed', keywords: ['sleep', 'rest', 'recovery'] },
            { emoji: '🧴', name: 'Lotion Bottle', keywords: ['skincare', 'self care', 'routine'] },
            { emoji: '🪥', name: 'Toothbrush', keywords: ['hygiene', 'oral care', 'routine'] },
            { emoji: '🧼', name: 'Soap', keywords: ['clean', 'hygiene', 'wash'] },
            { emoji: '🧺', name: 'Basket', keywords: ['chores', 'laundry', 'household'] },
            { emoji: '🧹', name: 'Broom', keywords: ['cleaning', 'chores', 'tidy'] },
            { emoji: '🧯', name: 'Fire Extinguisher', keywords: ['safety', 'preparedness', 'emergency'] },
            { emoji: '📚', name: 'Books', keywords: ['reading', 'study', 'learning'] },
            { emoji: '✏️', name: 'Pencil', keywords: ['writing', 'notes', 'study'] },
            { emoji: '🧩', name: 'Puzzle Piece', keywords: ['focus', 'problem solving', 'brain'] },
            { emoji: '🎯', name: 'Direct Hit', keywords: ['goals', 'focus', 'targets'] },
            { emoji: '⏰', name: 'Alarm Clock', keywords: ['time', 'schedule', 'reminder'] },
            { emoji: '⌛', name: 'Hourglass', keywords: ['time', 'waiting', 'patience'] },
            { emoji: '🗓️', name: 'Calendar', keywords: ['schedule', 'planning', 'date'] },
            { emoji: '🛒', name: 'Shopping Cart', keywords: ['groceries', 'shopping', 'errands'] },
            { emoji: '🚰', name: 'Potable Water', keywords: ['hydration', 'water', 'drink'] },
            { emoji: '🫗', name: 'Pouring Liquid', keywords: ['drink', 'water', 'hydration'] },
            { emoji: '🚴', name: 'Bicycle', keywords: ['cycling', 'fitness', 'cardio'] },
            { emoji: '🧗', name: 'Person Climbing', keywords: ['challenge', 'strength', 'fitness'] },
            { emoji: '🏊', name: 'Person Swimming', keywords: ['swim', 'cardio', 'exercise'] },
            { emoji: '🧎', name: 'Person Kneeling', keywords: ['stretch', 'meditation', 'calm'] },
            { emoji: '🪷', name: 'Lotus', keywords: ['mindfulness', 'meditation', 'calm'] },
            { emoji: '🔆', name: 'Bright Button', keywords: ['energy', 'light', 'focus'] },
            { emoji: '🔋', name: 'Battery', keywords: ['energy', 'battery', 'stamina'] },
            { emoji: '🫀', name: 'Anatomical Heart', keywords: ['cardio', 'heart', 'health'] },
            { emoji: '🫁', name: 'Lungs', keywords: ['breathing', 'cardio', 'health'] },
            { emoji: '🦴', name: 'Bone', keywords: ['strength', 'body', 'health'] },
            { emoji: '🦷', name: 'Tooth', keywords: ['dental', 'health', 'hygiene'] },
            { emoji: '🧠', name: 'Brain', keywords: ['mind', 'learning', 'focus'] },
            { emoji: '🦶', name: 'Foot', keywords: ['steps', 'movement', 'walking'] },
            { emoji: '👁️', name: 'Eye', keywords: ['vision', 'awareness', 'focus'] },
            { emoji: '👂', name: 'Ear', keywords: ['hearing', 'listening', 'awareness'] },
            { emoji: '🗣️', name: 'Speaking Head', keywords: ['communication', 'talking', 'voice'] },
            { emoji: '🤝', name: 'Handshake', keywords: ['social', 'support', 'connection'] },
            { emoji: '💤', name: 'Zzz', keywords: ['sleep', 'rest', 'nap'] },
            { emoji: '✨', name: 'Sparkles', keywords: ['mood', 'motivation', 'positive'] },
            { emoji: '🎵', name: 'Musical Note', keywords: ['music', 'mood', 'sound'] },
            { emoji: '🎨', name: 'Artist Palette', keywords: ['creativity', 'art', 'expression'] },
            { emoji: '🧶', name: 'Yarn', keywords: ['craft', 'hobby', 'creative'] },
            { emoji: '🌞', name: 'Sun With Face', keywords: ['morning', 'energy', 'mood'] },
            { emoji: '🌧️', name: 'Cloud With Rain', keywords: ['weather', 'mood', 'gloomy'] },
            { emoji: '🌈', name: 'Rainbow', keywords: ['hope', 'mood', 'positive'] },
            { emoji: '🔥', name: 'Fire', keywords: ['intensity', 'energy', 'motivation'] },
            { emoji: '❄️', name: 'Snowflake', keywords: ['cool', 'calm', 'winter'] },
            { emoji: '🧭', name: 'Compass', keywords: ['direction', 'goals', 'focus'] },
            { emoji: '🧮', name: 'Abacus', keywords: ['tracking', 'counting', 'metrics'] },
            { emoji: '📍', name: 'Round Pushpin', keywords: ['location', 'habit', 'tracking'] },
            { emoji: '🏡', name: 'House With Garden', keywords: ['home', 'routine', 'comfort'] },
            { emoji: '🚶‍♀️', name: 'Woman Walking', keywords: ['walking', 'steps', 'movement'] },
            { emoji: '🚶‍♂️', name: 'Man Walking', keywords: ['walking', 'steps', 'movement'] },
            { emoji: '🏕️', name: 'Camping', keywords: ['outdoors', 'nature', 'rest'] },
            { emoji: '🌌', name: 'Milky Way', keywords: ['night', 'sleep', 'wonder'] },
            { emoji: '🧿', name: 'Nazar Amulet', keywords: ['protection', 'focus', 'wellbeing'] },
            { emoji: '🪴', name: 'Potted Plant', keywords: ['growth', 'nature', 'care'] },
            { emoji: '🌻', name: 'Sunflower', keywords: ['sunshine', 'growth', 'positivity'] },
            { emoji: '🍀', name: 'Four Leaf Clover', keywords: ['luck', 'positivity', 'hope'] },
            { emoji: '🎁', name: 'Wrapped Gift', keywords: ['reward', 'celebration', 'milestone'] },
            { emoji: '🏆', name: 'Trophy', keywords: ['achievement', 'goal', 'success'] },
            { emoji: '🎉', name: 'Party Popper', keywords: ['celebration', 'joy', 'success'] },
        ],
        customTypeForm: {
            name: '',
            emoji: '📊',
            valueType: 'number',
            unit: '',
            min: 0,
            max: 100,
            step: 1,
            aggregation: 'average',
        },
        editingCustomType: null,

        // Correlation Analysis State
        showCorrelationDialog: false,
        correlationResults: [],
        correlationLoading: false,
        chartCorrelations: [],

        // Auth State
        authUser: null,
        authLoading: false,
        authError: null,
        authSuccess: null,
        showAuthModal: false,
        authTab: 'login',
        authForm: { email: '', password: '', confirmPassword: '' },

        // Push Notification State
        pushSupported: false,
        pushPermission: 'default',
        pushSubscribed: false,
        pushLoading: false,
        pushError: null,
        pushReminderTime: '09:00',
        showAccountSection: false,
        accountDetails: null,
        accountLoading: false,
        showDeleteConfirm: false,

        // Environmental Data State
        environmentalDataLoading: false,
        environmentalBackfillProgress: null,
        userLocation: null,
        locationPermissionStatus: 'unknown',

        // Initialization
        async init() {
            this.loadSettings();
            this.loadCustomTypes();
            await this.loadEntries();
            this.checkFirstTime();
            this.loadChartTypes();
            this.setupWatchers();
            this.applyTheme();
            // Auth: restore cached user, then silently verify session
            this.authUser = AuthService._loadUserLocal();
            this.initAuth();
            this.initPush();
            // Initialize environmental data fetching
            this.initEnvironmentalData();
            if (!this.showWelcome && this.currentView === 'home') {
                setTimeout(() => {
                    this.loadChartData();
                    this.loadCorrelationsForChart();
                }, 100);
            }
        },

        loadChartTypes() {
            try {
                const saved = localStorage.getItem('patternTrackerChartTypes');
                if (saved) {
                    const parsed = JSON.parse(saved);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        this.chartTypes = parsed;
                        return;
                    }
                }
            } catch (e) {
                // fall through to default
            }
            this.chartTypes = [...(this.settings.enabledTypes || ['mood', 'sleep'])];
        },

        saveChartTypes() {
            try {
                localStorage.setItem('patternTrackerChartTypes', JSON.stringify(this.chartTypes));
            } catch (e) {
                console.warn('Could not save chart types:', e);
            }
        },

        // Settings Management
        loadSettings() {
            this.settings = SettingsService.loadSettings();
        },

        saveSettings() {
            SettingsService.saveSettings(this.settings);
            this.applyTheme();
        },

        checkFirstTime() {
            const hasVisited = localStorage.getItem('patternTrackerVisited');
            if (!hasVisited) {
                this.showWelcome = true;
            } else {
                this.showWelcome = false;
            }
        },

        completeWelcome() {
            this.settings.enabledTypes = this.welcomeSettings.enabledTypes;
            this.saveSettings();
            localStorage.setItem('patternTrackerVisited', 'true');
            this.showWelcome = false;
            this.currentView = 'home';
            this.checkReminders();
            setTimeout(() => {
                this.loadChartData();
                this.loadCorrelationsForChart();
            }, 100);
        },

        // Entry Management
        async loadEntries() {
            this.entries = await EntryService.getAllEntries();
            this.recentEntries = await EntryService.getRecentEntries(10);
        },

        openEntryForm(type) {
            this.entryFormType = type;
            this.entryFormOpen = true;
            this.entryFormData = {
                value: type === 'mood' ? 5 : type === 'pain' ? 0 : null,
                timestamp: DateUtils.getLocalDateString(new Date()),
                notes: '',
            };
            this.duplicateWarning = null;
            this.confirmDuplicate = false;
        },

        closeEntryForm() {
            this.entryFormOpen = false;
            this.entryFormType = null;
            this.duplicateWarning = null;
            this.confirmDuplicate = false;
        },

        async submitEntry() {
            const validation = EntryService.validateEntry({
                type: this.entryFormType,
                value: this.entryFormData.value,
                timestamp: this.entryFormData.timestamp,
                timezone: DateUtils.getLocalTimezone(),
                notes: this.entryFormData.notes,
            });

            if (!validation.valid) {
                alert('Validation error: ' + validation.errors.join(', '));
                return;
            }

            // Check for duplicates if warnings enabled
            if (this.settings.duplicateWarnings && !this.confirmDuplicate) {
                const duplicates = await EntryService.checkDuplicate(
                    this.entryFormType,
                    this.entryFormData.timestamp
                );

                if (duplicates.length > 0) {
                    this.duplicateWarning = `You already have a ${this.getTypeLabel(this.entryFormType)} entry within the typical window. Continue anyway?`;
                    return;
                }
            }

            // Save entry
            try {
                await EntryService.createEntry({
                    type: this.entryFormType,
                    value: this.entryFormData.value,
                    timestamp: DateUtils.parseLocalDateTime(this.entryFormData.timestamp),
                    timezone: DateUtils.getLocalTimezone(),
                    notes: this.entryFormData.notes,
                });

                await this.loadEntries();
                this.closeEntryForm();
                this.checkReminders();
                if (this.currentView === 'home') this.scheduleChartLoad();
            } catch (error) {
                console.error('Error saving entry:', error);
                alert('Error saving entry. Please try again.');
            }
        },

        async editEntry(entry) {
            this.entryFormType = entry.type;
            this.entryFormData = {
                value: entry.value,
                timestamp: DateUtils.getLocalDateString(new Date(entry.timestamp)),
                notes: entry.notes,
            };
            this.entryFormOpen = true;
        },

        async deleteEntry(id) {
            if (confirm('Are you sure you want to delete this entry?')) {
                try {
                    await EntryService.deleteEntry(id);
                    await this.loadEntries();
                    if (this.currentView === 'home') this.scheduleChartLoad();
                } catch (error) {
                    console.error('Error deleting entry:', error);
                    alert('Error deleting entry. Please try again.');
                }
            }
        },

        // Chart Management
        scheduleChartLoad() {
            // Debounce rapid changes
            if (this.chartDebounceTimer) {
                clearTimeout(this.chartDebounceTimer);
            }
            this.chartDebounceTimer = setTimeout(() => {
                this.loadChartData();
            }, 150);
        },

        async loadChartData() {
            // Prevent re-entrant calls
            if (this.isLoadingChartData) {
                return;
            }

            // Increment request ID to track this specific load
            const requestId = ++this.chartUpdateRequestId;

            if (this.chartTypes.length === 0) {
                this.chartData = [];
                destroyChartInstance();
                return;
            }

            this.isLoadingChartData = true;

            try {
                const data = await ChartUtils.prepareMultiTypeChartData(
                    this.chartTypes,
                    this.chartRange,
                    this.settings
                );

                // Check if this request is still the latest
                if (requestId !== this.chartUpdateRequestId) {
                    return;
                }

                // Deep clone to break Alpine reactivity proxy
                this.chartData = JSON.parse(JSON.stringify(data));

                // Use requestAnimationFrame to ensure DOM is ready
                requestAnimationFrame(() => {
                    if (requestId === this.chartUpdateRequestId) {
                        this.updateChart();
                    }
                });
            } catch (error) {
                console.error('Error loading chart data:', error);
            } finally {
                this.isLoadingChartData = false;
            }
        },

        updateChart() {
            // Prevent concurrent updates
            if (this.isRenderingChart) {
                return;
            }

            const canvas = document.getElementById('chart-canvas');
            if (!canvas) {
                return;
            }

            // Verify canvas is in DOM and has dimensions
            if (!canvas.offsetParent && !canvas.offsetWidth) {
                return;
            }

            // If no data, destroy chart and exit
            if (this.chartData.length === 0) {
                destroyChartInstance();
                return;
            }

            this.isRenderingChart = true;

            try {
                // Deep clone data to ensure no Alpine proxies
                const cleanData = JSON.parse(JSON.stringify(this.chartData));
                const cleanTypes = JSON.parse(JSON.stringify(this.chartTypes));
                const config = ChartUtils.createMultiTypeChartConfig(cleanTypes, cleanData);

                // Check if existing chart's canvas is still the same element
                if (_chartInstance && _chartCanvas !== canvas) {
                    destroyChartInstance();
                }

                if (_chartInstance) {
                    _chartInstance.data.labels = config.data.labels;
                    _chartInstance.data.datasets = config.data.datasets;

                    if (config.options.scales && _chartInstance.options.scales) {
                        Object.keys(config.options.scales).forEach(scaleId => {
                            if (_chartInstance.options.scales[scaleId]) {
                                Object.assign(_chartInstance.options.scales[scaleId], config.options.scales[scaleId]);
                            }
                        });
                    }

                    _chartInstance.update('none');
                } else {
                    const ctx = canvas.getContext('2d');
                    if (!ctx) {
                        console.error('Could not get canvas 2d context');
                        return;
                    }
                    _chartCanvas = canvas;
                    _chartInstance = new Chart(ctx, config);
                }
            } catch (e) {
                console.error('Error updating chart:', e);
                destroyChartInstance();
            } finally {
                this.isRenderingChart = false;
            }
        },

        // Reminders
        checkReminders() {
            const missingTypes = this.missingTodayTypes;
            if (missingTypes.length > 0) {
                const typeLabels = missingTypes.map(t => this.getTypeLabel(t)).join(', ');
                this.reminderBanner = `You haven't logged ${typeLabels} today. Tap to add.`;
            } else {
                this.reminderBanner = null;
            }
        },

        dismissReminder() {
            this.reminderBanner = null;
        },

        // Type Utilities
        getTypeEmoji(type) {
            return TypeUtils.getTypeEmoji(type);
        },

        getTypeLabel(type) {
            return TypeUtils.getTypeLabel(type);
        },

        getTypeUnit(type) {
            return TypeUtils.getTypeUnit(type);
        },

        getTypeConstraints(type) {
            return EntryService.getTypeConstraints(type);
        },

        formatEntryValue(entry) {
            return TypeUtils.formatEntryValue(entry);
        },

        // Date Utilities
        formatTime(isoString) {
            return DateUtils.formatTime(isoString);
        },

        formatDate(isoString) {
            return DateUtils.formatDate(isoString);
        },

        // Computed Properties
        get filteredEmojiOptions() {
            const query = (this.emojiSearch || '').trim().toLowerCase();
            const options = this.emojiOptions.filter(option => {
                if (!query) return true;
                const haystack = [option.emoji, option.name, ...(option.keywords || [])].join(' ').toLowerCase();
                return haystack.includes(query);
            });
            return options.slice(0, 12);
        },

        get chartAvailableTypes() {
            const allTypes = [
                ...(this.settings.enabledTypes || []),
                ...this.customTypes.map(t => t.id),
            ];
            
            // Add environmental types if enabled and location is available
            if (this.settings.enableEnvironmentalData !== false && this.userLocation) {
                allTypes.push(...TypeUtils.getEnvironmentalTypes());
            }
            
            return [...new Set(allTypes)];
        },

        get filteredEntries() {
            if (!this.filterType) {
                return this.entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            }
            return this.entries
                .filter(entry => entry.type === this.filterType)
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        },

        get missingTodayTypes() {
            const today = new Date().toLocaleDateString('en-CA');
            const todayTypes = new Set(
                this.entries
                    .filter(entry => {
                        const entryDate = new Date(entry.timestamp).toLocaleDateString('en-CA');
                        return entryDate === today;
                    })
                    .map(entry => entry.type)
            );
            const allEnabledTypes = [
                ...(this.settings.enabledTypes || []),
                ...this.customTypes.map(t => t.id)
            ];
            return allEnabledTypes.filter(type => !todayTypes.has(type));
        },

        // Theme Management
        applyTheme() {
            const theme = this.settings.theme || 'auto';
            const isDark = theme === 'dark' || 
                (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
            
            const root = document.documentElement;
            
            if (isDark) {
                root.style.setProperty('--color-bg', '#111827');
                root.style.setProperty('--color-bg-secondary', '#1f2937');
                root.style.setProperty('--color-border', '#374151');
                root.style.setProperty('--color-text', '#f3f4f6');
                root.style.setProperty('--color-text-secondary', '#d1d5db');
                root.style.setProperty('--color-text-light', '#9ca3af');
                root.setAttribute('data-theme', 'dark');
            } else {
                root.style.setProperty('--color-bg', '#ffffff');
                root.style.setProperty('--color-bg-secondary', '#f9fafb');
                root.style.setProperty('--color-border', '#e5e7eb');
                root.style.setProperty('--color-text', '#1f2937');
                root.style.setProperty('--color-text-secondary', '#6b7280');
                root.style.setProperty('--color-text-light', '#9ca3af');
                root.setAttribute('data-theme', 'light');
            }
        },

        // Import/Export Methods
        openExportDialog() {
            this.showExportDialog = true;
        },

        closeExportDialog() {
            this.showExportDialog = false;
        },

        async exportCSV() {
            try {
                const entries = await EntryService.getAllEntries();
                if (!entries.length) {
                    alert('No entries to export');
                    return;
                }
                const csv = CSVExporter.exportEntries(entries);
                const filename = `pattern-tracker-${new Date().toISOString().split('T')[0]}.csv`;
                FileDownload.save(filename, csv, 'text/csv');
                this.closeExportDialog();
            } catch (error) {
                console.error('Export error:', error);
                alert('Error exporting data: ' + error.message);
            }
        },

        async exportJSON() {
            try {
                const entries = await EntryService.getAllEntries();
                if (!entries.length) {
                    alert('No entries to export');
                    return;
                }
                const json = JSONExporter.exportEntries(entries);
                const filename = `pattern-tracker-${new Date().toISOString().split('T')[0]}.json`;
                FileDownload.save(filename, json, 'application/json');
                this.closeExportDialog();
            } catch (error) {
                console.error('Export error:', error);
                alert('Error exporting data: ' + error.message);
            }
        },

        openImportDialog() {
            this.showImportDialog = true;
            this.importFile = null;
            this.importProgress = null;
            this.importErrors = [];
        },

        closeImportDialog() {
            this.showImportDialog = false;
            this.importFile = null;
            this.importProgress = null;
            this.importErrors = [];
        },

        handleFileSelect(event) {
            const file = event.target.files[0];
            if (!file) return;

            const sizeCheck = ImportValidator.validateFileSize(file);
            if (!sizeCheck.valid) {
                alert(sizeCheck.error);
                event.target.value = '';
                return;
            }

            this.importFile = file;
        },

        // Custom Types Methods
        loadCustomTypes() {
            this.customTypes = CustomTypeService.getCustomTypes();
        },

        openCustomTypeDialog() {
            this.showCustomTypeDialog = true;
            this.editingCustomType = null;
            this.customTypeForm = {
                name: '',
                emoji: '📊',
                valueType: 'number',
                unit: '',
                min: 0,
                max: 100,
                step: 1,
                aggregation: 'average',
            };
            this.emojiSearch = '';
            this.emojiDropdownOpen = false;
        },

        closeCustomTypeDialog() {
            this.showCustomTypeDialog = false;
            this.editingCustomType = null;
            this.emojiSearch = '';
            this.emojiDropdownOpen = false;
        },

        selectCustomTypeEmoji(option) {
            this.customTypeForm.emoji = option.emoji;
            this.emojiSearch = option.name;
            this.emojiDropdownOpen = false;
        },

        async saveCustomType() {
            try {
                if (!this.customTypeForm.emoji) {
                    this.customTypeForm.emoji = '📊';
                }
                if (this.editingCustomType) {
                    CustomTypeService.updateCustomType(this.editingCustomType, this.customTypeForm);
                } else {
                    CustomTypeService.createCustomType(this.customTypeForm);
                }
                this.loadCustomTypes();
                this.closeCustomTypeDialog();
            } catch (error) {
                alert('Error saving custom type: ' + error.message);
            }
        },

        editCustomType(typeId) {
            const customType = this.customTypes.find(t => t.id === typeId);
            if (!customType) return;

            this.editingCustomType = typeId;
            this.customTypeForm = { ...customType };
            const matchedEmoji = this.emojiOptions.find(option => option.emoji === customType.emoji);
            this.emojiSearch = matchedEmoji ? matchedEmoji.name : (customType.emoji || '');
            this.emojiDropdownOpen = false;
            this.showCustomTypeDialog = true;
        },

        async deleteCustomType(typeId) {
            if (!confirm('Delete this custom type? Existing entries will not be deleted.')) {
                return;
            }

            try {
                CustomTypeService.deleteCustomType(typeId);
                this.loadCustomTypes();
            } catch (error) {
                alert('Error deleting custom type: ' + error.message);
            }
        },

        // Correlation Analysis Methods
        openCorrelationDialog() {
            this.showCorrelationDialog = true;
            this.correlationResults = [];
        },

        closeCorrelationDialog() {
            this.showCorrelationDialog = false;
            this.correlationResults = [];
        },

        async analyzeCorrelations() {
            this.correlationLoading = true;
            this.correlationResults = [];

            try {
                const allTypes = this.chartAvailableTypes;

                if (allTypes.length < 2) {
                    alert('Enable at least 2 data types to analyze correlations');
                    this.correlationLoading = false;
                    return;
                }

                const results = await CorrelationAnalyzer.analyzeAllPairs(allTypes, 90);
                const MIN_SAMPLE_SIZE = 20;
                this.correlationResults = results.filter(r => r.sampleSize >= MIN_SAMPLE_SIZE);
            } catch (error) {
                console.error('Correlation analysis error:', error);
                alert('Error analyzing correlations: ' + error.message);
            } finally {
                this.correlationLoading = false;
            }
        },

        getCorrelationColor(r) {
            if (r === null) return '#6b7280';
            const abs = Math.abs(r);
            if (abs < 0.3) return '#6b7280';
            if (abs < 0.5) return '#f59e0b';
            if (r > 0) return '#10b981';
            return '#ef4444';
        },

        getCorrelationStrengthLabel(r) {
            if (r === null) return 'Unknown';
            const abs = Math.abs(r);
            if (abs < 0.1) return 'Non-existent';
            if (abs < 0.3) return 'Low';
            if (abs < 0.5) return 'Moderate';
            if (abs < 0.7) return 'High';
            return 'Very High';
        },

        getCorrelationStrengthClass(r) {
            if (r === null) return 'correlation-unknown';
            const abs = Math.abs(r);
            if (abs < 0.1) return 'correlation-none';
            if (abs < 0.3) return 'correlation-low';
            if (abs < 0.5) return 'correlation-moderate';
            if (abs < 0.7) return 'correlation-high';
            return 'correlation-very-high';
        },

        async loadCorrelationsForChart() {
            this.correlationLoading = true;
            this.chartCorrelations = [];

            try {
                const allTypes = this.chartAvailableTypes;

                if (allTypes.length < 2) {
                    this.correlationLoading = false;
                    return;
                }

                const results = await CorrelationAnalyzer.analyzeAllPairs(allTypes, 90);
                const MIN_SAMPLE_SIZE = 20;
                this.chartCorrelations = results.filter(r => r.sampleSize >= MIN_SAMPLE_SIZE);
            } catch (error) {
                console.error('Correlation analysis error:', error);
            } finally {
                this.correlationLoading = false;
            }
        },

        async processImport() {
            if (!this.importFile) {
                alert('Please select a file to import');
                return;
            }

            this.importProgress = 'Reading file...';
            this.importErrors = [];

            try {
                const text = await this.importFile.text();
                const filename = this.importFile.name.toLowerCase();
                let rawEntries = [];

                if (filename.endsWith('.csv')) {
                    this.importProgress = 'Parsing CSV...';
                    rawEntries = CSVParser.parse(text);
                } else if (filename.endsWith('.json')) {
                    this.importProgress = 'Parsing JSON...';
                    const parsed = JSONImporter.parseJSON(text);
                    rawEntries = JSONImporter.extractEntries(parsed);
                } else {
                    throw new Error('Unsupported file format. Please use .csv or .json files.');
                }

                this.importProgress = 'Validating entries...';
                const { validEntries, errors } = ImportValidator.validateEntries(rawEntries);

                if (errors.length > 0) {
                    this.importErrors = errors;
                }

                if (validEntries.length === 0) {
                    this.importProgress = 'No valid entries to import';
                    return;
                }

                this.importProgress = `Importing ${validEntries.length} entries...`;
                const imported = await ImportService.importEntries(validEntries);

                await this.loadEntries();
                this.importProgress = `Successfully imported ${imported} entries${errors.length > 0 ? ` (${errors.length} skipped due to errors)` : ''}`;

                setTimeout(() => {
                    this.closeImportDialog();
                }, 2000);
            } catch (error) {
                console.error('Import error:', error);
                this.importProgress = null;
                alert('Error importing data: ' + error.message);
            }
        },

        // -------------------------------------------------------------------------
        // Auth Methods
        // -------------------------------------------------------------------------

        async initAuth() {
            // Silently verify/restore session in the background
            const user = await AuthService.checkSession();
            if (user) {
                this.authUser = user;
            } else {
                this.authUser = null;
            }
        },

        openAuthModal(tab = 'login') {
            this.authTab = tab;
            this.authForm = { email: '', password: '', confirmPassword: '' };
            this.authError = null;
            this.authSuccess = null;
            this.showAuthModal = true;
        },

        closeAuthModal() {
            this.showAuthModal = false;
            this.authError = null;
            this.authSuccess = null;
        },

        async submitLogin() {
            this.authError = null;
            this.authSuccess = null;
            if (!this.authForm.email || !this.authForm.password) {
                this.authError = 'Email and password are required.';
                return;
            }
            this.authLoading = true;
            try {
                const result = await AuthService.login(this.authForm.email, this.authForm.password);
                if (result.success) {
                    this.authUser = result.user;
                    this.closeAuthModal();
                } else {
                    this.authError = result.error;
                }
            } finally {
                this.authLoading = false;
            }
        },

        async submitRegister() {
            this.authError = null;
            this.authSuccess = null;
            if (!this.authForm.email || !this.authForm.password) {
                this.authError = 'Email and password are required.';
                return;
            }
            if (this.authForm.password !== this.authForm.confirmPassword) {
                this.authError = 'Passwords do not match.';
                return;
            }
            this.authLoading = true;
            try {
                const result = await AuthService.register(this.authForm.email, this.authForm.password);
                if (result.success) {
                    this.authUser = result.user;
                    this.authSuccess = 'Account created! Push notifications can now be set up in Settings.';
                    setTimeout(() => this.closeAuthModal(), 2000);
                } else {
                    this.authError = result.error;
                }
            } finally {
                this.authLoading = false;
            }
        },

        async logout() {
            await AuthService.logout();
            this.authUser = null;
            this.pushSubscribed = false;
            this.accountDetails = null;
        },

        // -------------------------------------------------------------------------
        // Account Management Methods
        // -------------------------------------------------------------------------

        async loadAccountDetails() {
            this.accountLoading = true;
            try {
                this.accountDetails = await AuthService.getAccount();
                if (this.accountDetails?.reminderTime) {
                    this.pushReminderTime = this.accountDetails.reminderTime;
                }
            } finally {
                this.accountLoading = false;
            }
        },

        async saveReminderTime() {
            if (!this.authUser) return;
            const result = await AuthService.updateAccount({ reminderTime: this.pushReminderTime });
            if (!result.success) {
                alert('Failed to save reminder time: ' + result.error);
            }
        },

        async confirmDeleteAccount() {
            this.showDeleteConfirm = false;
            const result = await AuthService.deleteAccount();
            if (result.success) {
                this.authUser = null;
                this.pushSubscribed = false;
                this.accountDetails = null;
                this.currentView = 'settings';
                alert('Account deleted successfully.');
            } else {
                alert('Failed to delete account: ' + result.error);
            }
        },

        // -------------------------------------------------------------------------
        // Push Notification Methods
        // -------------------------------------------------------------------------

        initPush() {
            this.pushSupported = AuthService.isPushSupported();
            if (this.pushSupported) {
                this.pushPermission = Notification.permission;
                AuthService.getPushSubscription().then(sub => {
                    this.pushSubscribed = !!sub;
                });
            }
        },

        async enablePushNotifications() {
            if (!this.authUser) {
                this.openAuthModal('login');
                return;
            }
            this.pushLoading = true;
            this.pushError = null;
            try {
                // VAPID public key would normally come from the server; using placeholder
                const vapidPublicKey = window.__VAPID_PUBLIC_KEY || '';
                if (!vapidPublicKey) {
                    this.pushError = 'Push notifications are not yet configured on this server.';
                    return;
                }
                const result = await AuthService.subscribePush(vapidPublicKey);
                if (result.success) {
                    this.pushSubscribed = true;
                    this.pushPermission = 'granted';
                } else {
                    this.pushError = result.error;
                }
            } finally {
                this.pushLoading = false;
            }
        },

        async disablePushNotifications() {
            this.pushLoading = true;
            this.pushError = null;
            try {
                const result = await AuthService.unsubscribePush();
                if (result.success) {
                    this.pushSubscribed = false;
                } else {
                    this.pushError = result.error;
                }
            } finally {
                this.pushLoading = false;
            }
        },

        // -------------------------------------------------------------------------
        // Environmental Data Methods
        // -------------------------------------------------------------------------

        async initEnvironmentalData() {
            // Check if environmental data is enabled in settings
            if (this.settings.enableEnvironmentalData === false) {
                return;
            }

            // Check if we should fetch (1 hour cooldown)
            const lastFetch = localStorage.getItem('lastEnvironmentalFetch');
            const oneHourAgo = Date.now() - (60 * 60 * 1000);
            
            if (lastFetch && parseInt(lastFetch) > oneHourAgo) {
                // Load cached location if available
                const cachedLocation = localStorage.getItem('userLocation');
                if (cachedLocation) {
                    this.userLocation = JSON.parse(cachedLocation);
                    this.locationPermissionStatus = 'granted';
                }
                return;
            }

            // Try to fetch environmental data
            await this.fetchEnvironmentalData();
        },

        async fetchEnvironmentalData() {
            if (this.environmentalDataLoading) return;
            
            this.environmentalDataLoading = true;
            
            try {
                // Request geolocation
                const location = await ExternalDataService.getLocationPermission();
                this.userLocation = location;
                this.locationPermissionStatus = 'granted';
                localStorage.setItem('userLocation', JSON.stringify(location));

                // Check if this is first time getting location (trigger backfill)
                const hasBackfilled = localStorage.getItem('hasBackfilledEnvironmental');
                if (!hasBackfilled) {
                    await this.backfillEnvironmentalData(location);
                    localStorage.setItem('hasBackfilledEnvironmental', 'true');
                }

                // Fetch today's weather
                const today = new Date();
                const todayStr = today.toISOString().split('T')[0];
                
                const weather = await WeatherService.fetchWeather(location.latitude, location.longitude, today);
                const geo = await GeomagneticService.fetchKpIndex(today);

                // Save to IndexedDB
                if (weather || geo) {
                    await EnvironmentalDataService.saveEnvironmentalData({
                        date: todayStr,
                        latitude: location.latitude,
                        longitude: location.longitude,
                        tempMax: weather?.tempMax ?? null,
                        tempMin: weather?.tempMin ?? null,
                        pressure: weather?.pressure ?? null,
                        precipitation: weather?.precipitation ?? null,
                        uvIndex: weather?.uvIndex ?? null,
                        kpIndex: geo?.maxKp ?? null,
                        stormLevel: geo?.stormLevel ?? null,
                    });
                }

                localStorage.setItem('lastEnvironmentalFetch', Date.now().toString());
                
            } catch (error) {
                if (error.code === 1) {
                    // Permission denied
                    this.locationPermissionStatus = 'denied';
                    console.warn('Location permission denied');
                } else if (error.code === 2) {
                    // Position unavailable
                    this.locationPermissionStatus = 'unavailable';
                    console.warn('Location position unavailable');
                } else if (error.code === 3) {
                    // Timeout - common in incognito mode or slow networks
                    this.locationPermissionStatus = 'timeout';
                    console.warn('Location request timed out. Try again or check browser settings.');
                } else {
                    console.error('Environmental data fetch error:', error);
                    this.locationPermissionStatus = 'error';
                }
            } finally {
                this.environmentalDataLoading = false;
            }
        },

        async backfillEnvironmentalData(location) {
            if (!location) return;

            try {
                // Get all unique dates from user entries
                const entries = await EntryService.getAllEntries();
                if (entries.length === 0) return;

                const entryDates = [...new Set(
                    entries.map(e => new Date(e.timestamp).toISOString().split('T')[0])
                )].sort();

                // Find dates without environmental data
                const missingDates = await EnvironmentalDataService.getMissingDates(
                    entryDates, 
                    location.latitude, 
                    location.longitude
                );

                if (missingDates.length === 0) return;

                this.environmentalBackfillProgress = {
                    total: missingDates.length,
                    completed: 0,
                    status: 'Fetching historical weather data...'
                };

                // Fetch historical weather for missing dates
                const weatherResults = await WeatherService.fetchHistoricalWeather(
                    location.latitude,
                    location.longitude,
                    missingDates
                );

                // Save each result to IndexedDB
                for (const weather of weatherResults) {
                    await EnvironmentalDataService.saveEnvironmentalData({
                        date: weather.date,
                        latitude: location.latitude,
                        longitude: location.longitude,
                        tempMax: weather.tempMax,
                        tempMin: weather.tempMin,
                        pressure: weather.pressure,
                        precipitation: weather.precipitation,
                        uvIndex: weather.uvIndex,
                        kpIndex: null, // Geomagnetic data not available historically via simple API
                        stormLevel: null,
                    });

                    this.environmentalBackfillProgress.completed++;
                }

                this.environmentalBackfillProgress.status = 'Complete!';
                
                // Clear progress after a delay
                setTimeout(() => {
                    this.environmentalBackfillProgress = null;
                }, 2000);

            } catch (error) {
                console.error('Environmental backfill error:', error);
                this.environmentalBackfillProgress = {
                    ...this.environmentalBackfillProgress,
                    status: 'Error: ' + error.message
                };
                setTimeout(() => {
                    this.environmentalBackfillProgress = null;
                }, 3000);
            }
        },

        // -------------------------------------------------------------------------
        // Watchers Setup
        setupWatchers() {
            // Watch for chart types changes (shallow watch to avoid deep reactivity issues)
            let lastChartTypes = JSON.stringify(this.chartTypes);
            this.$watch('chartTypes', () => {
                const currentChartTypes = JSON.stringify(this.chartTypes);
                if (currentChartTypes !== lastChartTypes) {
                    lastChartTypes = currentChartTypes;
                    this.saveChartTypes();
                    // Use debounced load for rapid checkbox clicks
                    this.scheduleChartLoad();
                }
            });

            // Watch for chart range changes
            this.$watch('chartRange', () => {
                this.scheduleChartLoad();
            });

            // Watch for view changes
            this.$watch('currentView', (newView, oldView) => {
                // Clean up chart when leaving home view
                if (oldView === 'home' && newView !== 'home') {
                    // Cancel any pending loads
                    if (this.chartDebounceTimer) {
                        clearTimeout(this.chartDebounceTimer);
                        this.chartDebounceTimer = null;
                    }
                    this.chartUpdateRequestId++;
                    destroyChartInstance();
                }
                
                if (newView === 'home') {
                    this.checkReminders();
                    // Small delay to ensure DOM is ready after view transition
                    setTimeout(() => {
                        this.loadChartData();
                        this.loadCorrelationsForChart();
                    }, 50);
                }
            });
        },
    };
}

// Initialize Alpine.js when DOM is ready
document.addEventListener('alpine:init', () => {
    console.log('Alpine.js initialized');
});
