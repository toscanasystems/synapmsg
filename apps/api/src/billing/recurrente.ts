/**
 * Recurrente (LatAm) — checkout + helpers.
 * Docs: https://docs.recurrente.com
 */

import { prisma } from '../lib/prisma';
import { grantPremium, revokePremium } from './stripe';

const API_BASE = (
  process.env.RECURRENTE_BASE_URL?.trim() || 'https://app.recurrente.com/api'
).replace(/\/$/, '');

export const RECURRENTE_PREMIUM_CENTS = Number(
  process.env.RECURRENTE_PREMIUM_CENTS || 499,
);
export const RECURRENTE_CURRENCY = (
  process.env.RECURRENTE_PREMIUM_CURRENCY ||
  process.env.RECURRENTE_CURRENCY ||
  'USD'
).toUpperCase() as 'USD' | 'GTQ';

export const RECURRENTE_PRODUCT = 'synapmsg_premium';

export function isRecurrenteConfigured(): boolean {
  const key = process.env.RECURRENTE_SECRET_KEY?.trim() || '';
  return key.length === 64;
}

function secretKey(): string {
  const key = process.env.RECURRENTE_SECRET_KEY?.trim();
  if (!key) throw new Error('RECURRENTE_SECRET_KEY is not configured');
  if (key.length !== 64) {
    throw new Error(
      `RECURRENTE_SECRET_KEY length ${key.length} ≠ 64 (spaces/newlines?)`,
    );
  }
  return key;
}

async function recurrenteFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-SECRET-KEY': secretKey(),
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg =
      data && typeof data === 'object' && 'error' in data
        ? JSON.stringify((data as { error: unknown }).error)
        : text || res.statusText;
    throw new Error(`Recurrente ${res.status}: ${msg}`);
  }
  return data as T;
}

export type RecurrenteCheckout = {
  id: string;
  checkout_url?: string;
  status?: string;
  metadata?: Record<string, string>;
};

export async function getCheckout(
  checkoutId: string,
): Promise<RecurrenteCheckout> {
  return recurrenteFetch<RecurrenteCheckout>(
    `/checkouts/${encodeURIComponent(checkoutId)}`,
  );
}

/** Hosted checkout Synapmsg Premium (monthly). */
export async function createPremiumCheckout(opts: {
  userId: string;
  email: string;
  name: string;
}): Promise<{ url: string; checkoutId: string }> {
  const successBase =
    process.env.RECURRENTE_SUCCESS_URL?.trim() ||
    'https://synapmsg.ai/billing/success/';
  const cancelUrl =
    process.env.RECURRENTE_CANCEL_URL?.trim() ||
    'https://synapmsg.ai/billing/cancel/';

  const productId = process.env.RECURRENTE_PRODUCT_ID?.trim();
  const priceId = process.env.RECURRENTE_PRICE_ID?.trim();

  const items = priceId
    ? [{ price_id: priceId, quantity: 1 }]
    : productId
      ? [{ product_id: productId, quantity: 1 }]
      : [
          {
            name: 'Synapmsg Premium',
            currency: RECURRENTE_CURRENCY,
            amount_in_cents: RECURRENTE_PREMIUM_CENTS,
            charge_type: 'recurring',
            billing_interval: 'month',
            billing_interval_count: 1,
            tax_category: 'service',
            quantity: 1,
          },
        ];

  const successUrl = successBase.includes('?')
    ? `${successBase}&userId=${encodeURIComponent(opts.userId)}`
    : `${successBase}?userId=${encodeURIComponent(opts.userId)}`;

  const body = {
    items,
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      product: RECURRENTE_PRODUCT,
      plan: 'premium',
      userId: opts.userId,
      email: opts.email,
      name: opts.name,
    },
  };

  const checkout = await recurrenteFetch<RecurrenteCheckout>('/checkouts', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      // Idempotency: one checkout attempt per user per minute window
      'Idempotency-Key': `synapmsg-premium-${opts.userId}-${Math.floor(Date.now() / 60_000)}`,
    },
  });

  const url = checkout.checkout_url;
  if (!url) {
    throw new Error('Recurrente checkout sin checkout_url');
  }
  return { url, checkoutId: checkout.id };
}

/**
 * Server-side proof of payment (success_url alone is not enough).
 */
export async function confirmPremiumCheckout(opts: {
  userId: string;
  checkoutId: string;
}): Promise<{ granted: boolean; status: string }> {
  const checkout = await getCheckout(opts.checkoutId);
  const metaUser =
    checkout.metadata?.userId ||
    (checkout as { metadata?: Record<string, string> }).metadata?.userId;
  if (!metaUser || metaUser !== opts.userId) {
    throw new Error('Checkout no pertenece a este usuario');
  }
  const product = checkout.metadata?.product;
  if (product && product !== RECURRENTE_PRODUCT) {
    throw new Error('Checkout no es Synapmsg Premium');
  }
  const status = String(checkout.status || '').toLowerCase();
  if (status !== 'paid') {
    return { granted: false, status };
  }
  await grantPremium(opts.userId, { expiresAt: null });
  return { granted: true, status };
}

export { grantPremium, revokePremium };

export async function grantPremiumFromRecurrente(
  userId: string,
  opts?: { expiresAt?: Date | null },
): Promise<void> {
  await grantPremium(userId, {
    expiresAt: opts?.expiresAt === undefined ? null : opts.expiresAt,
  });
}

export async function findUserIdFromRecurrentePayload(payload: {
  checkout?: { id?: string; metadata?: Record<string, string> };
  metadata?: Record<string, string>;
  customer?: { email?: string };
}): Promise<string | null> {
  const fromMeta =
    payload.checkout?.metadata?.userId ||
    payload.metadata?.userId ||
    null;
  if (fromMeta) return fromMeta;

  const email = payload.customer?.email?.trim().toLowerCase();
  if (!email) return null;
  const user = await prisma.user.findFirst({
    where: { email },
    select: { id: true },
  });
  return user?.id ?? null;
}
