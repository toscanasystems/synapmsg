/**
 * LEGACY Double Ratchet — DISABLED FOR NEW CHATS (Fase 2).
 * New Private encrypts use libsignal (signalSession.ts).
 * Kept only so old synapmsg-pq-v1 envelopes can still be opened (receive-only).
 *
 * X25519 DH ratchet + symmetric chain (HKDF-SHA256) + secretbox.
 */

import nacl from 'tweetnacl';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import * as Crypto from 'expo-crypto';
import { utf8ToBytes } from './utf8Bytes';

const MAX_SKIP = 200;

function utf8Label(s: string): Uint8Array {
  return utf8ToBytes(s);
}

export type RatchetHeader = {
  dhPub: string; // b64
  pn: number;
  n: number;
};

export type RatchetState = {
  dhsPriv: string;
  dhsPub: string;
  dhrPub: string | null;
  rk: string;
  cks: string | null;
  ckr: string | null;
  ns: number;
  nr: number;
  pn: number;
  mkSkipped: Record<string, string>;
};

function b64(bytes: Uint8Array): string {
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

function unb64(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function utf8(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return decodeURIComponent(escape(s));
}

function toUtf8(text: string): Uint8Array {
  return new Uint8Array(
    Array.from(unescape(encodeURIComponent(text))).map((c) => c.charCodeAt(0)),
  );
}

function kdfRk(rk: Uint8Array, dhOut: Uint8Array): { root: Uint8Array; chain: Uint8Array } {
  const out = hkdf(sha256, dhOut, rk, utf8Label('SynapmsgDR'), 64);
  return { root: out.slice(0, 32), chain: out.slice(32, 64) };
}

function kdfCk(ck: Uint8Array): { chain: Uint8Array; msg: Uint8Array } {
  const out = hkdf(sha256, new Uint8Array([0x01]), ck, utf8Label('SynapmsgCK'), 64);
  return { chain: out.slice(0, 32), msg: out.slice(32, 64) };
}

function skipKeyId(dhPub: string, n: number): string {
  return `${dhPub}:${n}`;
}

export async function initAlice(
  sharedSecret: Uint8Array,
  bobDhPubB64: string,
): Promise<RatchetState> {
  const dhs = nacl.box.keyPair();
  const dhOut = nacl.scalarMult(dhs.secretKey, unb64(bobDhPubB64));
  const { root, chain } = kdfRk(sharedSecret, dhOut);
  return {
    dhsPriv: b64(dhs.secretKey),
    dhsPub: b64(dhs.publicKey),
    dhrPub: bobDhPubB64,
    rk: b64(root),
    cks: b64(chain),
    ckr: null,
    ns: 0,
    nr: 0,
    pn: 0,
    mkSkipped: {},
  };
}

export async function initBob(
  sharedSecret: Uint8Array,
  bobDhKeyPair: { publicKey: Uint8Array; secretKey: Uint8Array },
): Promise<RatchetState> {
  return {
    dhsPriv: b64(bobDhKeyPair.secretKey),
    dhsPub: b64(bobDhKeyPair.publicKey),
    dhrPub: null,
    rk: b64(sharedSecret),
    cks: null,
    ckr: null,
    ns: 0,
    nr: 0,
    pn: 0,
    mkSkipped: {},
  };
}

function dhRatchet(state: RatchetState, theirPub: string): RatchetState {
  const next = { ...state, mkSkipped: { ...state.mkSkipped } };
  next.pn = next.ns;
  next.ns = 0;
  next.nr = 0;
  next.dhrPub = theirPub;
  const dhOut1 = nacl.scalarMult(unb64(next.dhsPriv), unb64(theirPub));
  const recv = kdfRk(unb64(next.rk), dhOut1);
  next.rk = b64(recv.root);
  next.ckr = b64(recv.chain);
  const dhs = nacl.box.keyPair();
  next.dhsPriv = b64(dhs.secretKey);
  next.dhsPub = b64(dhs.publicKey);
  const dhOut2 = nacl.scalarMult(dhs.secretKey, unb64(theirPub));
  const send = kdfRk(unb64(next.rk), dhOut2);
  next.rk = b64(send.root);
  next.cks = b64(send.chain);
  return next;
}

function skipMessageKeys(state: RatchetState, until: number): RatchetState {
  const next = { ...state, mkSkipped: { ...state.mkSkipped } };
  if (!next.ckr || !next.dhrPub) return next;
  if (until - next.nr > MAX_SKIP) {
    throw new Error('Too many skipped message keys');
  }
  while (next.nr < until) {
    const { chain, msg } = kdfCk(unb64(next.ckr));
    next.ckr = b64(chain);
    next.mkSkipped[skipKeyId(next.dhrPub, next.nr)] = b64(msg);
    next.nr += 1;
  }
  return next;
}

export async function ratchetEncrypt(
  state: RatchetState,
  plaintext: string,
): Promise<{ state: RatchetState; header: RatchetHeader; ciphertext: string }> {
  if (!state.cks) throw new Error('Sending chain not initialized');
  const sendingCk = state.cks;
  const next = { ...state, mkSkipped: { ...state.mkSkipped } };
  const { chain, msg } = kdfCk(unb64(sendingCk));
  next.cks = b64(chain);
  const header: RatchetHeader = {
    dhPub: next.dhsPub,
    pn: next.pn,
    n: next.ns,
  };
  next.ns += 1;
  const nonce = await Crypto.getRandomBytesAsync(nacl.secretbox.nonceLength);
  const boxed = nacl.secretbox(toUtf8(plaintext), nonce, msg);
  if (!boxed) throw new Error('encrypt failed');
  const packed = new Uint8Array(nonce.length + boxed.length);
  packed.set(nonce, 0);
  packed.set(boxed, nonce.length);
  return { state: next, header, ciphertext: b64(packed) };
}

export async function ratchetDecrypt(
  state: RatchetState,
  header: RatchetHeader,
  ciphertextB64: string,
): Promise<{ state: RatchetState; plaintext: string }> {
  let next = { ...state, mkSkipped: { ...state.mkSkipped } };
  const skippedId = skipKeyId(header.dhPub, header.n);
  if (next.mkSkipped[skippedId]) {
    const mk = unb64(next.mkSkipped[skippedId]!);
    delete next.mkSkipped[skippedId];
    const plain = openBox(ciphertextB64, mk);
    if (plain == null) throw new Error('decrypt skipped failed');
    return { state: next, plaintext: plain };
  }

  if (!next.dhrPub || header.dhPub !== next.dhrPub) {
    if (next.ckr && next.dhrPub) {
      next = skipMessageKeys(next, header.pn);
    }
    next = dhRatchet(next, header.dhPub);
  }
  next = skipMessageKeys(next, header.n);
  if (!next.ckr) throw new Error('Receiving chain missing');
  const { chain, msg } = kdfCk(unb64(next.ckr));
  next.ckr = b64(chain);
  next.nr += 1;
  const plain = openBox(ciphertextB64, msg);
  if (plain == null) throw new Error('decrypt failed');
  return { state: next, plaintext: plain };
}

function openBox(ciphertextB64: string, key: Uint8Array): string | null {
  const packed = unb64(ciphertextB64);
  const nonceLen = nacl.secretbox.nonceLength;
  if (packed.length <= nonceLen) return null;
  const opened = nacl.secretbox.open(
    packed.slice(nonceLen),
    packed.slice(0, nonceLen),
    key,
  );
  return opened ? utf8(opened) : null;
}

/** X3DH-ish shared secret: DH(IKa, SPKb) || DH(EKa, IKb) || DH(EKa, SPKb) || PQ */
export function x3dhSharedSecret(parts: Uint8Array[]): Uint8Array {
  const concat = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    concat.set(p, o);
    o += p.length;
  }
  return hkdf(sha256, concat, undefined, utf8Label('SynapmsgX3DH'), 32);
}

export { b64, unb64 };
