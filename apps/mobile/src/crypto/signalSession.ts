/**
 * Signal Protocol sessions for Private 1:1 chats.
 * Peer public bundles are downloaded and persisted on device.
 * Private keys never leave the phone / never uploaded.
 */

import {
  KeyHelper,
  SessionBuilder,
  SessionCipher,
  SignalProtocolAddress,
  DeviceType,
  FingerprintGenerator,
  MessageType,
  setWebCrypto,
} from '@privacyresearch/libsignal-protocol-typescript';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import { apiClient } from '../api/client';
import { mayDecryptE2e } from '../security/deviceGuard';
import {
  dropSecureSignalStore,
  getSecureSignalStore,
  SecureSignalStore,
} from './signalStore';
import * as FileSystem from 'expo-file-system';
import { bytesToUtf8, utf8ToArrayBuffer } from './utf8Bytes';
import { IdentityKeyChangedError } from './identityTrust';

const LAST_DECRYPT_ERR_FILE = `${FileSystem.documentDirectory ?? ''}synap_signal_last_decrypt_error.txt`;

async function writeLastDecryptError(line: string): Promise<void> {
  try {
    await FileSystem.writeAsStringAsync(LAST_DECRYPT_ERR_FILE, line);
  } catch {
    /* ignore */
  }
}

let storeReadyPromise: Promise<void> | null = null;
let storeReadyDeviceId: string | null = null;

/** Await until Signal identity + sessions are loaded from SecureStore/disk. */
export async function awaitSignalStoreReady(): Promise<void> {
  const deviceId = await ensureDeviceId();
  if (storeReadyPromise && storeReadyDeviceId === deviceId) {
    return storeReadyPromise;
  }
  storeReadyDeviceId = deviceId;
  storeReadyPromise = (async () => {
    const store = getSecureSignalStore(deviceId);
    await store.hydrate();
  })();
  try {
    await storeReadyPromise;
  } catch (err) {
    storeReadyPromise = null;
    throw err;
  }
}

export function isSignalStoreLoaded(): boolean {
  if (!storeReadyDeviceId) return false;
  try {
    return getSecureSignalStore(storeReadyDeviceId).isStoreLoaded();
  } catch {
    return false;
  }
}

/** Serialize encrypt/decrypt per peer — concurrent SessionCipher races corrupt sessions. */
const peerCryptoLocks = new Map<string, Promise<unknown>>();

async function withPeerCryptoLock<T>(
  peerUserId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = peerCryptoLocks.get(peerUserId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const chained = prev.then(() => gate);
  peerCryptoLocks.set(peerUserId, chained);
  await prev.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
    if (peerCryptoLocks.get(peerUserId) === chained) {
      peerCryptoLocks.delete(peerUserId);
    }
  }
}

function storeLoadedFlag(): boolean {
  return isSignalStoreLoaded();
}

try {
  if (globalThis.crypto) {
    setWebCrypto(globalThis.crypto as Crypto);
  }
} catch {
  /* encrypt/decrypt will surface errors if crypto missing */
}

export const SIGNAL_PROTOCOL = 'libsignal' as const;
export const SIGNAL_CIPHERTEXT_TYPE = 3;

const DEVICE_ID_KEY = 'synap_signal_device_id';

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

