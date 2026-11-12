/**
 * E2E identity vault — X25519 + ML-KEM768 (hybrid) in SecureStore.
 * Protocol: synapmsg-pq-v1
 */

import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import nacl from 'tweetnacl';
import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';

const DEVICE_ID_KEY = 'synapmsg_e2e_device_id';
const PRIV_PREFIX = 'synapmsg_e2e_priv_';
export const E2E_PROTOCOL = 'synapmsg-pq-v1' as const;

export type PublicPreKey = { keyId: number; publicKey: string };

export type E2ePublicBundle = {
  deviceId: string;
  identityKeyPub: string;
  signedPreKeyPub: string;
  signedPreKeyId: number;
  registrationId: number;
  preKeys: PublicPreKey[];
  pqKemPub: string;
  protocol: typeof E2E_PROTOCOL;
};

type StoredVault = {
  identityPriv: string;
  identityKeyPub: string;
  signedPriv: string;
  signedPreKeyPub: string;
  signedPreKeyId: number;
  registrationId: number;
  preKeys: Array<PublicPreKey & { privateKey: string }>;
  pqPriv: string;
  pqPub: string;
  protocol: typeof E2E_PROTOCOL;
};

function bytesToB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  if (typeof btoa === 'function') return btoa(s);
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    const n = (a << 16) | (b << 8) | c;
    out += chars[(n >> 18) & 63];
    out += chars[(n >> 12) & 63];
    out += i + 1 < bytes.length ? chars[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? chars[n & 63] : '=';
  }
  return out;
}

async function ensureDeviceId(): Promise<string> {
  let id = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (id) return id;
  const raw = await Crypto.getRandomBytesAsync(8);
  id = `d_${Platform.OS}_${Array.from(raw)
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('')}`;
  await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
  return id;
}

async function loadVault(deviceId: string): Promise<StoredVault | null> {
  const raw = await SecureStore.getItemAsync(`${PRIV_PREFIX}${deviceId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredVault;
  } catch {
    return null;
  }
}

export async function ensureE2eBundle(): Promise<E2ePublicBundle> {
  const deviceId = await ensureDeviceId();
  const existing = await loadVault(deviceId);
  if (existing?.protocol === E2E_PROTOCOL && existing.pqPub) {
    return {
      deviceId,
      identityKeyPub: existing.identityKeyPub,
      signedPreKeyPub: existing.signedPreKeyPub,
      signedPreKeyId: existing.signedPreKeyId,
      registrationId: existing.registrationId,
      preKeys: existing.preKeys.map(({ keyId, publicKey }) => ({
        keyId,
        publicKey,
      })),
      pqKemPub: existing.pqPub,
      protocol: E2E_PROTOCOL,
    };
  }

  const identity = nacl.box.keyPair();
  const signed = nacl.box.keyPair();
  const pq = ml_kem768.keygen();
  const registrationId = Math.floor(Math.random() * 16380) + 1;
  const preKeys: Array<PublicPreKey & { privateKey: string }> = [];
  for (let i = 1; i <= 20; i++) {
    const kp = nacl.box.keyPair();
    preKeys.push({
      keyId: i,
      publicKey: bytesToB64(kp.publicKey),
      privateKey: bytesToB64(kp.secretKey),
    });
  }

  const vault: StoredVault = {
    identityPriv: bytesToB64(identity.secretKey),
    identityKeyPub: bytesToB64(identity.publicKey),
    signedPriv: bytesToB64(signed.secretKey),
    signedPreKeyPub: bytesToB64(signed.publicKey),
    signedPreKeyId: 1,
    registrationId,
    preKeys,
    pqPriv: bytesToB64(pq.secretKey),
    pqPub: bytesToB64(pq.publicKey),
    protocol: E2E_PROTOCOL,
  };
  await SecureStore.setItemAsync(
    `${PRIV_PREFIX}${deviceId}`,
    JSON.stringify(vault),
  );

  return {
    deviceId,
    identityKeyPub: vault.identityKeyPub,
    signedPreKeyPub: vault.signedPreKeyPub,
    signedPreKeyId: 1,
    registrationId,
    preKeys: preKeys.map(({ keyId, publicKey }) => ({ keyId, publicKey })),
    pqKemPub: vault.pqPub,
    protocol: E2E_PROTOCOL,
  };
}

export async function getLocalDeviceId(): Promise<string | null> {
  return SecureStore.getItemAsync(DEVICE_ID_KEY);
}

export async function getLocalIdentityPub(): Promise<string | null> {
  const deviceId = await getLocalDeviceId();
  if (!deviceId) return null;
  const vault = await loadVault(deviceId);
  return vault?.identityKeyPub ?? null;
}

const PREKEY_BATCH = 20;
const PREKEY_MIN = 8;

/**
 * If server-side one-time prekeys are low, generate more, merge into vault,
 * and return an updated public bundle for re-registration.
 */
export async function replenishPreKeysIfNeeded(
  serverPreKeyCount: number,
  minCount: number = PREKEY_MIN,
): Promise<E2ePublicBundle | null> {
  if (serverPreKeyCount >= minCount) return null;
  const deviceId = await ensureDeviceId();
  const vault = await loadVault(deviceId);
  if (!vault || vault.protocol !== E2E_PROTOCOL) return null;

  let maxId = 0;
  for (const pk of vault.preKeys) {
    if (pk.keyId > maxId) maxId = pk.keyId;
  }
  const fresh: Array<PublicPreKey & { privateKey: string }> = [];
  for (let i = 1; i <= PREKEY_BATCH; i++) {
    const kp = nacl.box.keyPair();
    fresh.push({
      keyId: maxId + i,
      publicKey: bytesToB64(kp.publicKey),
      privateKey: bytesToB64(kp.secretKey),
    });
  }
  // Keep recent unused + new (cap vault size)
  const merged = [...vault.preKeys, ...fresh].slice(-80);
  const next: StoredVault = { ...vault, preKeys: merged };
  await SecureStore.setItemAsync(
    `${PRIV_PREFIX}${deviceId}`,
    JSON.stringify(next),
  );

  return {
    deviceId,
    identityKeyPub: next.identityKeyPub,
    signedPreKeyPub: next.signedPreKeyPub,
    signedPreKeyId: next.signedPreKeyId,
    registrationId: next.registrationId,
    preKeys: merged.map(({ keyId, publicKey }) => ({ keyId, publicKey })),
    pqKemPub: next.pqPub,
    protocol: E2E_PROTOCOL,
  };
}

export async function safetyNumber(
  myIdentityPub: string,
  theirIdentityPub: string,
): Promise<string> {
  const [a, b] = [myIdentityPub, theirIdentityPub].sort();
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${a}|${b}|${E2E_PROTOCOL}`,
  );
  const digits = digest
    .replace(/[^0-9a-f]/gi, '')
    .split('')
    .map((c) => parseInt(c, 16) % 10)
    .join('')
    .padEnd(60, '0')
    .slice(0, 60);
  return digits.replace(/(\d{5})(?=\d)/g, '$1 ').trim();
}

/** @deprecated use e2eSession.encryptMessageForPeer — kept for type compat */
export async function encryptForPeer(
  plaintext: string,
  _peerIdentityPub: string,
): Promise<{ ciphertext: string; ciphertextType: number }> {
  void plaintext;
  void _peerIdentityPub;
  throw new Error('Use e2eSession.encryptMessageForPeer');
}

export async function decryptFromPeer(
  _ciphertextB64: string,
  _peerIdentityPub: string,
): Promise<string | null> {
  void _ciphertextB64;
  void _peerIdentityPub;
  return null;
}
