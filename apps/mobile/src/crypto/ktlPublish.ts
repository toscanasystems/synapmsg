/**
 * Auto-publish identity to Key Transparency Log when missing or rotated.
 * Prefers libsignal identity; falls back to legacy vault pub.
 */

import { securityApi } from '../api/security';
import { getLocalIdentityPub } from './e2eKeys';
import { getSignalIdentityPub } from './signalSession';
import { useAuthStore } from '../store/auth';

export async function publishKtlIfNeeded(): Promise<{
  published: boolean;
  seq?: number;
  hash?: string;
}> {
  const me = useAuthStore.getState().user;
  const identity =
    (await getSignalIdentityPub()) || (await getLocalIdentityPub());
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

/** Human-readable public log summary for a contact (no auth). */
export async function describePeerKtl(peerUserId: string): Promise<string> {
  try {
    const entries = await securityApi.getKtlPublic(peerUserId);
    if (!entries.length) {
      return 'Registro público: todavía no hay entradas para este contacto.';
    }
    const last = entries[entries.length - 1]!;
    const prev = entries.length > 1 ? entries[entries.length - 2]! : null;
    if (prev && prev.identityKeyPub !== last.identityKeyPub) {
      return (
        `Registro público: la llave cambió el ${new Date(last.at).toLocaleString()} ` +
        `(${prev.identityKeyPub.slice(0, 12)}… → ${last.identityKeyPub.slice(0, 12)}…).`
      );
    }
    return (
      `Registro público: ${entries.length} entrada(s); última ${last.identityKeyPub.slice(0, 12)}…`
    );
  } catch {
    return 'Registro público: no se pudo consultar.';
  }
}
