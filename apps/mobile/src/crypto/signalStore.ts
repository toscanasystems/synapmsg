/**
 * SecureStore-backed Signal Protocol store.
 * Private keys never leave the device.
 */

import * as SecureStore from 'expo-secure-store';
import {
  Direction,
  KeyPairType,
  SessionRecordType,
  StorageType,
} from '@privacyresearch/libsignal-protocol-typescript';

const PREFIX = 'synap_signal_v1_';

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

export class SecureSignalStore implements StorageType {
  constructor(private readonly deviceId: string) {}

  private k(suffix: string): string {
    return `${PREFIX}${this.deviceId}_${suffix}`;
  }

  async getIdentityKeyPair(): Promise<KeyPairType | undefined> {
    const raw = await SecureStore.getItemAsync(this.k('identity'));
    return raw ? deKeyPair(raw) : undefined;
  }

  async setIdentityKeyPair(kp: KeyPairType): Promise<void> {
    await SecureStore.setItemAsync(this.k('identity'), serKeyPair(kp));
  }

  async getLocalRegistrationId(): Promise<number | undefined> {
    const raw = await SecureStore.getItemAsync(this.k('regId'));
    return raw ? Number(raw) : undefined;
  }

  async setLocalRegistrationId(id: number): Promise<void> {
    await SecureStore.setItemAsync(this.k('regId'), String(id));
  }

  async isTrustedIdentity(
    identifier: string,
    identityKey: ArrayBuffer,
    _direction: Direction,
  ): Promise<boolean> {
    void _direction;
    const raw = await SecureStore.getItemAsync(this.k(`id_${identifier}`));
    if (!raw) return true;
    return raw === b64(identityKey);
  }

  async saveIdentity(
    encodedAddress: string,
    publicKey: ArrayBuffer,
  ): Promise<boolean> {
    const id = encodedAddress.split('.')[0] || encodedAddress;
    const key = this.k(`id_${id}`);
    const existing = await SecureStore.getItemAsync(key);
    const next = b64(publicKey);
    await SecureStore.setItemAsync(key, next);
    return Boolean(existing && existing !== next);
  }

  async loadPreKey(keyId: string | number): Promise<KeyPairType | undefined> {
    const raw = await SecureStore.getItemAsync(this.k(`pk_${keyId}`));
    return raw ? deKeyPair(raw) : undefined;
  }

  async storePreKey(keyId: number | string, keyPair: KeyPairType): Promise<void> {
    await SecureStore.setItemAsync(this.k(`pk_${keyId}`), serKeyPair(keyPair));
  }

  async removePreKey(keyId: number | string): Promise<void> {
    await SecureStore.deleteItemAsync(this.k(`pk_${keyId}`));
  }

  async storeSession(
    encodedAddress: string,
    record: SessionRecordType,
  ): Promise<void> {
    await SecureStore.setItemAsync(this.k(`sess_${encodedAddress}`), record);
  }

  async loadSession(
    encodedAddress: string,
  ): Promise<SessionRecordType | undefined> {
    const raw = await SecureStore.getItemAsync(this.k(`sess_${encodedAddress}`));
    return raw ?? undefined;
  }

  async loadSignedPreKey(
    keyId: number | string,
  ): Promise<KeyPairType | undefined> {
    const raw = await SecureStore.getItemAsync(this.k(`spk_${keyId}`));
    return raw ? deKeyPair(raw) : undefined;
  }

  async storeSignedPreKey(
    keyId: number | string,
    keyPair: KeyPairType,
  ): Promise<void> {
    await SecureStore.setItemAsync(this.k(`spk_${keyId}`), serKeyPair(keyPair));
  }

  async removeSignedPreKey(keyId: number | string): Promise<void> {
    await SecureStore.deleteItemAsync(this.k(`spk_${keyId}`));
  }
}
