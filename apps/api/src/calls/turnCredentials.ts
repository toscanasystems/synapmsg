/**
 * Short-lived TURN credentials for WebRTC relay.
 *
 * Providers (in order):
 * 1) coturn with use-auth-secret (SYNAP_TURN_URLS + SYNAP_TURN_SECRET) — preferred
 * 2) Cloudflare Realtime TURN only if coturn is not configured
 * 3) Static username/password TURN only if SYNAP_TURN_ALLOW_STATIC=1
 *
 * Relay forwards DTLS-SRTP ciphertext only — never plaintext audio.
 * Default TTL: 10 minutes (600s).
 */

import { createHmac, randomBytes } from 'crypto';

export type IceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

export type TurnMintResult = {
  iceServers: IceServer[];
  iceTransportPolicy: 'relay' | 'all';
  provider: 'cloudflare' | 'coturn-hmac' | 'static' | 'none';
  ttlSec?: number;
};

/** Default credential lifetime: 10 minutes. */
function ttlSecDefault(): number {
  return Math.min(
    172800,
    Math.max(60, Number(process.env.SYNAP_TURN_TTL_SEC || 600)),
  );
}

/** coturn temporary credentials (use-auth-secret / REST style). */
export function mintCoturnHmac(
  secret: string,
  ttlSec: number,
): { username: string; credential: string } {
  const expiry = Math.floor(Date.now() / 1000) + ttlSec;
  const username = `${expiry}:${randomBytes(4).toString('hex')}`;
  const credential = createHmac('sha1', secret)
    .update(username)
    .digest('base64');
  return { username, credential };
}

export async function mintTurnIceServers(opts?: {
  ttlSec?: number;
  allowDirect?: boolean;
}): Promise<TurnMintResult> {
  const ttlSec = opts?.ttlSec ?? ttlSecDefault();
  const allowDirect = opts?.allowDirect === true;
  const iceTransportPolicy: 'relay' | 'all' = allowDirect ? 'all' : 'relay';

  const turnUrls = (process.env.SYNAP_TURN_URLS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const turnSecret = (process.env.SYNAP_TURN_SECRET || '').trim();

  // Prefer own coturn HMAC — never ship fixed username/password in code.
  if (turnUrls.length && turnSecret) {
    const { username, credential } = mintCoturnHmac(turnSecret, ttlSec);
    return {
      iceServers: [
        { urls: 'stun:stun.cloudflare.com:3478' },
        { urls: turnUrls, username, credential },
      ],
      iceTransportPolicy,
      provider: 'coturn-hmac',
      ttlSec,
    };
  }

  const keyId = (process.env.SYNAP_CF_TURN_KEY_ID || '').trim();
  const cfToken = (
    process.env.SYNAP_CF_TURN_API_TOKEN ||
    process.env.CLOUDFLARE_API_TOKEN ||
    ''
  ).trim();

  if (keyId && cfToken) {
    const url = `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`;
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ttl: ttlSec }),
    });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      throw new Error(
        `Cloudflare TURN mint failed: ${r.status} ${body.slice(0, 200)}`,
      );
    }
    const data = (await r.json()) as { iceServers?: IceServer[] };
    const iceServers = (data.iceServers || []).filter((s) => {
      const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
      return !urls.some((u: string) => /:53(\?|$)/.test(String(u)));
    });
    if (!iceServers.length) {
      throw new Error('Cloudflare TURN mint returned no iceServers');
    }
    return {
      iceServers,
      iceTransportPolicy,
      provider: 'cloudflare',
      ttlSec,
    };
  }

  const allowStatic = process.env.SYNAP_TURN_ALLOW_STATIC === '1';
  const turnUser = process.env.SYNAP_TURN_USERNAME || '';
  const turnPass = process.env.SYNAP_TURN_CREDENTIAL || '';
  if (allowStatic && turnUrls.length && turnUser && turnPass) {
    return {
      iceServers: [
        { urls: 'stun:stun.cloudflare.com:3478' },
        { urls: turnUrls, username: turnUser, credential: turnPass },
      ],
      iceTransportPolicy,
      provider: 'static',
      ttlSec,
    };
  }

  return {
    iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }],
    iceTransportPolicy,
    provider: 'none',
  };
}
