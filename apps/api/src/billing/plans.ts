/**
 * Free vs Premium limits (LatAm freemium).
 * Stripe/IAP can flip `plan` later; upgrade stub for testing.
 */

export type PlanId = 'free' | 'premium';

export const PLANS = {
  free: {
    id: 'free' as const,
    label: 'Gratis',
    mediaQuotaBytes: 5 * 1024 * 1024 * 1024, // 5 GB
    maxFileBytes: 25 * 1024 * 1024, // 25 MB
    translationsPerDay: 80,
    glossaryMax: 20,
    ads: true,
  },
  premium: {
    id: 'premium' as const,
    label: 'Premium',
    mediaQuotaBytes: 100 * 1024 * 1024 * 1024, // 100 GB soft cap
    maxFileBytes: 100 * 1024 * 1024, // 100 MB
    translationsPerDay: 10_000,
    glossaryMax: 500,
    ads: false,
  },
} as const;

export function planOf(plan: string | null | undefined) {
  return plan === 'premium' ? PLANS.premium : PLANS.free;
}

export function utcDayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}
