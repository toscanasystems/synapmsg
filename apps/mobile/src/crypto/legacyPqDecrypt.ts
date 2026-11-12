/**
 * Receive-only decrypt for old synapmsg-pq-v1 envelopes.
 * MUST NOT encrypt new messages.
 */

import { LEGACY_PQ_PROTOCOL } from './legacyPqFlags';
import { decryptLegacyMessageFromPeer } from './e2eSession.legacy';

export async function decryptLegacyPqEnvelope(
  peerUserId: string,
  ciphertextB64: string,
): Promise<string | null> {
  return decryptLegacyMessageFromPeer(peerUserId, ciphertextB64);
}

export function legacyProtocolId(): string {
  return LEGACY_PQ_PROTOCOL;
}
