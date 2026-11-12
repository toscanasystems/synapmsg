/**
 * Encrypted local vault — device key in OS Keystore (SecureStore);
 * payloads sealed with nacl.secretbox. Never silently demotes key material
 * to AsyncStorage without recording vault status for Ajustes.
 */

import * as SecureStore from 'expo-secure-store';
import * as ExpoCrypto from 'expo-crypto';
import nacl from 'tweetnacl';
import AsyncStorage from '@react-native-async-storage/async-storage';

const MASTER_KEY = 'synapmsg_vault_master_v1';
const INDEX_KEY = 'synapmsg_vault_index';
const STATUS_KEY = '@synapmsg/vault_status_v1';
const SECURE_OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export type VaultBackend = 'SecureStore' | 'AsyncStorage_degraded' | 'unavailable';

export type VaultStatus = {
  backend: VaultBackend;
  prngOk: boolean;
  lastError: string | null;
  lastOkAt: string | null;
  note: string;
};

let prngReady = false;
let status: VaultStatus = {
  backend: 'SecureStore',
  prngOk: false,
  lastError: null,
  lastOkAt: null,
  note: 'Sin probar aún',
};

/** Install tweetnacl PRNG (Hermes has no crypto.getRandomValues by default). */
export function ensureNaclPrng(): void {
  if (prngReady) return;
  try {
    nacl.setPRNG((x: Uint8Array, n: number) => {
      const rnd = ExpoCrypto.getRandomBytes(n);
      for (let i = 0; i < n; i++) x[i] = rnd[i]!;
    });
    // Smoke: randomBytes must not throw "no PRNG"
    void nacl.randomBytes(8);
    prngReady = true;
    status = { ...status, prngOk: true };
    console.log('[secureVault] PRNG=expo-crypto ok');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    prngReady = false;
    status = {
      ...status,
      prngOk: false,
      lastError: msg,
      note: 'PRNG falló — no se pueden generar claves nuevas',
    };
    console.warn('[secureVault] nacl.setPRNG / randomBytes failed', msg);
    void persistStatus();
    throw err instanceof Error ? err : new Error(msg);
  }
}

async function persistStatus(): Promise<void> {
  try {
    await AsyncStorage.setItem(STATUS_KEY, JSON.stringify(status));
  } catch {
    /* ignore */
  }
}

export async function getVaultStatus(): Promise<VaultStatus> {
  try {
    const raw = await AsyncStorage.getItem(STATUS_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as VaultStatus;
      status = { ...status, ...saved, prngOk: status.prngOk || saved.prngOk };
    }
  } catch {
    /* ignore */
  }
  return { ...status };
}

function markOk(backend: VaultBackend): void {
  status = {
    backend,
    prngOk: prngReady,
    lastError: null,
    lastOkAt: new Date().toISOString(),
    note:
      backend === 'SecureStore'
        ? 'Claves en almacén seguro del sistema (Keystore/Keychain)'
        : 'Degradado: no uses esto como almacenamiento seguro',
  };
  console.log('[secureVault] backend=', backend);
  void persistStatus();
}

function markFail(err: unknown, backend: VaultBackend): void {
  const msg = err instanceof Error ? err.message : String(err);
  status = {
    backend,
    prngOk: prngReady,
    lastError: msg,
    lastOkAt: status.lastOkAt,
    note:
      backend === 'AsyncStorage_degraded'
        ? 'Almacén seguro falló — token en AsyncStorage (visible en Ajustes)'
        : 'Almacén seguro no disponible',
  };
  console.warn('[secureVault] FAIL backend=', backend, 'reason=', msg);
  void persistStatus();
}

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

async function getMasterKey(): Promise<Uint8Array> {
  ensureNaclPrng();
  let raw = await SecureStore.getItemAsync(MASTER_KEY, SECURE_OPTS);
  if (!raw) {
    const key = nacl.randomBytes(nacl.secretbox.keyLength);
    raw = b64(key);
    await SecureStore.setItemAsync(MASTER_KEY, raw, SECURE_OPTS);
    return key;
  }
  return unb64(raw);
}

async function trackKey(key: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    const list: string[] = raw ? (JSON.parse(raw) as string[]) : [];
    if (!list.includes(key)) {
      list.push(key);
      await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(list));
    }
  } catch {
    /* ignore */
  }
}

