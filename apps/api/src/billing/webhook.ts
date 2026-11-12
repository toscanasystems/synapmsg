import { Request, Response } from 'express';
import {
  findUserIdByStripeCustomer,
  getStripe,
  grantPremium,
  isStripeConfigured,
  revokePremium,
} from './stripe';

/**
 * POST /billing/webhook — Stripe signed events (raw body required).
 */
export async function stripeWebhookHandler(
  req: Request,
  res: Response,
): Promise<void> {
  if (!isStripeConfigured()) {
    res.status(503).json({ error: 'Stripe not configured' });
    return;
  }

  const sig = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret || typeof sig !== 'string') {
    res.status(400).json({ error: 'Missing stripe signature' });
    return;
  }

  const stripe = getStripe();
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body as Buffer, sig, secret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'invalid signature';
    res.status(400).json({ error: `Webhook Error: ${msg}` });
    return;
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as {
          client_reference_id?: string | null;
          customer?: string | null;
          subscription?: string | null;
          metadata?: { userId?: string };
          mode?: string;
        };
        const userId =
          session.client_reference_id ||
          session.metadata?.userId ||
          null;
        if (userId) {
          await grantPremium(userId, {
            customerId:
              typeof session.customer === 'string' ? session.customer : null,
            subscriptionId:
              typeof session.subscription === 'string'
                ? session.subscription
                : null,
            expiresAt: null,
          });
        }
        break;
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object as {
          id: string;
          customer: string;
          status: string;
          current_period_end?: number;
          metadata?: { userId?: string };
        };
        let userId = sub.metadata?.userId || null;
        if (!userId && typeof sub.customer === 'string') {
          userId = await findUserIdByStripeCustomer(sub.customer);
        }
        if (userId) {
          if (['active', 'trialing'].includes(sub.status)) {
            await grantPremium(userId, {
              customerId: sub.customer,
              subscriptionId: sub.id,
              expiresAt: sub.current_period_end
                ? new Date(sub.current_period_end * 1000)
                : null,
            });
          } else if (['canceled', 'unpaid', 'incomplete_expired'].includes(sub.status)) {
            await revokePremium(userId);
          }
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as {
          customer: string;
          metadata?: { userId?: string };
        };
        let userId = sub.metadata?.userId || null;
        if (!userId && typeof sub.customer === 'string') {
          userId = await findUserIdByStripeCustomer(sub.customer);
        }
        if (userId) await revokePremium(userId);
        break;
      }
      default:
        break;
    }
    res.json({ received: true });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[stripe webhook]', err);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
}