function toUtf8Buf(text: string): ArrayBuffer {
  return utf8ToArrayBuffer(text);
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

function logSignal(...args: unknown[]): void {
  console.warn('[signal]', ...args);
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

async function loadMeta(store: SecureSignalStore): Promise<Meta | null> {
  // Reuse identity pub from store files via a small meta sidecar written beside them.
  const raw = await storeLoadMeta(store);
  return raw;
}

/** Sidecar meta through peer-bundle style file API on the store. */
async function storeLoadMeta(store: SecureSignalStore): Promise<Meta | null> {
  const raw = await store.loadPeerBundle('__local_meta__');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Meta;
  } catch {
    return null;
  }
}

async function storeSaveMeta(store: SecureSignalStore, meta: Meta): Promise<void> {
  await store.savePeerBundle('__local_meta__', JSON.stringify(meta));
}

let ensureSignalBundleInflight: Promise<SignalPublicBundle> | null = null;

/** Install / load Signal identity. Private keys stay on device. */
export async function ensureSignalBundle(): Promise<SignalPublicBundle> {
  if (ensureSignalBundleInflight) return ensureSignalBundleInflight;
  ensureSignalBundleInflight = (async () => {
    const deviceId = await ensureDeviceId();
    await awaitSignalStoreReady();
    const store = getSecureSignalStore(deviceId);
    let identity = await store.getIdentityKeyPair();
    let registrationId = await store.getLocalRegistrationId();
    let meta = await loadMeta(store);

    if (!identity || !registrationId || !meta) {
      registrationId = KeyHelper.generateRegistrationId();
      identity = await KeyHelper.generateIdentityKeyPair();
      await store.setIdentityKeyPair(identity);
      await store.setLocalRegistrationId(registrationId);

      const signedPreKeyId = 1;
      const signed = await KeyHelper.generateSignedPreKey(
        identity,
        signedPreKeyId,
      );
      await store.storeSignedPreKey(signedPreKeyId, signed.keyPair);

      const preKeys: SignalPublicBundle['preKeys'] = [];
      for (let i = 1; i <= 20; i++) {
        const pk = await KeyHelper.generatePreKey(i);
        await store.storePreKey(pk.keyId, pk.keyPair);
        // Verify persist before publishing the public half.
        const check = await store.loadPreKey(pk.keyId);
        if (!check) {
          throw new Error(`OTK ${pk.keyId} failed to persist on device`);
        }
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
      await storeSaveMeta(store, meta);
      logSignal('identity installed', {
        deviceId,
        registrationId,
        preKeyCount: preKeys.length,
      });

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
    logSignal('identity loaded', {
      deviceId,
      registrationId: meta.registrationId,
      preKeyCount: preKeys.length,
    });

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
  })();
  try {
    return await ensureSignalBundleInflight;
  } finally {
    ensureSignalBundleInflight = null;
  }
}

export async function getSignalIdentityPub(): Promise<string | null> {
  const deviceId = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (!deviceId) return null;
  await awaitSignalStoreReady();
  const store = getSecureSignalStore(deviceId);
  const meta = await loadMeta(store);
  return meta?.identityKeyPub ?? null;
}

export async function getSignalDeviceId(): Promise<string | null> {
  return SecureStore.getItemAsync(DEVICE_ID_KEY);
}

export async function wipeSignalLocalSecrets(): Promise<void> {
  const deviceId = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (deviceId) {
    const store = getSecureSignalStore(deviceId);
    await store.wipeAll();
    dropSecureSignalStore(deviceId);
  }
  storeReadyPromise = null;
  storeReadyDeviceId = null;
  await SecureStore.deleteItemAsync(DEVICE_ID_KEY).catch(() => undefined);
}

export async function getSignalIdentityPrivB64ForProve(): Promise<string | null> {
  const deviceId = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (!deviceId) return null;
  await awaitSignalStoreReady();
  const store = getSecureSignalStore(deviceId);
  const kp = await store.getIdentityKeyPair();
  if (!kp) return null;
  return b64(kp.privKey);
}

export type PeerBundleApi = {
  identityKey: string;
  signedPreKey: { keyId: number; publicKey: string; signature?: string };
  oneTimePreKey?: { keyId: number; publicKey: string } | null;
  registrationId: number;
  deviceId?: string;
  protocol?: string;
};

/**
 * Download peer public bundle.
 * consume=false for cache/prefetch (does not burn server OTKs).
 * consume=true only when about to build a send session.
 */
async function fetchPeerBundle(
  userId: string,
  consume: boolean,
): Promise<PeerBundleApi> {
  const { data } = await apiClient.get<PeerBundleApi>(
    `/e2e/users/${userId}/bundle`,
    { params: { consume: consume ? '1' : '0' } },
  );
  if (!data?.identityKey) {
    throw new Error('Peer bundle missing identityKey');
  }
  if (!data?.signedPreKey?.publicKey) {
    throw new Error('Peer bundle missing signedPreKey.publicKey');
  }
  if (!data.signedPreKey.signature) {
    throw new Error('Peer bundle missing signedPreKey.signature');
  }
  if (!data.registrationId) {
    throw new Error('Peer bundle missing registrationId');
  }
  return data;
}

function addr(userId: string, deviceNumericId = 1): SignalProtocolAddress {
  return new SignalProtocolAddress(userId, deviceNumericId);
}

function bundleToDevice(bundle: PeerBundleApi): {
  device: DeviceType;
  usedOtk: boolean;
} {
  const device: DeviceType = {
    identityKey: unb64(bundle.identityKey),
    signedPreKey: {
      keyId: bundle.signedPreKey.keyId,
      publicKey: unb64(bundle.signedPreKey.publicKey),
      signature: unb64(bundle.signedPreKey.signature!),
    },
    registrationId: bundle.registrationId,
  };
  let usedOtk = false;
  if (bundle.oneTimePreKey?.publicKey && bundle.oneTimePreKey.keyId != null) {
    device.preKey = {
      keyId: bundle.oneTimePreKey.keyId,
      publicKey: unb64(bundle.oneTimePreKey.publicKey),
    };
    usedOtk = true;
  }
  return { device, usedOtk };
}

/**
 * Prefetch + persist peer public material when opening a chat by number.
 * Does NOT consume OTKs and does NOT build the send session yet —
 * send will fetch with consume=1 so OTKs are only burned when used.
 */
export async function ensurePeerSession(peerUserId: string): Promise<void> {
  await ensureSignalBundle();
  const deviceId = await ensureDeviceId();
  await awaitSignalStoreReady();
  const store = getSecureSignalStore(deviceId);

  const bundle = await fetchPeerBundle(peerUserId, false);
  await store.savePeerBundle(peerUserId, JSON.stringify(bundle));

  const hasOtk = Boolean(bundle.oneTimePreKey?.publicKey);
  if (!hasOtk) {
    logSignal(
      'peer bundle has no one-time prekey; send will use signed prekey only',
      { peerUserId, signedPreKeyId: bundle.signedPreKey.keyId },
    );
  } else {
    logSignal('peer bundle saved (OTK present, not consumed yet)', {
      peerUserId,
      otkId: bundle.oneTimePreKey!.keyId,
      signedPreKeyId: bundle.signedPreKey.keyId,
      protocol: bundle.protocol,
    });
  }
}

/**
 * Ensure a send-capable session: consume one OTK on the server (or signed-only).
 */
async function ensureSendSession(
  store: SecureSignalStore,
  peerUserId: string,
): Promise<void> {
  const peerAddr = addr(peerUserId, 1);
  const cipherProbe = new SessionCipher(store, peerAddr);
  const hasSession = await cipherProbe.hasOpenSession();
  if (hasSession) return;

  const bundle = await fetchPeerBundle(peerUserId, true);
  await store.savePeerBundle(peerUserId, JSON.stringify(bundle));
  const { device, usedOtk } = bundleToDevice(bundle);
  if (!usedOtk) {
    logSignal(
      'no one-time prekey available; establishing session with signed prekey only',
      { peerUserId },
    );
  } else {
    logSignal('consuming one-time prekey for send session', {
      peerUserId,
      keyId: bundle.oneTimePreKey!.keyId,
    });
  }
  const builder = new SessionBuilder(store, peerAddr);
  try {
    await builder.processPreKey(device);
  } catch (err) {
    if (
      err instanceof Error &&
      err.message.includes('Identity key changed')
    ) {
      throw new IdentityKeyChangedError(peerUserId, bundle.identityKey);
    }
    throw err;
  }
}

export async function signalEncryptForPeer(
  peerUserId: string,
  plaintext: string,
): Promise<{ ciphertext: string; ciphertextType: number }> {
  await awaitSignalStoreReady();
  return withPeerCryptoLock(peerUserId, async () => {
    const deviceId = await ensureDeviceId();
    const store = getSecureSignalStore(deviceId);
    const meta = await loadMeta(store);
    if (!meta) throw new Error('Signal identity missing — register device');
    if (!(await store.getIdentityKeyPair())) {
      throw new Error('Signal private identity missing on device');
    }

    try {
      await ensureSendSession(store, peerUserId);

      const cipher = new SessionCipher(store, addr(peerUserId, 1));
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
    } catch (err) {
      if (err instanceof IdentityKeyChangedError) throw err;
      if (
        err instanceof Error &&
        (err.message.includes('Identity key changed') ||
          err.message.includes('Unknown identity key'))
      ) {
        const bundle = await fetchPeerBundle(peerUserId, false);
        throw new IdentityKeyChangedError(peerUserId, bundle.identityKey);
      }
      throw err;
    }
  });
}

/** Local Signal device id (for trust UX / settings). */
export async function getLocalSignalDeviceId(): Promise<string> {
  return ensureDeviceId();
}

export async function signalDecryptFromPeer(
  peerUserId: string,
  envelopeB64: string,
): Promise<string | null> {
  const gate = mayDecryptE2e();
  if (!gate.ok) {
    const line = `decrypt failed at gate: ${gate.reason || 'blocked'} storeLoaded=${storeLoadedFlag()}`;
    logSignal(line);
    await writeLastDecryptError(line);
    return null;
  }

  // Never decrypt before the persistent store is hydrated.
  await awaitSignalStoreReady();

  return withPeerCryptoLock(peerUserId, async () => {
    const loaded = storeLoadedFlag();
    const deviceId = await ensureDeviceId();
    const store = getSecureSignalStore(deviceId);
    store.discardDeferredPreKeyRemovals();

    const identity = await store.getIdentityKeyPair();
    const regId = await store.getLocalRegistrationId();
    const spk = await store.loadSignedPreKey(1);
    if (!identity) {
      const line = `decrypt failed at envelope (libsignal): missing local identity storeLoaded=${loaded}`;
      logSignal(line);
      await writeLastDecryptError(line);
      return null;
    }
    if (!regId) {
      const line = `decrypt failed at envelope (libsignal): missing local registrationId storeLoaded=${loaded}`;
      logSignal(line);
      await writeLastDecryptError(line);
      return null;
    }
    if (!spk) {
      const line = `decrypt failed at envelope (libsignal): missing local signed prekey (id=1) storeLoaded=${loaded}`;
      logSignal(line);
      await writeLastDecryptError(line);
      return null;
    }

    let wire: { v: number; protocol: string; type: number; body: string };
    try {
      const json = bytesToUtf8(unb64(envelopeB64));
      wire = JSON.parse(json) as typeof wire;
    } catch (err) {
      const cause = err instanceof Error ? err.message : String(err);
      const line = `decrypt failed at utf8 conversion (envelope parse): ${cause} storeLoaded=${loaded}`;
      logSignal(line);
      await writeLastDecryptError(line);
      return null;
    }

    if (wire.protocol !== SIGNAL_PROTOCOL || wire.v !== 2) {
      const line = `decrypt failed at envelope (libsignal): bad wire protocol=${wire.protocol} v=${wire.v} storeLoaded=${loaded}`;
      logSignal(line);
      await writeLastDecryptError(line);
      return null;
    }

    const peerAddr = addr(peerUserId, 1);
    const existing = await store.loadSession(peerAddr.toString());
    logSignal('decrypt attempt', {
      peerUserId,
      type: wire.type,
      hasSession: Boolean(existing),
      storeLoaded: loaded,
    });

    // Whisper without a local session cannot be opened — do NOT delete anything.
    // Sender must establish again with a PreKey message. Refresh peer bundle cache only.
    if (wire.type !== 3 && !existing) {
      const line = `decrypt failed at envelope (libsignal): no session for whisper message; session not deleted; need PreKey from peer storeLoaded=${loaded}`;
      logSignal(line, { peerUserId, storeLoaded: loaded });
      await writeLastDecryptError(line);
      try {
        await ensurePeerSession(peerUserId);
      } catch (e) {
        logSignal(
          'peer bundle refresh after missing session failed',
          e instanceof Error ? e.message : e,
        );
      }
      return null;
    }

    let plain: ArrayBuffer;
    try {
      const cipher = new SessionCipher(store, peerAddr);
      const body = b64ToBin(wire.body);
      plain =
        wire.type === 3
          ? await cipher.decryptPreKeyWhisperMessage(body, 'binary')
          : await cipher.decryptWhisperMessage(body, 'binary');
    } catch (err) {
      store.discardDeferredPreKeyRemovals();
      const cause = err instanceof Error ? err.message : String(err);
      if (
        cause.includes('Identity key changed') ||
        cause.includes('Unknown identity key')
      ) {
        try {
          const bundle = await fetchPeerBundle(peerUserId, false);
          throw new IdentityKeyChangedError(peerUserId, bundle.identityKey);
        } catch (inner) {
          if (inner instanceof IdentityKeyChangedError) throw inner;
        }
      }
      // Keep the session: catch-up must not burn a live ratchet by retrying
      // spent historical envelopes. Session heal is explicit (Confío / new PreKey).
      const stillSession = await store.loadSession(peerAddr.toString());
      const line = `decrypt failed at envelope (libsignal): ${cause} storeLoaded=${loaded}`;
      logSignal(line, {
        peerUserId,
        type: wire.type,
        hasSession: Boolean(stillSession),
        storeLoaded: loaded,
        sessionPreserved: Boolean(stillSession),
      });
      await writeLastDecryptError(line);
      return null;
    }

    try {
      const text = bytesToUtf8(plain);
      await store.commitDeferredPreKeyRemovals();
      return text;
    } catch (err) {
      store.discardDeferredPreKeyRemovals();
      const cause = err instanceof Error ? err.message : String(err);
      const line = `decrypt failed at utf8 conversion: ${cause} storeLoaded=${loaded}`;
      logSignal(line, {
        peerUserId,
        plainByteLength: plain.byteLength,
        storeLoaded: loaded,
      });
      await writeLastDecryptError(line);
      return null;
    }
  });
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
