/**
 * Cache peer identity public keys (synapmsg-pq-v1).
 * Surfaces KTL keyChanged for UI alerts; cross-checks public KTL.
 */

import chatsApi from '../api/chats';
import { securityApi } from '../api/security';

const cache = new Map<string, string>();
const keyChangedFlags = new Map<string, boolean>();

export async function getPeerIdentityPub(userId: string): Promise<string> {
  const hit = cache.get(userId);
  if (hit) return hit;
  const bundle = await chatsApi.fetchPeerBundle(userId);
  cache.set(userId, bundle.identityKey);
  if (bundle.keyChanged) keyChangedFlags.set(userId, true);

  // Independent public log check (detect silent key replace / MITM bundle).
  try {
    const publicEntries = await securityApi.getKtlPublic(userId);
    if (publicEntries.length) {
      const latest = publicEntries[publicEntries.length - 1]!;
      if (latest.identityKeyPub && latest.identityKeyPub !== bundle.identityKey) {
        keyChangedFlags.set(userId, true);
      }
    }
  } catch {
    /* public KTL optional */
  }

  return bundle.identityKey;
}

export function consumeKeyChanged(userId: string): boolean {
  const v = keyChangedFlags.get(userId) === true;
  keyChangedFlags.delete(userId);
  return v;
}

export function clearPeerCache(): void {
  cache.clear();
  keyChangedFlags.clear();
}
