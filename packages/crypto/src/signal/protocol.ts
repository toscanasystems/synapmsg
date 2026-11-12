/**
 * Signal Protocol (libsignal) session helpers.
 * Server never sees private keys — only public prekey bundles.
 */

import {
  DeviceType,
  FingerprintGenerator,
  KeyHelper,
  MessageType,
  SessionBuilder,
  SessionCipher,
  SignalProtocolAddress,
  StorageType,
} from '@privacyresearch/libsignal-protocol-typescript';
import { MemorySignalStore } from './memoryStore';
import { SIGNAL_CIPHERTEXT_TYPE, SIGNAL_PROTOCOL } from './constants';
import { b64ToBuf, bufToB64, bufToUtf8, utf8ToBuf } from './bytes';

export type PublicPreKeyBundle = {
  registrationId: number;
  identityKey: string; // base64
  signedPreKey: { keyId: number; publicKey: string; signature: string };
  oneTimePreKey?: { keyId: number; publicKey: string } | null;
  deviceId: number;
  protocol: typeof SIGNAL_PROTOCOL;
};

export type LocalInstall = {
  store: MemorySignalStore;
  registrationId: number;
  deviceId: number;
  identityKeyPubB64: string;
  signedPreKeyId: number;
  signedPreKeyPubB64: string;
  signedPreKeySigB64: string;
  oneTimePreKeys: Array<{ keyId: number; publicKey: string; privateKeptInStore: true }>;
  protocol: typeof SIGNAL_PROTOCOL;
};

export type SignalWireEnvelope = {
  v: 2;
  protocol: typeof SIGNAL_PROTOCOL;
  /** libsignal message type: 3 = PreKeyWhisperMessage, 1 = WhisperMessage */
  type: number;
  body: string; // base64 of binary body
};

/** Generate identity + signed prekey + one-time prekeys. Privates stay in store. */
export async function installSignalIdentity(
  opts?: { deviceId?: number; preKeyCount?: number },
): Promise<LocalInstall> {
  const store = new MemorySignalStore();
  const registrationId = KeyHelper.generateRegistrationId();
  const identity = await KeyHelper.generateIdentityKeyPair();
  store.identityKeyPair = identity;
  store.registrationId = registrationId;

  const signedPreKeyId = 1;
  const signed = await KeyHelper.generateSignedPreKey(identity, signedPreKeyId);
  await store.storeSignedPreKey(signedPreKeyId, signed.keyPair);

  const preKeyCount = opts?.preKeyCount ?? 10;
  const oneTimePreKeys: LocalInstall['oneTimePreKeys'] = [];
  for (let i = 1; i <= preKeyCount; i++) {
    const pk = await KeyHelper.generatePreKey(i);
    await store.storePreKey(pk.keyId, pk.keyPair);
    oneTimePreKeys.push({
      keyId: pk.keyId,
      publicKey: bufToB64(pk.keyPair.pubKey),
      privateKeptInStore: true,
    });
  }

  return {
    store,
    registrationId,
    deviceId: opts?.deviceId ?? 1,
    identityKeyPubB64: bufToB64(identity.pubKey),
    signedPreKeyId,
    signedPreKeyPubB64: bufToB64(signed.keyPair.pubKey),
    signedPreKeySigB64: bufToB64(signed.signature),
    oneTimePreKeys,
    protocol: SIGNAL_PROTOCOL,
  };
}

export function toPublicBundle(
  install: LocalInstall,
  oneTime?: { keyId: number; publicKey: string } | null,
): PublicPreKeyBundle {
  return {
    registrationId: install.registrationId,
    identityKey: install.identityKeyPubB64,
    signedPreKey: {
      keyId: install.signedPreKeyId,
      publicKey: install.signedPreKeyPubB64,
      signature: install.signedPreKeySigB64,
    },
    oneTimePreKey: oneTime ?? null,
    deviceId: install.deviceId,
    protocol: SIGNAL_PROTOCOL,
  };
}

