/**
 * Seal attachments before upload. Key+nonce travel with the message
 * (inside E2E ciphertext, or mediaKey fields on cloud rows).
 */

import * as ExpoCrypto from 'expo-crypto';
import nacl from 'tweetnacl';
import { ensureNaclPrng } from '../security/secureVault';

const MARK_START = '@@synapmedia:';
const MARK_END = '@@';
const FREE_MAX = 25 * 1024 * 1024;

export type MediaSealMeta = {
  v: 1;
  k: string; // key b64
  n: string; // nonce b64
  ct: string; // original content-type
};

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

export function assertUnderFreeCap(byteLength: number): void {
  if (byteLength > FREE_MAX) {
    throw new Error('Archivo demasiado grande (máx 25 MB en plan Gratis)');
  }
}

/** Seal raw file bytes → ciphertext bytes + meta for the message. */
export function sealMediaBytes(
  plain: Uint8Array,
  contentType: string,
): { sealed: Uint8Array; meta: MediaSealMeta } {
  ensureNaclPrng();
  assertUnderFreeCap(plain.length);
  const key = nacl.randomBytes(nacl.secretbox.keyLength);
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const box = nacl.secretbox(plain, nonce, key);
  if (!box) throw new Error('No se pudo cifrar el archivo');
  return {
    sealed: box,
    meta: { v: 1, k: b64(key), n: b64(nonce), ct: contentType },
  };
}

export function openMediaBytes(
  sealed: Uint8Array,
  meta: MediaSealMeta,
): Uint8Array {
  ensureNaclPrng();
  const opened = nacl.secretbox.open(sealed, unb64(meta.n), unb64(meta.k));
  if (!opened) throw new Error('No se pudo descifrar el archivo');
  return opened;
}

export function embedMediaMeta(caption: string, meta: MediaSealMeta): string {
  const body = (caption || '').trimEnd();
  return `${body}${body ? '\n\n' : ''}${MARK_START}${JSON.stringify(meta)}${MARK_END}`;
}

export function extractMediaMeta(text: string | null | undefined): {
  text: string;
  meta: MediaSealMeta | null;
} {
  const raw = text || '';
  const i = raw.lastIndexOf(MARK_START);
  if (i < 0) return { text: raw, meta: null };
  const j = raw.indexOf(MARK_END, i + MARK_START.length);
  if (j < 0) return { text: raw, meta: null };
  try {
    const json = raw.slice(i + MARK_START.length, j);
    const meta = JSON.parse(json) as MediaSealMeta;
    if (meta?.v !== 1 || !meta.k || !meta.n) {
      return { text: raw, meta: null };
    }
    return { text: raw.slice(0, i).trimEnd(), meta };
  } catch {
    return { text: raw, meta: null };
  }
}

export async function readUriAsBytes(uri: string): Promise<Uint8Array> {
  const FileSystem = await import('expo-file-system');
  const b64s = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return unb64(b64s);
}

export async function writeBytesToCache(
  bytes: Uint8Array,
  ext: string,
): Promise<string> {
  const FileSystem = await import('expo-file-system');
  const name = `synap_media_${Date.now()}_${ExpoCrypto.randomUUID?.() || Math.random().toString(16).slice(2)}.${ext}`;
  const path = `${FileSystem.cacheDirectory ?? ''}${name}`;
  await FileSystem.writeAsStringAsync(path, b64(bytes), {
    encoding: FileSystem.EncodingType.Base64,
  });
  return path;
}

export function extForContentType(ct: string): string {
  if (ct.includes('png')) return 'png';
  if (ct.includes('webp')) return 'webp';
  if (ct.includes('gif')) return 'gif';
  if (ct.includes('pdf')) return 'pdf';
  if (ct.includes('jpeg') || ct.includes('jpg')) return 'jpg';
  if (ct.includes('mp4') || ct.includes('m4a')) return 'm4a';
  if (ct.includes('mpeg') || ct.includes('mp3')) return 'mp3';
  return 'bin';
}
