/**
 * On-device Signal Protocol store.
 * Private key material (identity, prekeys) → OS SecureStore / Keystore.
 * Session records use the same securePut path (SecureStore) with file fallback
 * when the record exceeds SecureStore size limits — never RAM-only.
 */

import * as FileSystem from 'expo-file-system';
import {
  Direction,
  KeyPairType,
  SessionRecordType,
  StorageType,
} from '@privacyresearch/libsignal-protocol-typescript';
import {
  secureDel,
  secureGet,
  securePut,
} from '../security/secureVault';

const ROOT = `${FileSystem.documentDirectory ?? ''}synap_signal_v2/`;

/** One store instance per deviceId — sessions must share disk + memory cache. */
const storeByDevice = new Map<string, SecureSignalStore>();

export function getSecureSignalStore(deviceId: string): SecureSignalStore {
  let s = storeByDevice.get(deviceId);
  if (!s) {
    s = new SecureSignalStore(deviceId);
    storeByDevice.set(deviceId, s);
  }
  return s;
}

export function dropSecureSignalStore(deviceId: string): void {
  storeByDevice.delete(deviceId);
}

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

function serKeyPair(kp: KeyPairType): string {
  return JSON.stringify({ pub: b64(kp.pubKey), priv: b64(kp.privKey) });
}

function deKeyPair(raw: string): KeyPairType {
  const o = JSON.parse(raw) as { pub: string; priv: string };
  return { pubKey: unb64(o.pub), privKey: unb64(o.priv) };
}

async function ensureDir(path: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(path, { intermediates: true });
  }
}

