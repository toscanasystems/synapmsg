/**
 * Verify remote wipe commands — Ed25519 detached signature (tweetnacl).
 * Verifying key MUST be pinned locally (or EXPO_PUBLIC_WIPE_PUBKEY).
 * Never trust pubKey from the wipe message itself.
 */

import nacl from 'tweetnacl';
import * as SecureStore from 'expo-secure-store';

const STORE_KEY = 'synapmsg_wipe_pubkey_v1';

function unb64(s: string): Uint8Array {
  const bin = globalThis.atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function utf8(s: string): Uint8Array {
  return new Uint8Array(
    Array.from(unescape(encodeURIComponent(s))).map((c) => c.charCodeAt(0)),
  );
}

export type WipeCommand = {
  type: 'remote_wipe';
  userId?: string;
  nonce?: string;
  reason?: string;
  issuedAt?: string;
  sig?: string;
  alg?: string;
  pubKey?: string;
};

/** Rebuild the exact object the API signs (no sig/alg/pubKey). */
export function wipeSignedPayload(cmd: WipeCommand): object {
  return {
    type: 'remote_wipe' as const,
    userId: cmd.userId,
    nonce: cmd.nonce,
    reason: cmd.reason,
    issuedAt: cmd.issuedAt,
  };
}

export async function getPinnedWipePubKey(): Promise<string | null> {
  const fromEnv = (process.env.EXPO_PUBLIC_WIPE_PUBKEY || '').trim();
  if (fromEnv) return fromEnv;
  try {
    return await SecureStore.getItemAsync(STORE_KEY);
  } catch {
    return null;
  }
}

/** First trusted bootstrap wins; refuse silent replacement. */
export async function pinWipePubKey(pubKey: string): Promise<'pinned' | 'kept' | 'mismatch'> {
  const clean = pubKey.trim();
  if (!clean) return 'mismatch';
  const existing = await getPinnedWipePubKey();
  if (existing) {
    return existing === clean ? 'kept' : 'mismatch';
  }
  await SecureStore.setItemAsync(STORE_KEY, clean);
  return 'pinned';
}

export function verifyRemoteWipe(
  cmd: WipeCommand,
  pinnedPubKey: string,
): boolean {
  if (
    !cmd.sig ||
    !pinnedPubKey ||
    !cmd.userId ||
    !cmd.nonce ||
    !cmd.issuedAt
  ) {
    return false;
  }
  if (cmd.alg && cmd.alg !== 'ed25519') return false;
  // Attacker-supplied pubKey in the frame is ignored on purpose.
  try {
    const msg = utf8(JSON.stringify(wipeSignedPayload(cmd)));
    return nacl.sign.detached.verify(
      msg,
      unb64(cmd.sig),
      unb64(pinnedPubKey),
    );
  } catch {
    return false;
  }
}