function addressFor(userId: string, deviceId: number): SignalProtocolAddress {
  // Signal address name must be stable per user; deviceId is numeric.
  return new SignalProtocolAddress(userId, deviceId);
}

export async function processPeerBundle(
  store: StorageType,
  peerUserId: string,
  bundle: PublicPreKeyBundle,
): Promise<void> {
  const addr = addressFor(peerUserId, bundle.deviceId || 1);
  const device: DeviceType = {
    identityKey: b64ToBuf(bundle.identityKey),
    signedPreKey: {
      keyId: bundle.signedPreKey.keyId,
      publicKey: b64ToBuf(bundle.signedPreKey.publicKey),
      signature: b64ToBuf(bundle.signedPreKey.signature),
    },
    registrationId: bundle.registrationId,
  };
  if (bundle.oneTimePreKey?.publicKey) {
    device.preKey = {
      keyId: bundle.oneTimePreKey.keyId,
      publicKey: b64ToBuf(bundle.oneTimePreKey.publicKey),
    };
  }
  const builder = new SessionBuilder(store, addr);
  await builder.processPreKey(device);
}

export async function signalEncrypt(
  store: StorageType,
  peerUserId: string,
  peerDeviceId: number,
  plaintext: string,
): Promise<{ ciphertext: string; ciphertextType: number }> {
  const addr = addressFor(peerUserId, peerDeviceId);
  const cipher = new SessionCipher(store, addr);
  const encrypted: MessageType = await cipher.encrypt(utf8ToBuf(plaintext));
  if (typeof encrypted.body !== 'string' || !encrypted.body.length) {
    throw new Error('SessionCipher.encrypt returned empty body');
  }
  const wire: SignalWireEnvelope = {
    v: 2,
    protocol: SIGNAL_PROTOCOL,
    type: encrypted.type ?? 1,
    body: binaryStringToB64(encrypted.body),
  };
  return {
    ciphertext: bufToB64(utf8ToBuf(JSON.stringify(wire))),
    ciphertextType: SIGNAL_CIPHERTEXT_TYPE,
  };
}

export async function signalDecrypt(
  store: StorageType,
  peerUserId: string,
  peerDeviceId: number,
  envelopeB64: string,
): Promise<string> {
  const wire = JSON.parse(bufToUtf8(b64ToBuf(envelopeB64))) as SignalWireEnvelope;
  if (wire.protocol !== SIGNAL_PROTOCOL || wire.v !== 2) {
    throw new Error('Not a libsignal envelope');
  }
  const addr = addressFor(peerUserId, peerDeviceId);
  const cipher = new SessionCipher(store, addr);
  const bodyBinary = b64ToBinaryString(wire.body);
  let plainBuf: ArrayBuffer;
  if (wire.type === 3) {
    plainBuf = await cipher.decryptPreKeyWhisperMessage(bodyBinary, 'binary');
  } else {
    plainBuf = await cipher.decryptWhisperMessage(bodyBinary, 'binary');
  }
  return bufToUtf8(plainBuf);
}

/** Safety number (numeric fingerprint) for two identity pubs. */
export async function signalSafetyNumber(
  localUserId: string,
  localIdentityPubB64: string,
  remoteUserId: string,
  remoteIdentityPubB64: string,
): Promise<string> {
  const gen = new FingerprintGenerator(5200);
  const fp = await gen.createFor(
    localUserId,
    b64ToBuf(localIdentityPubB64),
    remoteUserId,
    b64ToBuf(remoteIdentityPubB64),
  );
  // FingerprintGenerator returns displayable string; normalize spacing.
  return String(fp).replace(/\s+/g, ' ').trim();
}

/** QR payload — both sides scan/compare the same sorted safety string. */
export function safetyQrPayload(safetyNumber: string): string {
  const compact = safetyNumber.replace(/\s+/g, '');
  return `synapmsg:safety:${compact}`;
}

function binaryStringToB64(bin: string): string {
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) & 0xff;
  return bufToB64(bytes.buffer);
}

function b64ToBinaryString(b64: string): string {
  const buf = b64ToBuf(b64);
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return s;
}