function safeName(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export class SecureSignalStore implements StorageType {
  private ready: Promise<void>;
  /** OTKs pending deletion until decrypt succeeds (libsignal calls remove early). */
  private deferredPreKeyRemovals = new Set<string>();
  /**
   * Sync identity cache — libsignal processV3 (receive PreKey) does NOT await
   * isTrustedIdentity; a Promise would always be truthy and auto-trust. Keep a
   * sync Map and hydrate before encrypt/decrypt.
   */
  private identityCache = new Map<string, string>();
  private identitiesLoaded: Promise<void> | null = null;
  /** Write-through session cache — always mirrored to SecureStore/file. */
  private sessionCache = new Map<string, SessionRecordType>();
  private hydratePromise: Promise<void> | null = null;
  private hydrated = false;

  constructor(private readonly deviceId: string) {
    this.ready = ensureDir(this.base());
  }

  /** True after identities + sessions have been read from disk/SecureStore. */
  isStoreLoaded(): boolean {
    return this.hydrated;
  }

  /**
   * Load identities and all sess_* records into memory before any decrypt.
   * Safe to call repeatedly; subsequent calls await the same promise.
   */
  async hydrate(): Promise<void> {
    if (this.hydrated) return;
    if (this.hydratePromise) return this.hydratePromise;
    this.hydratePromise = (async () => {
      await this.rw();
      await this.ensureIdentitiesLoaded();
      try {
        const names = await FileSystem.readDirectoryAsync(this.base());
        for (const name of names) {
          if (!name.startsWith('sess_') || !name.endsWith('.sess')) continue;
          const encoded = name.slice('sess_'.length, -'.sess'.length);
          const raw = await this.readSessionRecord(encoded);
          if (raw) this.sessionCache.set(encoded, raw);
        }
      } catch {
        /* empty store */
      }
      // Also pull any sessions that live only in SecureStore (no file yet).
      // Indexed via sess_index.txt when present.
      const indexRaw = await this.read('sess_index.txt');
      if (indexRaw) {
        try {
          const ids = JSON.parse(indexRaw) as string[];
          for (const encoded of ids) {
            if (this.sessionCache.has(encoded)) continue;
            const raw = await this.readSessionRecord(encoded);
            if (raw) this.sessionCache.set(encoded, raw);
          }
        } catch {
          /* ignore bad index */
        }
      }
      this.hydrated = true;
      console.log(
        '[signalStore] hydrated',
        'identities=',
        this.identityCache.size,
        'sessions=',
        this.sessionCache.size,
      );
    })();
    try {
      await this.hydratePromise;
    } catch (err) {
      this.hydratePromise = null;
      throw err;
    }
  }

  private async trackSessionId(encodedAddress: string): Promise<void> {
    const key = safeName(encodedAddress);
    const raw = await this.read('sess_index.txt');
    let ids: string[] = [];
    if (raw) {
      try {
        ids = JSON.parse(raw) as string[];
      } catch {
        ids = [];
      }
    }
    if (!ids.includes(key)) {
      ids.push(key);
      await this.write('sess_index.txt', JSON.stringify(ids));
    }
  }

  private async readSessionRecord(
    encodedAddress: string,
  ): Promise<SessionRecordType | undefined> {
    const key = safeName(encodedAddress);
    const raw = await this.readSecret(`sess_${key}`, `sess_${key}.sess`);
    return raw ?? undefined;
  }

  private base(): string {
    return `${ROOT}${safeName(this.deviceId)}/`;
  }

  private path(suffix: string): string {
    return `${this.base()}${safeName(suffix)}`;
  }

  private async rw(): Promise<void> {
    await this.ready;
  }

  private async read(suffix: string): Promise<string | null> {
    await this.rw();
    const p = this.path(suffix);
    const info = await FileSystem.getInfoAsync(p);
    if (!info.exists) return null;
    return FileSystem.readAsStringAsync(p);
  }

  private async write(suffix: string, value: string): Promise<void> {
    await this.rw();
    await FileSystem.writeAsStringAsync(this.path(suffix), value);
  }

  private async del(suffix: string): Promise<void> {
    await this.rw();
    const p = this.path(suffix);
    const info = await FileSystem.getInfoAsync(p);
    if (info.exists) await FileSystem.deleteAsync(p, { idempotent: true });
  }

  private sk(suffix: string): string {
    // Expo SecureStore key length limit — keep short.
    return `ssig_${safeName(this.deviceId).slice(0, 24)}_${safeName(suffix).slice(0, 40)}`;
  }

  private async readSecret(suffix: string, fileFallback: string): Promise<string | null> {
    const fromSecure = await secureGet(this.sk(suffix));
    if (fromSecure) return fromSecure;
    const legacy = await this.read(fileFallback);
    if (legacy) {
      try {
        await securePut(this.sk(suffix), legacy);
        await this.del(fileFallback);
        console.log('[signalStore] migrated', fileFallback, '→ SecureStore');
      } catch (err) {
        console.warn(
          '[signalStore] SecureStore migrate failed; file left in place',
          err instanceof Error ? err.message : err,
        );
      }
      return legacy;
    }
    return null;
  }

  private async writeSecret(suffix: string, value: string, fileFallback: string): Promise<void> {
    try {
      await securePut(this.sk(suffix), value);
      await this.del(fileFallback).catch(() => undefined);
    } catch (err) {
      console.warn(
        '[signalStore] SecureStore write failed → file fallback (logged)',
        err instanceof Error ? err.message : err,
      );
      await this.write(fileFallback, value);
    }
  }

  async getIdentityKeyPair(): Promise<KeyPairType | undefined> {
    const raw = await this.readSecret('identity', 'identity.json');
    return raw ? deKeyPair(raw) : undefined;
  }

  async setIdentityKeyPair(kp: KeyPairType): Promise<void> {
    await this.writeSecret('identity', serKeyPair(kp), 'identity.json');
  }

  async getLocalRegistrationId(): Promise<number | undefined> {
    const raw = await this.read('regId.txt');
    return raw ? Number(raw) : undefined;
  }

  async setLocalRegistrationId(id: number): Promise<void> {
    await this.write('regId.txt', String(id));
  }

  /** Load id_*.txt into the sync cache. Call before encrypt/decrypt. */
  async ensureIdentitiesLoaded(): Promise<void> {
    if (this.identitiesLoaded) return this.identitiesLoaded;
    this.identitiesLoaded = (async () => {
      await this.rw();
      try {
        const names = await FileSystem.readDirectoryAsync(this.base());
        for (const name of names) {
          if (!name.startsWith('id_') || !name.endsWith('.txt')) continue;
          const id = name.slice(3, -4);
          const raw = await FileSystem.readAsStringAsync(`${this.base()}${name}`);
          this.identityCache.set(id, raw);
        }
      } catch {
        /* empty store */
      }
    })();
    return this.identitiesLoaded;
  }

  /**
   * MUST return a bare boolean (not only a Promise): receive PreKey path in
   * @privacyresearch/libsignal does not await this call.
   */
  isTrustedIdentity(
    identifier: string,
    identityKey: ArrayBuffer,
    _direction: Direction,
  ): boolean {
    void _direction;
    const id = safeName((identifier.split('.')[0] || identifier) as string);
    const next = b64(identityKey);
    const raw = this.identityCache.get(id);
    if (!raw) return true;
    return raw === next;
  }

  async saveIdentity(
    encodedAddress: string,
    publicKey: ArrayBuffer,
  ): Promise<boolean> {
    const id = safeName(
      (encodedAddress.split('.')[0] || encodedAddress) as string,
    );
    const key = `id_${id}.txt`;
    const existing =
      this.identityCache.get(id) ?? (await this.read(key));
    const next = b64(publicKey);
    await this.write(key, next);
    this.identityCache.set(id, next);
    return Boolean(existing && existing !== next);
  }

  async getTrustedIdentityB64(identifier: string): Promise<string | null> {
    const id = safeName((identifier.split('.')[0] || identifier) as string);
    if (this.identityCache.has(id)) return this.identityCache.get(id)!;
    return this.read(`id_${id}.txt`);
  }

  async removeSession(encodedAddress: string): Promise<void> {
    const key = safeName(encodedAddress);
    this.sessionCache.delete(key);
    await secureDel(this.sk(`sess_${key}`));
    await this.del(`sess_${key}.sess`);
  }

  async loadPreKey(keyId: string | number): Promise<KeyPairType | undefined> {
    const raw = await this.readSecret(`pk_${keyId}`, `pk_${keyId}.json`);
    return raw ? deKeyPair(raw) : undefined;
  }

  async storePreKey(keyId: number | string, keyPair: KeyPairType): Promise<void> {
    await this.writeSecret(`pk_${keyId}`, serKeyPair(keyPair), `pk_${keyId}.json`);
  }

  /**
   * libsignal may call this during decryptPreKey before plaintext is returned.
   * Defer deletion so a failed decrypt does not burn the OTK.
   */
  async removePreKey(keyId: number | string): Promise<void> {
    this.deferredPreKeyRemovals.add(String(keyId));
  }

  /** Call after a successful PreKey decrypt to actually drop the OTK. */
  async commitDeferredPreKeyRemovals(): Promise<void> {
    const ids = [...this.deferredPreKeyRemovals];
    this.deferredPreKeyRemovals.clear();
    for (const id of ids) {
      await secureDel(this.sk(`pk_${id}`));
      await this.del(`pk_${id}.json`);
    }
  }

  /** Drop deferred removals without deleting (decrypt failed). */
  discardDeferredPreKeyRemovals(): void {
    this.deferredPreKeyRemovals.clear();
  }

  async storeSession(
    encodedAddress: string,
    record: SessionRecordType,
  ): Promise<void> {
    const key = safeName(encodedAddress);
    this.sessionCache.set(key, record);
    await this.writeSecret(`sess_${key}`, record, `sess_${key}.sess`);
    await this.trackSessionId(key);
  }

  async loadSession(
    encodedAddress: string,
  ): Promise<SessionRecordType | undefined> {
    const key = safeName(encodedAddress);
    const cached = this.sessionCache.get(key);
    if (cached != null) return cached;
    const raw = await this.readSessionRecord(key);
    if (raw != null) this.sessionCache.set(key, raw);
    return raw;
  }

  async loadSignedPreKey(
    keyId: number | string,
  ): Promise<KeyPairType | undefined> {
    const raw = await this.readSecret(`spk_${keyId}`, `spk_${keyId}.json`);
    return raw ? deKeyPair(raw) : undefined;
  }

  async storeSignedPreKey(
    keyId: number | string,
    keyPair: KeyPairType,
  ): Promise<void> {
    await this.writeSecret(
      `spk_${keyId}`,
      serKeyPair(keyPair),
      `spk_${keyId}.json`,
    );
  }

  async removeSignedPreKey(keyId: number | string): Promise<void> {
    await secureDel(this.sk(`spk_${keyId}`));
    await this.del(`spk_${keyId}.json`);
  }

  async savePeerBundle(peerUserId: string, json: string): Promise<void> {
    await ensureDir(`${this.base()}peers/`);
    await FileSystem.writeAsStringAsync(
      `${this.base()}peers/${safeName(peerUserId)}.json`,
      json,
    );
  }

  async loadPeerBundle(peerUserId: string): Promise<string | null> {
    const p = `${this.base()}peers/${safeName(peerUserId)}.json`;
    const info = await FileSystem.getInfoAsync(p);
    if (!info.exists) return null;
    return FileSystem.readAsStringAsync(p);
  }

  async listPreKeyIds(max = 40): Promise<number[]> {
    const ids: number[] = [];
    for (let i = 1; i <= max; i++) {
      if (await this.loadPreKey(i)) ids.push(i);
    }
    return ids;
  }

  async wipeAll(): Promise<void> {
    await this.rw();
    await secureDel(this.sk('identity'));
    for (let i = 1; i <= 40; i++) {
      await secureDel(this.sk(`pk_${i}`));
      await secureDel(this.sk(`spk_${i}`));
    }
    for (const key of this.sessionCache.keys()) {
      await secureDel(this.sk(`sess_${key}`));
    }
    const info = await FileSystem.getInfoAsync(this.base());
    if (info.exists) {
      await FileSystem.deleteAsync(this.base(), { idempotent: true });
    }
    this.identityCache.clear();
    this.identitiesLoaded = null;
    this.sessionCache.clear();
    this.hydrated = false;
    this.hydratePromise = null;
    this.ready = ensureDir(this.base());
    dropSecureSignalStore(this.deviceId);
  }
}
