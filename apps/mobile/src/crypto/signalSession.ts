/**
 * Signal Protocol sessions for Private 1:1 chats.
 * Replaces synapmsg-pq-v1 for NEW encrypts.
 */

import {
  KeyHelper,
  SessionBuilder,
  SessionCipher,
  SignalProtocolAddress,
  DeviceType,
  FingerprintGenerator,
  MessageType,
} from '@privacyresearch/libsignal-protocol-typescript';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import { apiClient } from '../api/client';
import { mayDecryptE2e } from '../security/deviceGuard';
import { SecureSignalStore } from './signalStore';

export const SIGNAL_PROTOCOL = 'libsignal' as const;
export const SIGNAL_CIPHERTEXT_TYPE = 3;

const DEVICE_ID_KEY = 'synap_signal_device_id';
const META_PREFIX = 'synap_signal_meta_';

function b64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return globalThis.btoa(s);
}

function unb64(s: string): ArrayBuffer {
  const bin = globalThis.atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

function utf8(buf: ArrayBuffer): string {
  return new TextDecoder().decode(new Uint8Array(buf));
}

function toUtf8Buf(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer;
}

function binToB64(bin: string): string {
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) & 0xff;
  return b64(bytes.buffer);
}

function b64ToBin(s: string): string {
  const bytes = new Uint8Array(unb64(s));
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]!);
  return out;
}

export type SignalPublicBundle = {
  deviceId: string;
  registrationId: number;
  identityKeyPub: string;
  signedPreKeyPub: string;
  signedPreKeyId: number;
  signedPreKeySig: string;
  preKeys: Array<{ keyId: number; publicKey: string }>;
  protocol: typeof SIGNAL_PROTOCOL;
};

async function ensureDeviceId(): Promise<string> {
  let id = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (id) return id;
  const raw = await Crypto.getRandomBytesAsync(8);
  id = `s_${Platform.OS}_${Array.from(raw)
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('')}`;
  await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
  return id;
}

type Meta = {
  signedPreKeyId: number;
  signedPreKeyPub: string;
  signedPreKeySig: string;
  identityKeyPub: string;
  registrationId: number;
  deviceNumericId: number;
};

