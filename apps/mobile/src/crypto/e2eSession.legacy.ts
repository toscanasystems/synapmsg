/**
 * LEGACY synapmsg-pq-v1 — RECEIVE ONLY.
 * Disabled for new encrypts (Fase 2 → libsignal).
 */

import nacl from 'tweetnacl';
import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';
import * as SecureStore from 'expo-secure-store';
import {
  RatchetHeader,
  RatchetState,
  initBob,
  ratchetDecrypt,
  x3dhSharedSecret,
  b64,
  unb64,
} from './doubleRatchet';
import { getLocalDeviceId, E2E_PROTOCOL } from './e2eKeys';
import { getPeerIdentityPub } from './peerCache';
import { mayDecryptE2e } from '../security/deviceGuard';
import { LEGACY_PQ_RATCHET_DISABLED_FOR_NEW } from './legacyPqFlags';

const SESSION_PREFIX = 'synapmsg_dr_';
const VAULT_PREFIX = 'synapmsg_e2e_priv_';

function decodeWire(ciphertextB64: string): string {
  const bytes = unb64(ciphertextB64);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return decodeURIComponent(escape(s));
}

type Vault = {
  identityPriv: string;
  signedPriv: string;
  signedPreKeyPub: string;
  pqPriv?: string;
};

type WirePayload = {
  v: 1;
  protocol: string;
  header: RatchetHeader;
  ciphertext: string;
  pqCt?: string;
  ekPub?: string;
};

async function loadVault(): Promise<Vault | null> {
  const deviceId = await getLocalDeviceId();
  if (!deviceId) return null;
  const raw = await SecureStore.getItemAsync(`${VAULT_PREFIX}${deviceId}`);
  if (!raw) return null;
  return JSON.parse(raw) as Vault;
}

async function loadSession(peerUserId: string): Promise<RatchetState | null> {
  const raw = await SecureStore.getItemAsync(`${SESSION_PREFIX}${peerUserId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as RatchetState;
  } catch {
    return null;
  }
}

async function saveSession(peerUserId: string, state: RatchetState): Promise<void> {
  await SecureStore.setItemAsync(
    `${SESSION_PREFIX}${peerUserId}`,
    JSON.stringify(state),
  );
}

/** Decrypt old PQ wire only. Never call for new sends. */
export async function decryptLegacyMessageFromPeer(
  peerUserId: string,
  ciphertextB64: string,
): Promise<string | null> {
  if (!LEGACY_PQ_RATCHET_DISABLED_FOR_NEW) {
    throw new Error('legacy must stay disabled for new');
  }
  const gate = mayDecryptE2e();
  if (!gate.ok) return null;
  try {
    const json = decodeWire(ciphertextB64);
    const wire = JSON.parse(json) as WirePayload;
    if (wire.v !== 1 || wire.protocol !== E2E_PROTOCOL) return null;

    let state = await loadSession(peerUserId);
    if (!state) {
      const vault = await loadVault();
      if (!vault || !wire.ekPub) return null;
      const peerPub = await getPeerIdentityPub(peerUserId);
      const dh1 = nacl.scalarMult(unb64(vault.signedPriv), unb64(peerPub));
      const dh2 = nacl.scalarMult(unb64(vault.identityPriv), unb64(wire.ekPub));
      const dh3 = nacl.scalarMult(unb64(vault.signedPriv), unb64(wire.ekPub));
      const parts = [dh1, dh2, dh3];
      if (wire.pqCt && vault.pqPriv) {
        parts.push(ml_kem768.decapsulate(unb64(wire.pqCt), unb64(vault.pqPriv)));
      }
      const sk = x3dhSharedSecret(parts);
      state = await initBob(sk, {
        publicKey: unb64(vault.signedPreKeyPub),
        secretKey: unb64(vault.signedPriv),
      });
    }

    const { state: next, plaintext } = await ratchetDecrypt(
      state,
      wire.header,
      wire.ciphertext,
    );
    await saveSession(peerUserId, next);
    return plaintext;
  } catch {
    return null;
  }
}

void b64;
