/**
 * AI Service
 * Client-side interface for AI insights
 */

const AIService = {
    async getInsightsWithPreview(entries, question, dateRange) {
        if (!await AIConsent.requireConsent()) {
            throw new Error('AI consent required');
        }

        const filtered = entries.map(e => ({
            type: e.type,
            value: e.value,
            timestamp: e.timestamp
        }));

        const confirmed = await this.showDataPreview(filtered, question);
        if (!confirmed) {
            throw new Error('User cancelled');
        }

        return this.getInsights(entries, question, dateRange);
    },

    showDataPreview(data, question) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            overlay.innerHTML = `
                <div class="modal data-preview-modal">
                    <h2>Data to Send</h2>
                    <p><strong>Question:</strong> ${question || 'What patterns do you see?'}</p>
                    <h3>Entries (${data.length}):</h3>
                    <pre class="data-preview">${JSON.stringify(data.slice(0, 10), null, 2)}${data.length > 10 ? '\n... and ' + (data.length - 10) + ' more' : ''}</pre>
                    <p class="preview-note">Only type, value, and timestamp are sent. Notes are excluded.</p>
                    <div class="modal-actions">
                        <button class="btn-secondary" id="preview-cancel">Cancel</button>
                        <button class="btn-primary" id="preview-send">Send to AI</button>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);

            overlay.querySelector('#preview-send').addEventListener('click', () => {
                overlay.remove();
                resolve(true);
            });

            overlay.querySelector('#preview-cancel').addEventListener('click', () => {
                overlay.remove();
                resolve(false);
            });
        });
    },

    async getInsights(entries, question, dateRange) {
        const filtered = entries.map(e => ({
            type: e.type,
            value: e.value,
            timestamp: e.timestamp
        }));

        const res = await fetch('/ai/insights', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                entries: filtered,
                question,
                dateRange
            })
        });

        const data = await res.json();

        if (!data.success) {
            throw new Error(data.error || 'AI request failed');
        }

        return data;
    },

    async getUsage() {
        const res = await fetch('/ai/insights', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ entries: [], question: '' })
        });

        const data = await res.json();
        return data.usage || { remaining: 0, resetAt: null };
    },

    formatInsights(insights) {
        const parts = [];

        if (insights.summary) {
            parts.push(insights.summary);
        }

        if (insights.patterns?.length) {
            parts.push('\nPatterns observed:');
            insights.patterns.forEach(p => parts.push(`• ${p}`));
        }

        if (insights.suggestions?.length) {
            parts.push('\nSuggestions:');
            insights.suggestions.forEach(s => parts.push(`• ${s}`));
        }

        return parts.join('\n');
    }
};

window.AIService = AIService;
