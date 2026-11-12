import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { PLANS } from './plans';
import { getEffectivePlan } from './usage';
import { serializeUser } from '../auth/routes';
import {
  getStripe,
  isStripeConfigured,
  PREMIUM_CURRENCY,
  PREMIUM_PRICE_CENTS,
} from './stripe';
import {
  confirmPremiumCheckout,
  createPremiumCheckout as createRecurrenteCheckout,
  isRecurrenteConfigured,
  RECURRENTE_CURRENCY,
  RECURRENTE_PREMIUM_CENTS,
} from './recurrente';

const router = Router();

function paymentsProvider(): 'recurrente' | 'stripe' | null {
  if (isRecurrenteConfigured()) return 'recurrente';
  if (isStripeConfigured()) return 'stripe';
  return null;
}

/** GET /billing/config — public-ish (auth) flags for the client */
router.get('/config', authMiddleware, (_req: Request, res: Response) => {
  const provider = paymentsProvider();
  const recurrente = isRecurrenteConfigured();
  res.json({
    provider,
    recurrenteEnabled: recurrente,
    stripeEnabled: isStripeConfigured(),
    paymentsEnabled: provider !== null,
    premiumPriceCents: recurrente
      ? RECURRENTE_PREMIUM_CENTS
      : PREMIUM_PRICE_CENTS,
    premiumCurrency: recurrente
      ? RECURRENTE_CURRENCY.toLowerCase()
      : PREMIUM_CURRENCY,
    /** Play Billing when the app is on Play Store with product id set */
    playBillingEnabled: Boolean(process.env.PLAY_BILLING_PRODUCT_ID?.trim()),
    playProductId: process.env.PLAY_BILLING_PRODUCT_ID?.trim() || null,
  });
});

router.use(authMiddleware);

/** GET /billing/plan — current plan + usage counters */
router.get('/plan', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const state = await getEffectivePlan(req.user!.id);
    res.json({
      plan: state.planId,
      label: state.limits.label,
      planExpiresAt: state.planExpiresAt
        ? state.planExpiresAt.toISOString()
        : null,
      media: {
        usedBytes: state.mediaBytesUsed,
        limitBytes: state.limits.mediaQuotaBytes,
        maxFileBytes: state.limits.maxFileBytes,
      },
      translations: {
        usedToday: state.translationsToday,
        limitPerDay: state.limits.translationsPerDay,
        dayKey: state.dayKey,
      },
      glossaryMax: state.limits.glossaryMax,
      ads: state.limits.ads,
      stripeEnabled: isStripeConfigured(),
      recurrenteEnabled: isRecurrenteConfigured(),
      paymentsEnabled: paymentsProvider() !== null,
      provider: paymentsProvider(),
      plans: {
        free: {
          label: PLANS.free.label,
          mediaQuotaBytes: PLANS.free.mediaQuotaBytes,
          maxFileBytes: PLANS.free.maxFileBytes,
          translationsPerDay: PLANS.free.translationsPerDay,
          glossaryMax: PLANS.free.glossaryMax,
        },
        premium: {
          label: PLANS.premium.label,
          mediaQuotaBytes: PLANS.premium.mediaQuotaBytes,
          maxFileBytes: PLANS.premium.maxFileBytes,
          translationsPerDay: PLANS.premium.translationsPerDay,
          glossaryMax: PLANS.premium.glossaryMax,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /billing/checkout
 * Prefer Recurrente; fallback Stripe. Opens in browser / Custom Tabs.
 */
router.post(
  '/checkout',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.id },
      });
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      if (!user.email) {
        res.status(400).json({
          error:
            'Agregá un correo en Ajustes antes de comprar Premium (necesario para el recibo).',
          code: 'email_required_for_billing',
        });
        return;
      }

      // ── Recurrente (prioridad) ─────────────────────────────
      if (isRecurrenteConfigured()) {
        const session = await createRecurrenteCheckout({
          userId: user.id,
          email: user.email,
          name: user.name,
        });
        res.json({
          url: session.url,
          sessionId: session.checkoutId,
          provider: 'recurrente',
        });
        return;
      }

      // ── Stripe (legacy / opcional) ─────────────────────────
      if (!isStripeConfigured()) {
        res.status(503).json({
          error:
            'Pagos aún no configurados. Define RECURRENTE_SECRET_KEY en Railway.',
          code: 'payments_not_configured',
        });
        return;
      }

      const stripe = getStripe();
      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          name: user.name,
          metadata: { userId: user.id, username: user.username },
        });
        customerId = customer.id;
        await prisma.user.update({
          where: { id: user.id },
          data: { stripeCustomerId: customerId },
        });
      }

      const successUrl =
        process.env.STRIPE_SUCCESS_URL?.trim() ||
        'https://synapmsg.ai/billing/success/?session_id={CHECKOUT_SESSION_ID}';
      const cancelUrl =
        process.env.STRIPE_CANCEL_URL?.trim() ||
        'https://synapmsg.ai/billing/cancel/';

      const priceId = process.env.STRIPE_PRICE_PREMIUM?.trim();
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: customerId,
        client_reference_id: user.id,
        metadata: { userId: user.id },
        subscription_data: {
          metadata: { userId: user.id },
        },
        line_items: priceId
          ? [{ price: priceId, quantity: 1 }]
          : [
              {
                price_data: {
                  currency: PREMIUM_CURRENCY,
                  unit_amount: PREMIUM_PRICE_CENTS,
                  recurring: { interval: 'month' },
                  product_data: {
                    name: 'Synapmsg Premium',
                    description:
                      '10k traducciones/día, 100 GB media, sin anuncios',
                  },
                },
                quantity: 1,
              },
            ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        allow_promotion_codes: true,
      });

      res.json({
        url: session.url,
        sessionId: session.id,
        provider: 'stripe',
      });
    } catch (err) {
      next(err);
    }
  },
);

