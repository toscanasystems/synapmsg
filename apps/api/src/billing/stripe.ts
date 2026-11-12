import Stripe from 'stripe';
import { prisma } from '../lib/prisma';

/** USD cents / month — LatAm-friendly until localized prices. */
export const PREMIUM_PRICE_CENTS = Number(process.env.STRIPE_PREMIUM_CENTS || 499);
export const PREMIUM_CURRENCY = (process.env.STRIPE_PREMIUM_CURRENCY || 'usd').toLowerCase();

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  if (!stripeClient) {
    stripeClient = new Stripe(key, { apiVersion: '2025-02-24.acacia' });
  }
  return stripeClient;
}

export async function grantPremium(
  userId: string,
  opts: {
    customerId?: string | null;
    subscriptionId?: string | null;
    /** null = active sub (no hard expiry) */
    expiresAt?: Date | null;
  },
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      plan: 'premium',
      planExpiresAt: opts.expiresAt === undefined ? null : opts.expiresAt,
      ...(opts.customerId
        ? { stripeCustomerId: opts.customerId }
        : {}),
      ...(opts.subscriptionId
        ? { stripeSubscriptionId: opts.subscriptionId }
        : {}),
    },
  });
}

export async function revokePremium(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      plan: 'free',
      planExpiresAt: null,
      stripeSubscriptionId: null,
    },
  });
}

export async function findUserIdByStripeCustomer(
  customerId: string,
): Promise<string | null> {
  const user = await prisma.user.findFirst({
    where: { stripeCustomerId: customerId },
    select: { id: true },
  });
  return user?.id ?? null;
}
