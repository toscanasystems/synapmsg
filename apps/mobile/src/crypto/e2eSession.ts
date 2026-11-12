/**
 * E2E session layer: X3DH + Double Ratchet + ML-KEM768 hybrid.
 * Protocol: synapmsg-pq-v1
 */

import nacl from 'tweetnacl';
import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  RatchetHeader,
  RatchetState,
  initAlice,
  initBob,
  ratchetDecrypt,
  ratchetEncrypt,
  x3dhSharedSecret,
  b64,
  unb64,
} from './doubleRatchet';
import {
  ensureE2eBundle,
  getLocalDeviceId,
  E2E_PROTOCOL,
} from './e2eKeys';
import { getPeerIdentityPub } from './peerCache';
import { apiClient } from '../api/client';
import { mayDecryptE2e } from '../security/deviceGuard';

const SESSION_PREFIX = 'synapmsg_dr_';
const VAULT_PREFIX = 'synapmsg_e2e_priv_';

function encodeWire(obj: unknown): string {
  const json = JSON.stringify(obj);
  const bytes = new Uint8Array(
    Array.from(unescape(encodeURIComponent(json))).map((c) => c.charCodeAt(0)),
  );
  return b64(bytes);
}

function decodeWire(ciphertextB64: string): string {
  const bytes = unb64(ciphertextB64);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return decodeURIComponent(escape(s));
}

type Vault = {
  identityPriv: string;
  identityKeyPub: string;
  signedPriv: string;
  signedPreKeyPub: string;
  signedPreKeyId: number;
  registrationId: number;
  preKeys: Array<{ keyId: number; publicKey: string; privateKey: string }>;
  pqPriv?: string;
  pqPub?: string;
  protocol: string;
};

type PeerBundle = {
  identityKey: string;
  signedPreKey: { keyId: number; publicKey: string };
  oneTimePreKey?: { keyId: number; publicKey: string } | null;
  pqKemPub?: string | null;
  deviceId: string;
};

type WirePayload = {
  v: 1;
  protocol: typeof E2E_PROTOCOL;
  header: RatchetHeader;
  ciphertext: string;
  pqCt?: string;
};

async function loadVault(): Promise<Vault> {
  const deviceId = await getLocalDeviceId();
  if (!deviceId) throw new Error('No E2E device');
  const raw = await SecureStore.getItemAsync(`${VAULT_PREFIX}${deviceId}`);
  if (!raw) throw new Error('E2E vault missing');
  return JSON.parse(raw) as Vault;
}

async function saveSession(peerUserId: string, state: RatchetState): Promise<void> {
  await SecureStore.setItemAsync(
    `${SESSION_PREFIX}${peerUserId}`,
    JSON.stringify(state),
  );
  try {
    const INDEX = 'synapmsg_dr_peer_index';
    const raw = await AsyncStorage.getItem(INDEX);
    const list: string[] = raw ? (JSON.parse(raw) as string[]) : [];
    if (!list.includes(peerUserId)) {
      list.push(peerUserId);
      await AsyncStorage.setItem(INDEX, JSON.stringify(list));
    }
  } catch {
    /* ignore */
  }
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

async function fetchFullBundle(userId: string): Promise<PeerBundle> {
  const { data } = await apiClient.get<{
    identityKey: string;
    signedPreKey: { keyId: number; publicKey: string };
    oneTimePreKey?: { keyId: number; publicKey: string } | null;
    pqKemPub?: string | null;
    deviceId: string;
  }>(`/e2e/users/${userId}/bundle`, { params: { consume: '1' } });
  return data;
}

async function establishAsAlice(peerUserId: string): Promise<RatchetState> {
  const vault = await loadVault();
  await ensureE2eBundle(); // ensure PQ keys exist
  const vault2 = await loadVault();
  const bundle = await fetchFullBundle(peerUserId);

  const ek = nacl.box.keyPair();
  const dh1 = nacl.scalarMult(
    unb64(vault2.identityPriv),
    unb64(bundle.signedPreKey.publicKey),
  );
  const dh2 = nacl.scalarMult(ek.secretKey, unb64(bundle.identityKey));
  const dh3 = nacl.scalarMult(ek.secretKey, unb64(bundle.signedPreKey.publicKey));
  const parts = [dh1, dh2, dh3];
  if (bundle.oneTimePreKey?.publicKey) {
    parts.push(
      nacl.scalarMult(ek.secretKey, unb64(bundle.oneTimePreKey.publicKey)),
    );
  }

  let pqCt: Uint8Array | undefined;
  if (bundle.pqKemPub && vault2.pqPriv) {
    const enc = ml_kem768.encapsulate(unb64(bundle.pqKemPub));
    pqCt = enc.cipherText;
    parts.push(enc.sharedSecret);
  }

  const sk = x3dhSharedSecret(parts);
  // Use peer signed prekey as initial DHr for Alice
  const state = await initAlice(sk, bundle.signedPreKey.publicKey);
  // Stash ephemeral pub in mkSkipped metadata via unused field — store alongside
  (state as RatchetState & { ekPub?: string; pqCt?: string }).ekPub = b64(
    ek.publicKey,
  );
  if (pqCt) {
    (state as RatchetState & { pqCt?: string }).pqCt = b64(pqCt);
  }
  await saveSession(peerUserId, state);
  void vault;
  return state;
}

export async function encryptMessageForPeer(
  peerUserId: string,
  plaintext: string,
): Promise<{ ciphertext: string; ciphertextType: number }> {
  let state = await loadSession(peerUserId);
  let firstPqCt: string | undefined;
  let firstEk: string | undefined;
  if (!state) {
    state = await establishAsAlice(peerUserId);
    firstPqCt = (state as RatchetState & { pqCt?: string }).pqCt;
    firstEk = (state as RatchetState & { ekPub?: string }).ekPub;
  }
  const { state: next, header, ciphertext } = await ratchetEncrypt(
    state,
    plaintext,
  );
  await saveSession(peerUserId, next);
  const wire: WirePayload & { ekPub?: string } = {
    v: 1,
    protocol: E2E_PROTOCOL,
    header,
    ciphertext,
  };
  if (firstPqCt) wire.pqCt = firstPqCt;
  if (firstEk) wire.ekPub = firstEk;
  return {
    ciphertext: encodeWire(wire),
    ciphertextType: 2,
  };
}

export async function decryptMessageFromPeer(
  peerUserId: string,
  ciphertextB64: string,
): Promise<string | null> {
  const gate = mayDecryptE2e();
  if (!gate.ok) {
    return null;
  }
  try {
    const json = decodeWire(ciphertextB64);
    const wire = JSON.parse(json) as WirePayload & { ekPub?: string };
    if (wire.v !== 1) return null;

    let state = await loadSession(peerUserId);
    if (!state) {
      // Bob side: build from X3DH using our SPK + their ek
      const vault = await loadVault();
      if (!wire.ekPub) return null;
      const peerPub = await getPeerIdentityPub(peerUserId);
      const dh1 = nacl.scalarMult(
        unb64(vault.signedPriv),
        unb64(peerPub),
      );
      const dh2 = nacl.scalarMult(
        unb64(vault.identityPriv),
        unb64(wire.ekPub),
      );
      const dh3 = nacl.scalarMult(unb64(vault.signedPriv), unb64(wire.ekPub));
      const parts = [dh1, dh2, dh3];
      // OTK: if header n==0 and we have matching — best-effort skip for morning
      if (wire.pqCt && vault.pqPriv) {
        const ss = ml_kem768.decapsulate(unb64(wire.pqCt), unb64(vault.pqPriv));
        parts.push(ss);
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
