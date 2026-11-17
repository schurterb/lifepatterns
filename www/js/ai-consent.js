/**
 * AI Consent Module
 * Manages user consent for AI features
 */

const AIConsent = {
    STORAGE_KEY: 'ai_consent_granted',

    hasConsent() {
        return localStorage.getItem(this.STORAGE_KEY) === 'true';
    },

    grantConsent() {
        localStorage.setItem(this.STORAGE_KEY, 'true');
    },

    revokeConsent() {
        localStorage.removeItem(this.STORAGE_KEY);
    },

    async requireConsent() {
        if (this.hasConsent()) return true;
        return this.showConsentModal();
    },

    showConsentModal() {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            overlay.innerHTML = `
                <div class="modal ai-consent-modal">
                    <h2>AI Features Consent</h2>
                    <p>Pattern Tracker uses AI to analyze your health data and provide insights.</p>
                    <div class="consent-details">
                        <h3>What data is shared:</h3>
                        <ul>
                            <li>Entry types (mood, sleep, etc.)</li>
                            <li>Entry values and timestamps</li>
                            <li>Food photos (processed, not stored)</li>
                        </ul>
                        <h3>What is NOT shared:</h3>
                        <ul>
                            <li>Personal notes</li>
                            <li>Account information</li>
                            <li>Location data</li>
                        </ul>
                        <h3>AI Providers:</h3>
                        <p>Cloudflare Workers AI (primary) or OpenAI (fallback)</p>
                    </div>
                    <label class="consent-checkbox">
                        <input type="checkbox" id="ai-consent-check">
                        <span>I consent to sending my health data to AI services for analysis</span>
                    </label>
                    <div class="modal-actions">
                        <button class="btn-secondary" id="ai-consent-cancel">Cancel</button>
                        <button class="btn-primary" id="ai-consent-accept" disabled>Accept</button>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);

            const checkbox = overlay.querySelector('#ai-consent-check');
            const acceptBtn = overlay.querySelector('#ai-consent-accept');
            const cancelBtn = overlay.querySelector('#ai-consent-cancel');

            checkbox.addEventListener('change', () => {
                acceptBtn.disabled = !checkbox.checked;
            });

            acceptBtn.addEventListener('click', () => {
                this.grantConsent();
                overlay.remove();
                resolve(true);
            });

            cancelBtn.addEventListener('click', () => {
                overlay.remove();
                resolve(false);
            });
        });
    }
};

window.AIConsent = AIConsent;