export async function vaultSet(key: string, value: string): Promise<void> {
  ensureNaclPrng();
  const mk = await getMasterKey();
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const msg = new Uint8Array(
    Array.from(unescape(encodeURIComponent(value))).map((c) => c.charCodeAt(0)),
  );
  const box = nacl.secretbox(msg, nonce, mk);
  const packed = `${b64(nonce)}.${b64(box)}`;
  await SecureStore.setItemAsync(`vault_${key}`, packed, SECURE_OPTS);
  await trackKey(key);
  markOk('SecureStore');
}

export async function vaultGet(key: string): Promise<string | null> {
  const packed = await SecureStore.getItemAsync(`vault_${key}`, SECURE_OPTS);
  if (!packed) return null;
  const [nB64, cB64] = packed.split('.');
  if (!nB64 || !cB64) return null;
  try {
    ensureNaclPrng();
    const mk = await getMasterKey();
    const opened = nacl.secretbox.open(unb64(cB64), unb64(nB64), mk);
    if (!opened) return null;
    let s = '';
    for (let i = 0; i < opened.length; i++) s += String.fromCharCode(opened[i]!);
    markOk('SecureStore');
    return decodeURIComponent(escape(s));
  } catch (err) {
    markFail(err, 'unavailable');
    return null;
  }
}

export async function vaultDelete(key: string): Promise<void> {
  await SecureStore.deleteItemAsync(`vault_${key}`).catch(() => undefined);
}

export async function vaultWipeAll(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    const list: string[] = raw ? (JSON.parse(raw) as string[]) : [];
    await Promise.all(
      list.map((k) =>
        SecureStore.deleteItemAsync(`vault_${k}`).catch(() => undefined),
      ),
    );
  } catch {
    /* ignore */
  }
  await SecureStore.deleteItemAsync(MASTER_KEY).catch(() => undefined);
  await AsyncStorage.removeItem(INDEX_KEY).catch(() => undefined);
}

/**
 * Auth token: prefer Keystore vault. If SecureStore fails, fall back to
 * AsyncStorage but record degraded status (never silent).
 */
export async function setAuthSession(
  token: string,
  userJson: string,
): Promise<void> {
  try {
    await vaultSet('auth_token', token);
    await vaultSet('auth_user', userJson);
    await AsyncStorage.removeItem('@synapmsg/token').catch(() => undefined);
  } catch (err) {
    markFail(err, 'AsyncStorage_degraded');
    await AsyncStorage.setItem('@synapmsg/token', token);
  }
  await AsyncStorage.setItem('@synapmsg/user', userJson);
}

export async function getAuthSession(): Promise<{
  token: string | null;
  userJson: string | null;
}> {
  try {
    const token = await vaultGet('auth_token');
    const userJson =
      (await vaultGet('auth_user')) ||
      (await AsyncStorage.getItem('@synapmsg/user'));
    if (!token) {
      const legacy = await AsyncStorage.getItem('@synapmsg/token');
      if (legacy && userJson) {
        try {
          await setAuthSession(legacy, userJson);
        } catch {
          markFail('legacy migrate failed', 'AsyncStorage_degraded');
        }
        return { token: legacy, userJson };
      }
    }
    return { token, userJson };
  } catch (err) {
    markFail(err, 'AsyncStorage_degraded');
    const token = await AsyncStorage.getItem('@synapmsg/token');
    const userJson = await AsyncStorage.getItem('@synapmsg/user');
    return { token, userJson };
  }
}

export async function clearAuthSession(): Promise<void> {
  await vaultDelete('auth_token');
  await vaultDelete('auth_user');
  await AsyncStorage.multiRemove(['@synapmsg/token', '@synapmsg/user']).catch(
    () => undefined,
  );
}

/** Put arbitrary secret string in SecureStore (Signal identity, etc.). */
export async function securePut(key: string, value: string): Promise<void> {
  ensureNaclPrng();
  await SecureStore.setItemAsync(key, value, SECURE_OPTS);
  markOk('SecureStore');
}

export async function secureGet(key: string): Promise<string | null> {
  try {
    const v = await SecureStore.getItemAsync(key, SECURE_OPTS);
    if (v != null) markOk('SecureStore');
    return v;
  } catch (err) {
    markFail(err, 'unavailable');
    return null;
  }
}

export async function secureDel(key: string): Promise<void> {
  await SecureStore.deleteItemAsync(key).catch(() => undefined);
}

// Eager PRNG install at module load (catch without throw so import never crashes).
try {
  ensureNaclPrng();
} catch {
  /* status already recorded */
}
