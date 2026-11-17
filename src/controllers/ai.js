/**
 * AI Controller
 * Handles AI insights and food photo analysis endpoints
 */

import { AIProvider } from '../services/ai-provider.js';

const INSIGHTS_SYSTEM_PROMPT = `You are a health pattern analyst. Analyze the user's tracking data and answer their question.

RULES:
1. Only discuss patterns visible in the provided data
2. Never provide medical diagnoses or treatment advice
3. Suggest consulting healthcare providers for medical concerns
4. Keep responses under 500 words
5. Use plain language, avoid jargon
6. If data is insufficient, say so

OUTPUT FORMAT (JSON only):
{
  "summary": "Brief 1-2 sentence overview",
  "patterns": ["Pattern 1", "Pattern 2"],
  "suggestions": ["Actionable suggestion 1"],
  "confidence": "low|medium|high"
}`;

const FOOD_VISION_PROMPT = `Analyze this food photo. Identify all food items and estimate nutritional content.

OUTPUT FORMAT (JSON only):
{
  "explanation": "Brief reasoning for estimates (portion sizes, cooking method, etc.)",
  "foods": ["food item 1", "food item 2"],
  "estimates": {
    "calories": 450,
    "protein_g": 35,
    "carbs_g": 40,
    "fats_g": 12
  },
  "confidence": "low|medium|high"
}

If image is not food or unclear, respond:
{ "explanation": "Why analysis failed", "error": "Unable to identify food items", "confidence": "low" }`;

const DISCLAIMER = 'AI insights are observations only, not medical advice.';

function sanitizeText(text) {
    if (typeof text !== 'string') return text;
    return text.replace(/<[^>]*>/g, '').replace(/[<>]/g, '');
}

function sanitizeInsights(obj) {
    if (!obj) return obj;
    return {
        summary: sanitizeText(obj.summary || ''),
        patterns: (obj.patterns || []).map(sanitizeText),
        suggestions: (obj.suggestions || []).map(sanitizeText),
        confidence: obj.confidence || 'low'
    };
}

export class AIController {
    constructor(env) {
        this.db = env.DB;
        this.aiProvider = new AIProvider(env);
    }

    async handleInsights(request, userId) {
        const isPaid = await this.checkPaidTier(userId);
        if (!isPaid) {
            return this.error('Paid subscription required', 403);
        }

        const limitCheck = await this.aiProvider.checkLimit(userId, 'insights');
        if (!limitCheck.allowed) {
            return this.rateLimitResponse(limitCheck);
        }

        const body = await request.json();
        const { entries, question, dateRange } = body;

        if (!entries || !Array.isArray(entries) || entries.length === 0) {
            return this.error('Entries array required', 400);
        }

        const filtered = entries.map(e => ({
            type: e.type,
            value: e.value,
            timestamp: e.timestamp
        }));

        const messages = [
            { role: 'system', content: INSIGHTS_SYSTEM_PROMPT },
            { role: 'user', content: `Data: ${JSON.stringify(filtered)}\n\nQuestion: ${question || 'What patterns do you see in my data?'}` }
        ];

        try {
            const { response, provider } = await this.aiProvider.runTextGeneration(messages);
            const content = typeof response === 'string' ? response : response.response;
            
            let insights;
            try {
                const jsonMatch = content.match(/\{[\s\S]*\}/);
                const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { summary: content, patterns: [], suggestions: [], confidence: 'low' };
                insights = sanitizeInsights(parsed);
            } catch {
                insights = sanitizeInsights({ summary: content, patterns: [], suggestions: [], confidence: 'low' });
            }

            const remaining = await this.aiProvider.incrementLimit(userId, 'insights');
            await this.logAudit(userId, 'insights', provider, null, null);

            return this.json({
                success: true,
                insights,
                disclaimer: DISCLAIMER,
                usage: { remaining, resetAt: limitCheck.resetAt }
            });
        } catch (err) {
            console.error('AI insights error:', err);
            return this.error('AI service unavailable', 503);
        }
    }