/** POST /billing/confirm — GET checkout en Recurrente; si paid → Premium. */
router.post(
  '/confirm',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!isRecurrenteConfigured()) {
        res.status(503).json({
          error: 'Recurrente no configurado',
          code: 'payments_not_configured',
        });
        return;
      }
      const checkoutId =
        typeof (req.body as { checkoutId?: unknown })?.checkoutId === 'string'
          ? (req.body as { checkoutId: string }).checkoutId.trim()
          : '';
      if (!checkoutId) {
        res.status(400).json({ error: 'checkoutId requerido' });
        return;
      }
      const result = await confirmPremiumCheckout({
        userId: req.user!.id,
        checkoutId,
      });
      const user = await prisma.user.findUnique({
        where: { id: req.user!.id },
      });
      res.json({
        ...result,
        user: user ? serializeUser(user) : null,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /billing/portal — Stripe Customer Portal (cancel / update card)
 */
router.post(
  '/portal',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!isStripeConfigured()) {
        res.status(503).json({
          error: 'Pagos con tarjeta aún no configurados',
          code: 'stripe_not_configured',
        });
        return;
      }
      const user = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: { stripeCustomerId: true },
      });
      if (!user?.stripeCustomerId) {
        res.status(400).json({ error: 'Sin cliente Stripe; paga Premium primero.' });
        return;
      }
      const stripe = getStripe();
      const returnUrl =
        process.env.STRIPE_PORTAL_RETURN_URL?.trim() ||
        'https://synapmsg.ai/billing/success/';
      const portal = await stripe.billingPortal.sessions.create({
        customer: user.stripeCustomerId,
        return_url: returnUrl,
      });
      res.json({ url: portal.url });
    } catch (err) {
      next(err);
    }
  },
);

function billingStubsAllowed(): boolean {
  const env = process.env.NODE_ENV || 'development';
  return (
    env !== 'production' &&
    (process.env.ALLOW_BILLING_STUBS === '1' ||
      process.env.ALLOW_BILLING_STUBS === 'true')
  );
}

/**
 * POST /billing/upgrade-stub — QA only (ALLOW_BILLING_STUBS=1, never production)
 */
router.post(
  '/upgrade-stub',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!billingStubsAllowed()) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      const rawDays = (req.body ?? {}) as { days?: unknown };
      const days =
        typeof rawDays.days === 'number' &&
        Number.isFinite(rawDays.days) &&
        rawDays.days > 0
          ? Math.min(365, Math.floor(rawDays.days))
          : 30;

      const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      const updated = await prisma.user.update({
        where: { id: req.user!.id },
        data: { plan: 'premium', planExpiresAt: expires },
      });

      res.json({
        ok: true,
        user: serializeUser(updated),
        plan: 'premium',
        planExpiresAt: expires.toISOString(),
        note: 'Stub QA — use /billing/checkout in production',
      });
    } catch (err) {
      next(err);
    }
  },
);

/** POST /billing/downgrade-stub — QA only */
router.post(
  '/downgrade-stub',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!billingStubsAllowed()) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      const updated = await prisma.user.update({
        where: { id: req.user!.id },
        data: {
          plan: 'free',
          planExpiresAt: null,
          stripeSubscriptionId: null,
        },
      });
      res.json({ ok: true, user: serializeUser(updated), plan: 'free' });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
