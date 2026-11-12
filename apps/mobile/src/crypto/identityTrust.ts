/**
 * Explicit trust UX when a peer Signal identity key changes.
 * Never auto-accept: user must tap Confío.
 */

import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SecureSignalStore } from './signalStore';

const LOG_KEY = '@synapmsg/identity_key_changes_v1';

export class IdentityKeyChangedError extends Error {
  readonly code = 'IDENTITY_KEY_CHANGED' as const;

  constructor(
    public readonly peerUserId: string,
    public readonly newIdentityKeyB64: string,
  ) {
    super('Identity key changed');
    this.name = 'IdentityKeyChangedError';
  }
}

export type IdentityChangeLogEntry = {
  peerUserId: string;
  peerLabel: string;
  oldKeyPrefix: string | null;
  newKeyPrefix: string;
  at: string;
  trusted: boolean;
};

const promptsInFlight = new Set<string>();
/** After user taps Confío for a peer, never spam the dialog again this session
 *  (old envelopes with obsolete identities still fail quietly). */
const userTrustedPeers = new Set<string>();

function keyPrefix(b64: string | null | undefined): string | null {
  if (!b64) return null;
  return b64.slice(0, 16);
}

/** True if user already confirmed a new identity for this peer. */
export function hasUserTrustedPeer(peerUserId: string): boolean {
  return userTrustedPeers.has(peerUserId);
}

export function isIdentityKeyChangedError(
  err: unknown,
): err is IdentityKeyChangedError {
  if (err instanceof IdentityKeyChangedError) return true;
  if (
    err instanceof Error &&
    (err.message.includes('Identity key changed') ||
      err.message.includes('Unknown identity key'))
  ) {
    return true;
  }
  return false;
}

export async function loadIdentityChangeLog(): Promise<IdentityChangeLogEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as IdentityChangeLogEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function appendIdentityChangeLog(
  entry: IdentityChangeLogEntry,
): Promise<void> {
  const prev = await loadIdentityChangeLog();
  prev.unshift(entry);
  await AsyncStorage.setItem(LOG_KEY, JSON.stringify(prev.slice(0, 100)));
}

function unb64(s: string): ArrayBuffer {
  const bin = globalThis.atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/**
 * User tapped Confío: persist the new identity and drop the stale session
 * so the next encrypt/decrypt rebuilds against the new key.
 */
export async function trustPeerIdentity(
  deviceId: string,
  peerUserId: string,
  newIdentityKeyB64: string,
  peerLabel: string,
): Promise<void> {
  const store = new SecureSignalStore(deviceId);
  const old = await store.getTrustedIdentityB64(peerUserId);
  await store.saveIdentity(`${peerUserId}.1`, unb64(newIdentityKeyB64));
  await store.removeSession(`${peerUserId}.1`);
  await appendIdentityChangeLog({
    peerUserId,
    peerLabel,
    oldKeyPrefix: keyPrefix(old),
    newKeyPrefix: keyPrefix(newIdentityKeyB64) ?? '',
    at: new Date().toISOString(),
    trusted: true,
  });
  console.warn('[signal] identity trusted by user', {
    peerUserId,
    peerLabel,
    newKeyPrefix: keyPrefix(newIdentityKeyB64),
  });
}

async function recordRejected(
  peerUserId: string,
  peerLabel: string,
  newIdentityKeyB64: string,
  deviceId: string,
): Promise<void> {
  const store = new SecureSignalStore(deviceId);
  const old = await store.getTrustedIdentityB64(peerUserId);
  await appendIdentityChangeLog({
    peerUserId,
    peerLabel,
    oldKeyPrefix: keyPrefix(old),
    newKeyPrefix: keyPrefix(newIdentityKeyB64) ?? '',
    at: new Date().toISOString(),
    trusted: false,
  });
  console.warn('[signal] identity change rejected by user', {
    peerUserId,
    peerLabel,
  });
}

/**
 * Show Confío / No enviar. Never auto-accepts.
 * onTrusted runs only after the user confirms.
 */
export function promptIdentityTrust(opts: {
  peerUserId: string;
  peerLabel: string;
  newIdentityKeyB64: string;
  deviceId: string;
  onTrusted: () => void;
}): void {
  const { peerUserId, peerLabel, newIdentityKeyB64, deviceId, onTrusted } =
    opts;
  // Already confirmed this peer — old ciphertexts with obsolete keys stay locked.
  if (userTrustedPeers.has(peerUserId)) return;
  if (promptsInFlight.has(peerUserId)) return;
  promptsInFlight.add(peerUserId);

  setTimeout(() => {
    // Re-check: a parallel Confío may have completed while we waited.
    if (userTrustedPeers.has(peerUserId)) {
      promptsInFlight.delete(peerUserId);
      return;
    }
    Alert.alert(
      'Llave de seguridad',
      `La llave de seguridad de ${peerLabel} cambió. ¿Confías en este teléfono?`,
      [
        {
          text: 'No enviar',
          style: 'cancel',
          onPress: () => {
            void recordRejected(
              peerUserId,
              peerLabel,
              newIdentityKeyB64,
              deviceId,
            ).finally(() => promptsInFlight.delete(peerUserId));
          },
        },
        {
          text: 'Confío',
          onPress: () => {
            void (async () => {
              try {
                await trustPeerIdentity(
                  deviceId,
                  peerUserId,
                  newIdentityKeyB64,
                  peerLabel,
                );
                userTrustedPeers.add(peerUserId);
                onTrusted();
              } catch (err) {
                console.warn(
                  '[signal] trustPeerIdentity failed',
                  err instanceof Error ? err.message : err,
                );
                Alert.alert(
                  'Error',
                  err instanceof Error ? err.message : 'No se pudo guardar la llave',
                );
              } finally {
                promptsInFlight.delete(peerUserId);
              }
            })();
          },
        },
      ],
      { cancelable: false },
    );
  }, 320);
}