    async handleFoodAnalysis(request, userId) {
        const isPaid = await this.checkPaidTier(userId);
        if (!isPaid) {
            return this.error('Paid subscription required', 403);
        }

        const limitCheck = await this.aiProvider.checkLimit(userId, 'food');
        if (!limitCheck.allowed) {
            return this.rateLimitResponse(limitCheck);
        }

        const body = await request.json();
        const { image } = body;

        if (!image) {
            return this.error('Image data required', 400);
        }

        if (this.hasExifData(image)) {
            return this.error('Image contains EXIF data - please strip metadata before upload', 400);
        }

        try {
            const { response, provider } = await this.aiProvider.runVision(image, FOOD_VISION_PROMPT);
            const content = typeof response === 'string' ? response : (response.response || response.description);

            let analysis;
            try {
                const jsonMatch = content.match(/\{[\s\S]*\}/);
                analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
            } catch {
                analysis = null;
            }

            if (!analysis || analysis.error) {
                return this.json({
                    success: false,
                    error: analysis?.error || 'Unable to analyze image',
                    usage: { remaining: limitCheck.remaining, resetAt: limitCheck.resetAt }
                }, 422);
            }

            const remaining = await this.aiProvider.incrementLimit(userId, 'food');
            await this.logAudit(userId, 'food_analysis', provider, null, analysis.explanation);

            const entries = [
                { type: 'food', value: analysis.foods.join(', ') },
                { type: 'calories', value: analysis.estimates.calories },
                { type: 'protein', value: analysis.estimates.protein_g },
                { type: 'carbs', value: analysis.estimates.carbs_g },
                { type: 'fats', value: analysis.estimates.fats_g }
            ];

            return this.json({
                success: true,
                analysis,
                entries,
                usage: { remaining, resetAt: limitCheck.resetAt }
            });
        } catch (err) {
            console.error('Food analysis error:', err);
            return this.error('AI service unavailable', 503);
        }
    }

    hasExifData(base64Image) {
        try {
            const binary = atob(base64Image);
            if (binary.length < 12) return false;
            if (binary.charCodeAt(0) !== 0xFF || binary.charCodeAt(1) !== 0xD8) return false;
            let offset = 2;
            while (offset < binary.length - 4) {
                if (binary.charCodeAt(offset) !== 0xFF) break;
                const marker = binary.charCodeAt(offset + 1);
                if (marker === 0xE1) return true;
                if (marker === 0xD9) break;
                if (marker >= 0xD0 && marker <= 0xD8) { offset += 2; continue; }
                const len = (binary.charCodeAt(offset + 2) << 8) | binary.charCodeAt(offset + 3);
                offset += 2 + len;
            }
            return false;
        } catch {
            return false;
        }
    }

    async checkPaidTier(userId) {
        const user = await this.db.prepare(
            'SELECT tier FROM users WHERE id = ?'
        ).bind(userId).first();
        return user?.tier === 'paid';
    }

    async logAudit(userId, requestType, provider, tokensUsed, explanation) {
        try {
            await this.db.prepare(
                `INSERT INTO ai_audit_log (id, user_id, request_type, provider, tokens_used, explanation, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`
            ).bind(
                crypto.randomUUID(),
                userId,
                requestType,
                provider,
                tokensUsed,
                explanation,
                new Date().toISOString()
            ).run();
        } catch (err) {
            console.error('Audit log error:', err);
        }
    }

    rateLimitResponse(limitCheck) {
        return new Response(JSON.stringify({
            success: false,
            error: 'Weekly limit exceeded',
            usage: { remaining: 0, resetAt: limitCheck.resetAt }
        }), {
            status: 429,
            headers: {
                'Content-Type': 'application/json',
                'X-RateLimit-Limit': '31',
                'X-RateLimit-Remaining': '0',
                'X-RateLimit-Reset': limitCheck.resetAt
            }
        });
    }

    json(data, status = 200) {
        return new Response(JSON.stringify(data), {
            status,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    error(message, status = 400) {
        return this.json({ success: false, error: message }, status);
    }
}
