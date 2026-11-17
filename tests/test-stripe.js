#!/usr/bin/env node
'use strict';

/**
 * Tests the real StripeService.verifyWebhookSignature HMAC logic
 * using Node's native WebCrypto. Network-dependent methods (createCustomer,
 * createCheckoutSession, etc.) are not tested at the unit level because they
 * require a live Stripe API endpoint.
 */

// Node 22 provides native crypto (WebCrypto) — no shims needed.

const { TestHarness, assertTrue, assertFalse } = require('./test-harness');

async function signPayload(secret, timestamp, payload) {
    const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const sig = await crypto.subtle.sign(
        'HMAC',
        key,
        new TextEncoder().encode(`${timestamp}.${payload}`)
    );
    return Array.from(new Uint8Array(sig))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

(async () => {
    const { StripeService } = await import('../src/services/stripe.js');
    const harness = new TestHarness();
    const SECRET = 'whsec_unit_test_secret';

    harness.describe('StripeService.verifyWebhookSignature', () => {
        harness.it('accepts signature produced with matching secret', async () => {
            const svc = new StripeService('sk_test', SECRET);
            const payload = '{"id":"evt_1","type":"customer.created"}';
            const t = '1700000000';
            const sig = await signPayload(SECRET, t, payload);
            const ok = await svc.verifyWebhookSignature(payload, `t=${t},v1=${sig}`);
            assertTrue(ok, 'Valid HMAC must verify');
        });

        harness.it('rejects tampered payload', async () => {
            const svc = new StripeService('sk_test', SECRET);
            const t = '1700000000';
            const sig = await signPayload(SECRET, t, 'original-payload');
            const ok = await svc.verifyWebhookSignature('tampered-payload', `t=${t},v1=${sig}`);
            assertFalse(ok);
        });

        harness.it('rejects signature produced with wrong secret', async () => {
            const svc = new StripeService('sk_test', SECRET);
            const t = '1700000000';
            const sig = await signPayload('other-secret', t, 'p');
            const ok = await svc.verifyWebhookSignature('p', `t=${t},v1=${sig}`);
            assertFalse(ok);
        });

        harness.it('rejects signature with wrong timestamp component', async () => {
            const svc = new StripeService('sk_test', SECRET);
            const sig = await signPayload(SECRET, '1700000000', 'p');
            const ok = await svc.verifyWebhookSignature('p', `t=9999999999,v1=${sig}`);
            assertFalse(ok);
        });

        harness.it('rejects header missing timestamp', async () => {
            const svc = new StripeService('sk_test', SECRET);
            const ok = await svc.verifyWebhookSignature('p', 'v1=abc');
            assertFalse(ok);
        });

        harness.it('rejects header missing v1 component', async () => {
            const svc = new StripeService('sk_test', SECRET);
            const ok = await svc.verifyWebhookSignature('p', 't=1700000000');
            assertFalse(ok);
        });

        harness.it('rejects when webhook secret is not configured', async () => {
            const svc = new StripeService('sk_test', null);
            const ok = await svc.verifyWebhookSignature('p', 't=1,v1=abc');
            assertFalse(ok);
        });
    });

    harness.run().then(ok => process.exit(ok ? 0 : 1));
})();
