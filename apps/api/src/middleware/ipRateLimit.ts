/**
 * Sliding-window IP rate limit (in-memory). Resets when the window rolls forward.
 * On trip: log a short hash of the IP only — never the full address.
 */

import { createHash } from 'crypto';
import { Request, Response, NextFunction } from 'express';

type Bucket = { hits: number[] };

const buckets = new Map<string, Bucket>();

export type IpRateLimitOptions = {
  /** Max requests inside the window. */
  max: number;
  /** Window length in ms (default 60_000). */
  windowMs?: number;
  /** Label for logs / bucket key (e.g. auth-login). */
  name: string;
};

function clientIp(req: Request): string {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.trim()) {
    return xf.split(',')[0]!.trim();
  }
  if (Array.isArray(xf) && xf[0]) return String(xf[0]).split(',')[0]!.trim();
  return req.ip || req.socket.remoteAddress || 'unknown';
}

/** Short fingerprint for debug logs — not reversible to the IP. */
function shortIpHash(ip: string): string {
  return createHash('sha256').update(ip).digest('hex').slice(0, 8);
}

export function ipRateLimit(opts: IpRateLimitOptions) {
  const windowMs = opts.windowMs ?? 60_000;
  const max = opts.max;

  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = clientIp(req);
    const key = `${opts.name}:${ip}`;
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { hits: [] };
      buckets.set(key, bucket);
    }
    bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
    if (bucket.hits.length >= max) {
      // eslint-disable-next-line no-console
      console.warn(
        `[rate-limit] ipHash=${shortIpHash(ip)} path=${req.originalUrl || req.path} name=${opts.name}`,
      );
      res.status(429).json({
        error: 'Too many attempts. Wait a minute and try again.',
        code: 'rate_limited',
      });
      return;
    }
    bucket.hits.push(now);
    next();
  };
}

/** Test helper — clear buckets between proof runs. */
export function resetIpRateLimitBuckets(): void {
  buckets.clear();
}
