/**
 * In-memory SignalProtocolStore — for tests and Node proofs.
 * Private keys never leave this process / device store.
 */

import {
  Direction,
  KeyPairType,
  SessionRecordType,
  StorageType,
} from '@privacyresearch/libsignal-protocol-typescript';

export class MemorySignalStore implements StorageType {
  identityKeyPair: KeyPairType | undefined;
  registrationId: number | undefined;
  private identities = new Map<string, ArrayBuffer>();
  private preKeys = new Map<string, KeyPairType>();
  private signedPreKeys = new Map<string, KeyPairType>();
  private sessions = new Map<string, SessionRecordType>();

  async getIdentityKeyPair(): Promise<KeyPairType | undefined> {
    return this.identityKeyPair;
  }

  async getLocalRegistrationId(): Promise<number | undefined> {
    return this.registrationId;
  }

  async isTrustedIdentity(
    identifier: string,
    identityKey: ArrayBuffer,
    _direction: Direction,
  ): Promise<boolean> {
    void _direction;
    const existing = this.identities.get(identifier);
    if (!existing) return true;
    return bufEq(existing, identityKey);
  }

  async saveIdentity(
    encodedAddress: string,
    publicKey: ArrayBuffer,
  ): Promise<boolean> {
    const id = encodedAddress.split('.')[0] || encodedAddress;
    const existing = this.identities.get(id);
    this.identities.set(id, publicKey);
    if (!existing) return false;
    return !bufEq(existing, publicKey);
  }

  async loadPreKey(keyId: string | number): Promise<KeyPairType | undefined> {
    return this.preKeys.get(String(keyId));
  }

  async storePreKey(keyId: number | string, keyPair: KeyPairType): Promise<void> {
    this.preKeys.set(String(keyId), keyPair);
  }

  async removePreKey(keyId: number | string): Promise<void> {
    this.preKeys.delete(String(keyId));
  }

  async storeSession(
    encodedAddress: string,
    record: SessionRecordType,
  ): Promise<void> {
    this.sessions.set(encodedAddress, record);
  }

  async loadSession(
    encodedAddress: string,
  ): Promise<SessionRecordType | undefined> {
    return this.sessions.get(encodedAddress);
  }

  async loadSignedPreKey(
    keyId: number | string,
  ): Promise<KeyPairType | undefined> {
    return this.signedPreKeys.get(String(keyId));
  }

  async storeSignedPreKey(
    keyId: number | string,
    keyPair: KeyPairType,
  ): Promise<void> {
    this.signedPreKeys.set(String(keyId), keyPair);
  }

  async removeSignedPreKey(keyId: number | string): Promise<void> {
    this.signedPreKeys.delete(String(keyId));
  }
}

function bufEq(a: ArrayBuffer, b: ArrayBuffer): boolean {
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
}
