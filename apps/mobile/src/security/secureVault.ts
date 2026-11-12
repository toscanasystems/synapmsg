/**
 * Encrypted local vault — SQLCipher-class threat model without native SQLCipher.
 * Device key lives in OS Keystore via SecureStore; payloads sealed with nacl.secretbox.
 */

import * as SecureStore from 'expo-secure-store';
import nacl from 'tweetnacl';
import AsyncStorage from '@react-native-async-storage/async-storage';

const MASTER_KEY = 'synapmsg_vault_master_v1';
const INDEX_KEY = 'synapmsg_vault_index';
const SECURE_OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

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
  const mk = await getMasterKey();
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const msg = new Uint8Array(
    Array.from(unescape(encodeURIComponent(value))).map((c) => c.charCodeAt(0)),
  );
  const box = nacl.secretbox(msg, nonce, mk);
  const packed = `${b64(nonce)}.${b64(box)}`;
  await SecureStore.setItemAsync(`vault_${key}`, packed, SECURE_OPTS);
  await trackKey(key);
}

export async function vaultGet(key: string): Promise<string | null> {
  const packed = await SecureStore.getItemAsync(`vault_${key}`, SECURE_OPTS);
  if (!packed) return null;
  const [nB64, cB64] = packed.split('.');
  if (!nB64 || !cB64) return null;
  try {
    const mk = await getMasterKey();
    const opened = nacl.secretbox.open(unb64(cB64), unb64(nB64), mk);
    if (!opened) return null;
    let s = '';
    for (let i = 0; i < opened.length; i++) s += String.fromCharCode(opened[i]!);
    return decodeURIComponent(escape(s));
  } catch {
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

/** Auth token: Keystore-backed, with AsyncStorage fallback if SecureStore fails. */
export async function setAuthSession(
  token: string,
  userJson: string,
): Promise<void> {
  try {
    await vaultSet('auth_token', token);
    await vaultSet('auth_user', userJson);
  } catch (err) {
    // Some Android builds reject large SecureStore writes — never block login.
    // eslint-disable-next-line no-console
    console.warn('[secureVault] vaultSet failed, using AsyncStorage', err);
    await AsyncStorage.setItem('@synapmsg/token', token);
  }
  await AsyncStorage.setItem('@synapmsg/user', userJson);
}

export async function getAuthSession(): Promise<{
  token: string | null;
  userJson: string | null;
}> {
  const token = await vaultGet('auth_token');
  const userJson =
    (await vaultGet('auth_user')) ||
    (await AsyncStorage.getItem('@synapmsg/user'));
  // Migrate legacy plaintext token once.
  if (!token) {
    const legacy = await AsyncStorage.getItem('@synapmsg/token');
    if (legacy && userJson) {
      await setAuthSession(legacy, userJson);
      return { token: legacy, userJson };
    }
  }
  return { token, userJson };
}

export async function clearAuthSession(): Promise<void> {
  await vaultDelete('auth_token');
  await vaultDelete('auth_user');
  await AsyncStorage.multiRemove(['@synapmsg/token', '@synapmsg/user']).catch(
    () => undefined,
  );
}
