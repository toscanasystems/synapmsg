/**
 * On-device Signal Protocol store.
 * Private keys and sessions live in the app documents dir (survive app kill).
 * Nothing here is uploaded to the server.
 */

import * as FileSystem from 'expo-file-system';
import {
  Direction,
  KeyPairType,
  SessionRecordType,
  StorageType,
} from '@privacyresearch/libsignal-protocol-typescript';

const ROOT = `${FileSystem.documentDirectory ?? ''}synap_signal_v2/`;

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

  constructor(private readonly deviceId: string) {
    this.ready = ensureDir(this.base());
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

  async getIdentityKeyPair(): Promise<KeyPairType | undefined> {
    const raw = await this.read('identity.json');
    return raw ? deKeyPair(raw) : undefined;
  }

  async setIdentityKeyPair(kp: KeyPairType): Promise<void> {
    await this.write('identity.json', serKeyPair(kp));
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
    await this.del(`sess_${safeName(encodedAddress)}.sess`);
  }

  async loadPreKey(keyId: string | number): Promise<KeyPairType | undefined> {
    const raw = await this.read(`pk_${keyId}.json`);
    return raw ? deKeyPair(raw) : undefined;
  }

  async storePreKey(keyId: number | string, keyPair: KeyPairType): Promise<void> {
    await this.write(`pk_${keyId}.json`, serKeyPair(keyPair));
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
    await this.write(`sess_${safeName(encodedAddress)}.sess`, record);
  }

  async loadSession(
    encodedAddress: string,
  ): Promise<SessionRecordType | undefined> {
    const raw = await this.read(`sess_${safeName(encodedAddress)}.sess`);
    return raw ?? undefined;
  }

  async loadSignedPreKey(
    keyId: number | string,
  ): Promise<KeyPairType | undefined> {
    const raw = await this.read(`spk_${keyId}.json`);
    return raw ? deKeyPair(raw) : undefined;
  }

  async storeSignedPreKey(
    keyId: number | string,
    keyPair: KeyPairType,
  ): Promise<void> {
    await this.write(`spk_${keyId}.json`, serKeyPair(keyPair));
  }

  async removeSignedPreKey(keyId: number | string): Promise<void> {
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
    const info = await FileSystem.getInfoAsync(this.base());
    if (info.exists) {
      await FileSystem.deleteAsync(this.base(), { idempotent: true });
    }
    this.identityCache.clear();
    this.identitiesLoaded = null;
    this.ready = ensureDir(this.base());
  }
}
