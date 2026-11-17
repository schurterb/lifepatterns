/**
 * AI Provider Service
 * Handles Cloudflare Workers AI with OpenAI fallback
 */

const CF_AI_TIMEOUT = 5000;
const WEEKLY_LIMIT = 31;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export class AIProvider {
    constructor(env) {
        this.ai = env.AI;
        this.rateLimitKV = env.RATE_LIMIT_KV;
        this.openaiKey = env.OPENAI_API_KEY;
    }

    async checkLimit(userId, type) {
        const key = `ai:${type}:${userId}`;
        const data = await this.rateLimitKV.get(key, 'json');
        
        if (!data) {
            return { allowed: true, remaining: WEEKLY_LIMIT, resetAt: this.getWeekEnd() };
        }

        const remaining = WEEKLY_LIMIT - data.count;
        return {
            allowed: remaining > 0,
            remaining: Math.max(0, remaining),
            resetAt: data.resetAt
        };
    }

    async incrementLimit(userId, type) {
        const key = `ai:${type}:${userId}`;
        const data = await this.rateLimitKV.get(key, 'json');
        const resetAt = this.getWeekEnd();
        
        const newData = data ? { count: data.count + 1, resetAt: data.resetAt } : { count: 1, resetAt };
        await this.rateLimitKV.put(key, JSON.stringify(newData), { expirationTtl: Math.ceil(WEEK_MS / 1000) });
        
        return WEEKLY_LIMIT - newData.count;
    }

    getWeekEnd() {
        const now = new Date();
        const daysUntilSunday = 7 - now.getDay();
        const sunday = new Date(now);
        sunday.setDate(now.getDate() + daysUntilSunday);
        sunday.setHours(23, 59, 59, 999);
        return sunday.toISOString();
    }

    async runTextGeneration(messages, options = {}) {
        let provider = 'cloudflare';
        let response;

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), CF_AI_TIMEOUT);

            response = await this.ai.run('@cf/meta/llama-3.1-8b-instruct-fast', {
                messages,
                max_tokens: options.maxTokens || 1024,
                temperature: options.temperature || 0.7
            });

            clearTimeout(timeout);
        } catch (err) {
            if (this.openaiKey) {
                provider = 'openai';
                response = await this.callOpenAI(messages, options);
            } else {
                throw err;
            }
        }

        return { response, provider };
    }

    async runVision(imageBase64, prompt, options = {}) {
        let provider = 'cloudflare';
        let response;

        try {
            const imageBytes = Uint8Array.from(atob(imageBase64), c => c.charCodeAt(0));
            
            response = await this.ai.run('@cf/llava-hf/llava-1.5-7b-hf', {
                image: [...imageBytes],
                prompt,
                max_tokens: options.maxTokens || 512
            });
        } catch (err) {
            if (this.openaiKey) {
                provider = 'openai';
                response = await this.callOpenAIVision(imageBase64, prompt, options);
            } else {
                throw err;
            }
        }

        return { response, provider };
    }

    async callOpenAI(messages, options = {}) {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.openaiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages,
                max_tokens: options.maxTokens || 1024,
                temperature: options.temperature || 0.7,
                store: false
            })
        });

        const data = await res.json();
        return { response: data.choices[0].message.content };
    }

    async callOpenAIVision(imageBase64, prompt, options = {}) {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.openaiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [{
                    role: 'user',
                    content: [
                        { type: 'text', text: prompt },
                        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }
                    ]
                }],
                max_tokens: options.maxTokens || 512,
                store: false
            })
        });

        const data = await res.json();
        return { response: data.choices[0].message.content };
    }
}
