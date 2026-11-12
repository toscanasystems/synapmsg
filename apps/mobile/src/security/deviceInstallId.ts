/**
 * Stable id for this app installation — used to skip FIDO2 on known phones.
 */

import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

const KEY = 'synap_device_install_id_v1';

export async function getDeviceInstallId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(KEY);
  if (existing) return existing;
  const raw = await Crypto.getRandomBytesAsync(16);
  const id = `inst_${Platform.OS}_${Array.from(raw)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')}`;
  await SecureStore.setItemAsync(KEY, id);
  return id;
}

/** Test helper: force “new phone” without wiping the whole app. */
export async function rotateDeviceInstallIdForProof(): Promise<string> {
  await SecureStore.deleteItemAsync(KEY).catch(() => undefined);
  return getDeviceInstallId();
}
