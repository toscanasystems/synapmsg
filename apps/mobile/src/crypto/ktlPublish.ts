/**
 * Auto-publish identity to Key Transparency Log when missing or rotated.
 */

import { securityApi } from '../api/security';
import { getLocalIdentityPub } from './e2eKeys';
import { useAuthStore } from '../store/auth';

export async function publishKtlIfNeeded(): Promise<{
  published: boolean;
  seq?: number;
  hash?: string;
}> {
  const me = useAuthStore.getState().user;
  const identity = await getLocalIdentityPub();
  if (!me?.id || !identity) return { published: false };

  try {
    const entries = await securityApi.getKtl(me.id);
    const latest = entries.length ? entries[entries.length - 1] : null;
    if (latest?.identityKeyPub === identity) {
      return { published: false, seq: latest.seq, hash: latest.hash };
    }
    const entry = await securityApi.publishKtl();
    return { published: true, seq: entry.seq, hash: entry.hash };
  } catch {
    return { published: false };
  }
}
