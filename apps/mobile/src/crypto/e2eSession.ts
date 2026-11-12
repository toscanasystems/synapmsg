/**
 * E2E session entrypoint for Private chats.
 *
 * NEW encrypts use Signal Protocol (libsignal).
 * Legacy synapmsg-pq-v1 is DISABLED for new chats (decrypt-only best-effort).
 */

import {
  LEGACY_PQ_RATCHET_DISABLED_FOR_NEW,
  LEGACY_PQ_PROTOCOL,
} from './legacyPqFlags';
import {
  signalDecryptFromPeer,
  signalEncryptForPeer,
  SIGNAL_PROTOCOL,
} from './signalSession';
import { IdentityKeyChangedError } from './identityTrust';

// Re-export flag for Settings / diagnostics
export { LEGACY_PQ_RATCHET_DISABLED_FOR_NEW, LEGACY_PQ_PROTOCOL };
export { IdentityKeyChangedError };

export async function encryptMessageForPeer(
  peerUserId: string,
  plaintext: string,
): Promise<{ ciphertext: string; ciphertextType: number }> {
  if (!LEGACY_PQ_RATCHET_DISABLED_FOR_NEW) {
    throw new Error('Misconfigured: legacy ratchet still enabled for new chats');
  }
  return signalEncryptForPeer(peerUserId, plaintext);
}

export async function decryptMessageFromPeer(
  peerUserId: string,
  ciphertextB64: string,
): Promise<string | null> {
  // Prefer Signal (may throw IdentityKeyChangedError — never auto-trust)
  const signalPlain = await signalDecryptFromPeer(peerUserId, ciphertextB64);
  if (signalPlain != null) return signalPlain;

  // Legacy receive-only (old envelopes). Do not establish new legacy sessions.
  try {
    const { decryptLegacyPqEnvelope } = await import('./legacyPqDecrypt');
    return await decryptLegacyPqEnvelope(peerUserId, ciphertextB64);
  } catch {
    return null;
  }
}

export function activeE2eProtocol(): string {
  return SIGNAL_PROTOCOL;
}