async function loadMeta(deviceId: string): Promise<Meta | null> {
  const raw = await SecureStore.getItemAsync(`${META_PREFIX}${deviceId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Meta;
  } catch {
    return null;
  }
}

async function saveMeta(deviceId: string, meta: Meta): Promise<void> {
  await SecureStore.setItemAsync(`${META_PREFIX}${deviceId}`, JSON.stringify(meta));
}

/** Install / load Signal identity. Private keys stay in SecureSignalStore. */
export async function ensureSignalBundle(): Promise<SignalPublicBundle> {
  const deviceId = await ensureDeviceId();
  const store = new SecureSignalStore(deviceId);
  let identity = await store.getIdentityKeyPair();
  let registrationId = await store.getLocalRegistrationId();
  let meta = await loadMeta(deviceId);

  if (!identity || !registrationId || !meta) {
    registrationId = KeyHelper.generateRegistrationId();
    identity = await KeyHelper.generateIdentityKeyPair();
    await store.setIdentityKeyPair(identity);
    await store.setLocalRegistrationId(registrationId);

    const signedPreKeyId = 1;
    const signed = await KeyHelper.generateSignedPreKey(identity, signedPreKeyId);
    await store.storeSignedPreKey(signedPreKeyId, signed.keyPair);

    const preKeys: SignalPublicBundle['preKeys'] = [];
    for (let i = 1; i <= 20; i++) {
      const pk = await KeyHelper.generatePreKey(i);
      await store.storePreKey(pk.keyId, pk.keyPair);
      preKeys.push({ keyId: pk.keyId, publicKey: b64(pk.keyPair.pubKey) });
    }

    meta = {
      signedPreKeyId,
      signedPreKeyPub: b64(signed.keyPair.pubKey),
      signedPreKeySig: b64(signed.signature),
      identityKeyPub: b64(identity.pubKey),
      registrationId,
      deviceNumericId: 1,
    };
    await saveMeta(deviceId, meta);

    return {
      deviceId,
      registrationId,
      identityKeyPub: meta.identityKeyPub,
      signedPreKeyPub: meta.signedPreKeyPub,
      signedPreKeyId: meta.signedPreKeyId,
      signedPreKeySig: meta.signedPreKeySig,
      preKeys,
      protocol: SIGNAL_PROTOCOL,
    };
  }

  const preKeys: SignalPublicBundle['preKeys'] = [];
  for (let i = 1; i <= 40; i++) {
    const kp = await store.loadPreKey(i);
    if (kp) preKeys.push({ keyId: i, publicKey: b64(kp.pubKey) });
  }

  return {
    deviceId,
    registrationId: meta.registrationId,
    identityKeyPub: meta.identityKeyPub,
    signedPreKeyPub: meta.signedPreKeyPub,
    signedPreKeyId: meta.signedPreKeyId,
    signedPreKeySig: meta.signedPreKeySig,
    preKeys,
    protocol: SIGNAL_PROTOCOL,
  };
}

export async function getSignalIdentityPub(): Promise<string | null> {
  const deviceId = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (!deviceId) return null;
  const meta = await loadMeta(deviceId);
  return meta?.identityKeyPub ?? null;
}

export async function getSignalDeviceId(): Promise<string | null> {
  return SecureStore.getItemAsync(DEVICE_ID_KEY);
}

type PeerBundleApi = {
  identityKey: string;
  signedPreKey: { keyId: number; publicKey: string; signature?: string };
  oneTimePreKey?: { keyId: number; publicKey: string } | null;
  registrationId: number;
  deviceId?: string;
  protocol?: string;
};

async function fetchPeerBundle(userId: string): Promise<PeerBundleApi> {
  const { data } = await apiClient.get<PeerBundleApi>(
    `/e2e/users/${userId}/bundle`,
    { params: { consume: '1' } },
  );
  return data;
}

function addr(userId: string, deviceNumericId = 1): SignalProtocolAddress {
  return new SignalProtocolAddress(userId, deviceNumericId);
}

export async function signalEncryptForPeer(
  peerUserId: string,
  plaintext: string,
): Promise<{ ciphertext: string; ciphertextType: number }> {
  const deviceId = await ensureDeviceId();
  const store = new SecureSignalStore(deviceId);
  const meta = await loadMeta(deviceId);
  if (!meta) throw new Error('Signal identity missing — register device');

  const peerAddr = addr(peerUserId, 1);
  const cipherProbe = new SessionCipher(store, peerAddr);
  const hasSession = await cipherProbe.hasOpenSession();

  if (!hasSession) {
    const bundle = await fetchPeerBundle(peerUserId);
    if (!bundle.signedPreKey.signature) {
      throw new Error(
        'El contacto no tiene bundle Signal (falta firma de signed prekey). Pedile que actualice / registre dispositivo.',
      );
    }
    const device: DeviceType = {
      identityKey: unb64(bundle.identityKey),
      signedPreKey: {
        keyId: bundle.signedPreKey.keyId,
        publicKey: unb64(bundle.signedPreKey.publicKey),
        signature: unb64(bundle.signedPreKey.signature),
      },
      registrationId: bundle.registrationId,
    };
    if (bundle.oneTimePreKey?.publicKey) {
      device.preKey = {
        keyId: bundle.oneTimePreKey.keyId,
        publicKey: unb64(bundle.oneTimePreKey.publicKey),
      };
    }
    const builder = new SessionBuilder(store, peerAddr);
    await builder.processPreKey(device);
  }

  const cipher = new SessionCipher(store, peerAddr);
  const encrypted: MessageType = await cipher.encrypt(toUtf8Buf(plaintext));
  if (typeof encrypted.body !== 'string') {
    throw new Error('encrypt returned no body');
  }
  const wire = {
    v: 2,
    protocol: SIGNAL_PROTOCOL,
    type: encrypted.type ?? 1,
    body: binToB64(encrypted.body),
  };
  return {
    ciphertext: b64(toUtf8Buf(JSON.stringify(wire))),
    ciphertextType: SIGNAL_CIPHERTEXT_TYPE,
  };
}

export async function signalDecryptFromPeer(
  peerUserId: string,
  envelopeB64: string,
): Promise<string | null> {
  const gate = mayDecryptE2e();
  if (!gate.ok) return null;
  try {
    const deviceId = await ensureDeviceId();
    const store = new SecureSignalStore(deviceId);
    const json = utf8(unb64(envelopeB64));
    const wire = JSON.parse(json) as {
      v: number;
      protocol: string;
      type: number;
      body: string;
    };
    if (wire.protocol !== SIGNAL_PROTOCOL || wire.v !== 2) return null;
    const peerAddr = addr(peerUserId, 1);
    const cipher = new SessionCipher(store, peerAddr);
    const body = b64ToBin(wire.body);
    const plain =
      wire.type === 3
        ? await cipher.decryptPreKeyWhisperMessage(body, 'binary')
        : await cipher.decryptWhisperMessage(body, 'binary');
    return utf8(plain);
  } catch {
    return null;
  }
}

export async function signalSafetyNumber(
  myUserId: string,
  myPub: string,
  theirUserId: string,
  theirPub: string,
): Promise<string> {
  const gen = new FingerprintGenerator(5200);
  const fp = await gen.createFor(
    myUserId,
    unb64(myPub),
    theirUserId,
    unb64(theirPub),
  );
  return String(fp).replace(/\s+/g, ' ').trim();
}

export function safetyQrPayload(safetyNumber: string): string {
  return `synapmsg:safety:${safetyNumber.replace(/\s+/g, '')}`;
}
