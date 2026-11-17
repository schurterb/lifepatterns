/**
 * Stripe Service
 * Handles Stripe API interactions for subscriptions
 */

const STRIPE_API = 'https://api.stripe.com/v1';

export class StripeService {
    constructor(secretKey, webhookSecret) {
        this.secretKey = secretKey;
        this.webhookSecret = webhookSecret;
    }

    async createCheckoutSession(customerId, priceId, successUrl, cancelUrl) {
        const params = new URLSearchParams({
            'customer': customerId,
            'mode': 'subscription',
            'line_items[0][price]': priceId,
            'line_items[0][quantity]': '1',
            'success_url': successUrl,
            'cancel_url': cancelUrl
        });

        const res = await fetch(`${STRIPE_API}/checkout/sessions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.secretKey}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params.toString()
        });

        return res.json();
    }

    async createCustomer(email) {
        const params = new URLSearchParams({ email });

        const res = await fetch(`${STRIPE_API}/customers`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.secretKey}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params.toString()
        });

        return res.json();
    }

    async cancelSubscription(subscriptionId) {
        const res = await fetch(`${STRIPE_API}/subscriptions/${subscriptionId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.secretKey}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: 'cancel_at_period_end=true'
        });

        return res.json();
    }

    async getSubscription(subscriptionId) {
        const res = await fetch(`${STRIPE_API}/subscriptions/${subscriptionId}`, {
            headers: { 'Authorization': `Bearer ${this.secretKey}` }
        });

        return res.json();
    }

    async verifyWebhookSignature(payload, signature) {
        if (!this.webhookSecret) return false;

        const parts = signature.split(',').reduce((acc, part) => {
            const [key, value] = part.split('=');
            acc[key] = value;
            return acc;
        }, {});

        const timestamp = parts.t;
        const expectedSig = parts.v1;

        if (!timestamp || !expectedSig) return false;

        const signedPayload = `${timestamp}.${payload}`;
        const key = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(this.webhookSecret),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        );

        const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
        const computedSig = Array.from(new Uint8Array(sig))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');

        return computedSig === expectedSig;
    }
}
