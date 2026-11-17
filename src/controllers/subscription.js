/**
 * Subscription Controller
 * Handles Stripe subscription management
 */

import { StripeService } from '../services/stripe.js';

export class SubscriptionController {
    constructor(env) {
        this.db = env.DB;
        this.stripe = new StripeService(env.STRIPE_SECRET_KEY, env.STRIPE_WEBHOOK_SECRET);
        this.monthlyPriceId = env.STRIPE_MONTHLY_PRICE_ID;
        this.annualPriceId = env.STRIPE_ANNUAL_PRICE_ID;
        this.allowedOrigin = env.ALLOWED_ORIGIN || '*';
    }

    async getStatus(userId) {
        const user = await this.db.prepare(
            'SELECT tier, subscription_status, subscription_period_end FROM users WHERE id = ?'
        ).bind(userId).first();

        if (!user) {
            return this.error('User not found', 404);
        }

        return this.json({
            success: true,
            subscription: {
                tier: user.tier,
                status: user.subscription_status || 'none',
                periodEnd: user.subscription_period_end
            }
        });
    }

    async createCheckout(request, userId) {
        const body = await request.json();
        const { plan } = body;

        const priceId = plan === 'annual' ? this.annualPriceId : this.monthlyPriceId;
        if (!priceId) {
            return this.error('Pricing not configured', 500);
        }

        const user = await this.db.prepare(
            'SELECT email, stripe_customer_id FROM users WHERE id = ?'
        ).bind(userId).first();

        if (!user) {
            return this.error('User not found', 404);
        }

        let customerId = user.stripe_customer_id;
        if (!customerId) {
            const customer = await this.stripe.createCustomer(user.email);
            customerId = customer.id;

            await this.db.prepare(
                'UPDATE users SET stripe_customer_id = ?, updated_at = ? WHERE id = ?'
            ).bind(customerId, new Date().toISOString(), userId).run();
        }

        const successUrl = `${this.allowedOrigin}/?subscription=success`;
        const cancelUrl = `${this.allowedOrigin}/?subscription=canceled`;

        const session = await this.stripe.createCheckoutSession(
            customerId, priceId, successUrl, cancelUrl
        );

        return this.json({ success: true, checkoutUrl: session.url });
    }

    async cancel(userId) {
        const user = await this.db.prepare(
            'SELECT stripe_subscription_id FROM users WHERE id = ?'
        ).bind(userId).first();

        if (!user?.stripe_subscription_id) {
            return this.error('No active subscription', 400);
        }

        const result = await this.stripe.cancelSubscription(user.stripe_subscription_id);

        await this.db.prepare(
            'UPDATE users SET subscription_status = ?, updated_at = ? WHERE id = ?'
        ).bind('canceled', new Date().toISOString(), userId).run();

        return this.json({
            success: true,
            message: 'Subscription will cancel at period end',
            cancelAt: result.cancel_at ? new Date(result.cancel_at * 1000).toISOString() : null
        });
    }

    async handleWebhook(request) {
        const payload = await request.text();
        const signature = request.headers.get('Stripe-Signature');

        if (!await this.stripe.verifyWebhookSignature(payload, signature)) {
            return this.error('Invalid signature', 401);
        }

        const event = JSON.parse(payload);

        switch (event.type) {
            case 'checkout.session.completed':
                await this.handleCheckoutComplete(event.data.object);
                break;
            case 'customer.subscription.updated':
                await this.handleSubscriptionUpdate(event.data.object);
                break;
            case 'customer.subscription.deleted':
                await this.handleSubscriptionDeleted(event.data.object);
                break;
            case 'invoice.payment_failed':
                await this.handlePaymentFailed(event.data.object);
                break;
        }

        return this.json({ received: true });
    }

    async handleCheckoutComplete(session) {
        const customerId = session.customer;
        const subscriptionId = session.subscription;

        const subscription = await this.stripe.getSubscription(subscriptionId);
        const periodEnd = new Date(subscription.current_period_end * 1000).toISOString();

        await this.db.prepare(
            `UPDATE users SET 
                tier = 'paid',
                stripe_subscription_id = ?,
                subscription_status = 'active',
                subscription_period_end = ?,
                updated_at = ?
             WHERE stripe_customer_id = ?`
        ).bind(subscriptionId, periodEnd, new Date().toISOString(), customerId).run();
    }

    async handleSubscriptionUpdate(subscription) {
        const status = subscription.cancel_at_period_end ? 'canceled' : 'active';
        const periodEnd = new Date(subscription.current_period_end * 1000).toISOString();

        await this.db.prepare(
            `UPDATE users SET 
                subscription_status = ?,
                subscription_period_end = ?,
                updated_at = ?
             WHERE stripe_subscription_id = ?`
        ).bind(status, periodEnd, new Date().toISOString(), subscription.id).run();
    }

    async handleSubscriptionDeleted(subscription) {
        await this.db.prepare(
            `UPDATE users SET 
                tier = 'free',
                subscription_status = 'none',
                subscription_period_end = NULL,
                updated_at = ?
             WHERE stripe_subscription_id = ?`
        ).bind(new Date().toISOString(), subscription.id).run();
    }

    async handlePaymentFailed(invoice) {
        await this.db.prepare(
            `UPDATE users SET 
                subscription_status = 'past_due',
                updated_at = ?
             WHERE stripe_customer_id = ?`
        ).bind(new Date().toISOString(), invoice.customer).run();
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
