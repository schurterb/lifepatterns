#!/usr/bin/env node
'use strict';

/**
 * Tests the real AIProvider rate-limiting logic (src/services/ai-provider.js)
 * with a real in-memory KV store that implements the Cloudflare KV interface,
 * and the real AIService.formatInsights (www/js/ai.js). Cloudflare Workers AI
 * and OpenAI HTTP calls are not exercised here — they are external services
 * covered by integration tests.
 */

require('./mock-browser');
// Node 22 provides native crypto (WebCrypto) — no shims needed.

const path = require('path');
const { TestHarness, assertEqual, assertTrue, assertFalse } = require('./test-harness');
const { loadModule } = require('./module-loader');

// Real in-memory KV implementation mirroring Cloudflare's KVNamespace interface.
class InMemoryKV {
    constructor() { this.store = new Map(); }
    async get(key, type) {
        const v = this.store.get(key);
        if (v === undefined) return null;
        if (type === 'json') return JSON.parse(v);
        return v;
    }
    async put(key, value, _options) { this.store.set(key, value); }
    async delete(key) { this.store.delete(key); }
}

(async () => {
    const { AIProvider } = await import('../src/services/ai-provider.js');

    // Load real client-side AIService for formatInsights coverage
    loadModule(path.join(__dirname, '../www/js/ai.js'));
    const AIService = global.window.AIService;

    const harness = new TestHarness();

    harness.describe('AIProvider.checkLimit / incrementLimit (real)', () => {
        harness.it('fresh user gets full quota of 31 on first check', async () => {
            const p = new AIProvider({ AI: null, RATE_LIMIT_KV: new InMemoryKV() });
            const r = await p.checkLimit('user-1', 'insights');
            assertTrue(r.allowed);
            assertEqual(r.remaining, 31);
            assertTrue(typeof r.resetAt === 'string' && r.resetAt.length > 0);
        });

        harness.it('incrementLimit returns decreasing remaining count', async () => {
            const p = new AIProvider({ AI: null, RATE_LIMIT_KV: new InMemoryKV() });
            assertEqual(await p.incrementLimit('u', 'insights'), 30);
            assertEqual(await p.incrementLimit('u', 'insights'), 29);
            assertEqual(await p.incrementLimit('u', 'insights'), 28);
        });

        harness.it('blocks when quota exhausted', async () => {
            const p = new AIProvider({ AI: null, RATE_LIMIT_KV: new InMemoryKV() });
            for (let i = 0; i < 31; i++) await p.incrementLimit('u', 'insights');
            const r = await p.checkLimit('u', 'insights');
            assertFalse(r.allowed);
            assertEqual(r.remaining, 0);
        });

        harness.it('tracks quota independently per type', async () => {
            const p = new AIProvider({ AI: null, RATE_LIMIT_KV: new InMemoryKV() });
            for (let i = 0; i < 31; i++) await p.incrementLimit('u', 'insights');
            const insights = await p.checkLimit('u', 'insights');
            const food = await p.checkLimit('u', 'food');
            assertFalse(insights.allowed, 'insights exhausted');
            assertTrue(food.allowed, 'food should still have full quota');
            assertEqual(food.remaining, 31);
        });

        harness.it('tracks quota independently per user', async () => {
            const p = new AIProvider({ AI: null, RATE_LIMIT_KV: new InMemoryKV() });
            for (let i = 0; i < 31; i++) await p.incrementLimit('user-A', 'insights');
            const b = await p.checkLimit('user-B', 'insights');
            assertTrue(b.allowed);
            assertEqual(b.remaining, 31);
        });

        harness.it('persists count to KV using ai:<type>:<userId> key', async () => {
            const kv = new InMemoryKV();
            const p = new AIProvider({ AI: null, RATE_LIMIT_KV: kv });
            await p.incrementLimit('user-X', 'food');
            const raw = await kv.get('ai:food:user-X');
            const parsed = JSON.parse(raw);
            assertEqual(parsed.count, 1);
            assertTrue(typeof parsed.resetAt === 'string');
        });
    });

    harness.describe('AIProvider.getWeekEnd (real)', () => {
        harness.it('returns ISO string pointing at Sunday 23:59:59 local', () => {
            const p = new AIProvider({ AI: null, RATE_LIMIT_KV: new InMemoryKV() });
            const iso = p.getWeekEnd();
            const d = new Date(iso);
            // Sunday = 0 in local time; the implementation uses getDay() (local).
            // Read the hours/minutes via local getters to match.
            assertEqual(d.getDay(), 0, 'Must be Sunday');
            assertEqual(d.getHours(), 23);
            assertEqual(d.getMinutes(), 59);
            assertEqual(d.getSeconds(), 59);
        });
    });

    harness.describe('AIService.formatInsights (real client-side)', () => {
        harness.it('includes summary, patterns, and suggestions when all present', () => {
            const out = AIService.formatInsights({
                summary: 'Overall trend looks positive.',
                patterns: ['Sleep correlates with mood', 'Caffeine late degrades sleep'],
                suggestions: ['Earlier bedtime', 'Avoid caffeine after 2pm']
            });
            assertTrue(out.includes('Overall trend looks positive.'));
            assertTrue(out.includes('Patterns observed:'));
            assertTrue(out.includes('• Sleep correlates with mood'));
            assertTrue(out.includes('• Caffeine late degrades sleep'));
            assertTrue(out.includes('Suggestions:'));
            assertTrue(out.includes('• Earlier bedtime'));
        });

        harness.it('omits pattern and suggestion sections when arrays empty', () => {
            const out = AIService.formatInsights({
                summary: 'Only a summary.',
                patterns: [],
                suggestions: []
            });
            assertTrue(out.includes('Only a summary.'));
            assertFalse(out.includes('Patterns observed'));
            assertFalse(out.includes('Suggestions'));
        });

        harness.it('handles missing fields without throwing', () => {
            const out = AIService.formatInsights({});
            assertEqual(out, '');
        });
    });

    harness.run().then(ok => process.exit(ok ? 0 : 1));
})();
