/**
 * Local vault wipe — used by remote wipe command and duress PIN.
 */

import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocalDeviceId } from '../crypto/e2eKeys';
import { clearPeerCache } from '../crypto/peerCache';
import { clearAuthSession, vaultWipeAll } from './secureVault';
import { sqlWipeAll } from './sqlcipherStore';

const PRIV_PREFIX = 'synapmsg_e2e_priv_';
const DEVICE_ID_KEY = 'synapmsg_e2e_device_id';
const PIN_KEY = 'synapmsg_app_pin_hash';
const DURESS_KEY = 'synapmsg_duress_pin_hash';
const SESSION_PREFIX = 'synapmsg_dr_';
const PEER_INDEX = 'synapmsg_dr_peer_index';

export async function wipeLocalSecrets(): Promise<void> {
  clearPeerCache();
  const deviceId = await getLocalDeviceId();
  if (deviceId) {
    await SecureStore.deleteItemAsync(`${PRIV_PREFIX}${deviceId}`).catch(
      () => undefined,
    );
  }
  await SecureStore.deleteItemAsync(DEVICE_ID_KEY).catch(() => undefined);
  await SecureStore.deleteItemAsync(PIN_KEY).catch(() => undefined);
  await SecureStore.deleteItemAsync(DURESS_KEY).catch(() => undefined);

  try {
    const raw = await AsyncStorage.getItem(PEER_INDEX);
    const peers: string[] = raw ? (JSON.parse(raw) as string[]) : [];
    await Promise.all(
      peers.map((p) =>
        SecureStore.deleteItemAsync(`${SESSION_PREFIX}${p}`).catch(
          () => undefined,
        ),
      ),
    );
    await AsyncStorage.removeItem(PEER_INDEX).catch(() => undefined);
  } catch {
    /* ignore */
  }

  await vaultWipeAll();
  await sqlWipeAll().catch(() => undefined);
  await clearAuthSession();
  await AsyncStorage.multiRemove([
    '@synapmsg/token',
    '@synapmsg/user',
    '@synapmsg/app_lock_enabled',
    '@synapmsg/app_lock_bio',
    '@synapmsg/hidden_chats_v1',
  ]).catch(() => undefined);
}
