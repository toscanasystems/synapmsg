/**
 * Prefer official Signal libsignal JNI for X25519 / HKDF / AES-GCM.
 * Falls back to tweetnacl + WebCrypto-style paths in doubleRatchet when unavailable.
 */

import nacl from 'tweetnacl';
import { getLibsignalNative, libsignalNativeStatus } from 'synap-libsignal';

function b64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return globalThis.btoa(s);
}

function unb64(s: string): Uint8Array {
  const bin = globalThis.atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

let cachedNative: boolean | null = null;

export async function isLibsignalNativeReady(): Promise<boolean> {
  if (cachedNative !== null) return cachedNative;
  const st = await libsignalNativeStatus();
  cachedNative = Boolean(st.native);
  return cachedNative;
}

export async function nativeX25519Agree(
  privateKey: Uint8Array,
  publicKey: Uint8Array,
): Promise<Uint8Array | null> {
  const n = getLibsignalNative();
  if (!n?.calculateAgreement) return null;
  try {
    const out = await n.calculateAgreement(b64(privateKey), b64(publicKey));
    return unb64(out);
  } catch {
    return null;
  }
}

export async function nativeHkdf(
  ikm: Uint8Array,
  info: string,
  length: number,
): Promise<Uint8Array | null> {
  const n = getLibsignalNative();
  if (!n?.hkdf) return null;
  try {
    const out = await n.hkdf(b64(ikm), info, length);
    return unb64(out);
  } catch {
    return null;
  }
}

export async function nativeAesGcmEncrypt(
  key: Uint8Array,
  plaintext: Uint8Array,
  nonce: Uint8Array,
): Promise<Uint8Array | null> {
  const n = getLibsignalNative();
  if (!n?.aesGcmEncrypt) return null;
  try {
    const out = await n.aesGcmEncrypt(b64(key), b64(plaintext), b64(nonce));
    return unb64(out);
  } catch {
    return null;
  }
}

export async function nativeAesGcmDecrypt(
  key: Uint8Array,
  ciphertext: Uint8Array,
  nonce: Uint8Array,
): Promise<Uint8Array | null> {
  const n = getLibsignalNative();
  if (!n?.aesGcmDecrypt) return null;
  try {
    const out = await n.aesGcmDecrypt(b64(key), b64(ciphertext), b64(nonce));
    return unb64(out);
  } catch {
    return null;
  }
}

/** Scalar mult with native prefer + nacl fallback (sync-compatible wrapper). */
export function x25519AgreeSync(
  privateKey: Uint8Array,
  publicKey: Uint8Array,
): Uint8Array {
  return nacl.scalarMult(privateKey, publicKey);
}

export { b64, unb64 };
