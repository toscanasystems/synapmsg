/**
 * App lock — PIN en SecureStore + biometría + PIN de coacción (duress).
 */

import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { argon2id } from '@noble/hashes/argon2';
import { wipeLocalSecrets } from '../security/localWipe';
import securityApi from '../api/security';

const PIN_KEY = 'synapmsg_app_pin_hash';
const DURESS_KEY = 'synapmsg_duress_pin_hash';
const ENABLED_KEY = '@synapmsg/app_lock_enabled';
const BIO_KEY = '@synapmsg/app_lock_bio';
const PIN_SALT = 'synapmsg-pin-v3-argon2id';

/** Argon2id (RFC 9106) — t=2, m=19MiB, p=1. Prefix v3 for migration. */
function hashPin(pin: string): string {
  const out = argon2id(pin, PIN_SALT, { t: 2, m: 19 * 1024, p: 1, dkLen: 32 });
  let s = 'v3:';
  for (let i = 0; i < out.length; i++) s += out[i]!.toString(16).padStart(2, '0');
  return s;
}

export type PendingDecoySession = {
  token: string;
  user: import('../types').User;
};

type AppLockState = {
  hydrated: boolean;
  enabled: boolean;
  bioEnabled: boolean;
  unlocked: boolean;
  duressTriggered: boolean;
  pendingDecoy: PendingDecoySession | null;
  hydrate: () => Promise<void>;
  setEnabled: (enabled: boolean, pin?: string) => Promise<void>;
  setDuressPin: (pin: string) => Promise<void>;
  setBioEnabled: (enabled: boolean) => Promise<void>;
  unlockWithPin: (pin: string) => Promise<'ok' | 'bad' | 'duress'>;
  /** Verify normal PIN only (no duress side-effects) — for hidden chats folder. */
  verifyNormalPin: (pin: string) => Promise<boolean>;
  unlockWithBiometrics: () => Promise<boolean>;
  lock: () => void;
  hasHardwareBiometrics: () => Promise<boolean>;
  clearDuressFlag: () => void;
  takePendingDecoy: () => PendingDecoySession | null;
};

export const useAppLockStore = create<AppLockState>((set, get) => ({
  hydrated: false,
  enabled: false,
  bioEnabled: false,
  unlocked: true,
  duressTriggered: false,
  pendingDecoy: null,

  hydrate: async () => {
    try {
      // QA-only escape hatch — never default-on in release builds.
      if (process.env.EXPO_PUBLIC_QA_DISABLE_LOCK === '1') {
        await AsyncStorage.setItem(ENABLED_KEY, '0');
        await AsyncStorage.setItem(BIO_KEY, '0');
        await SecureStore.deleteItemAsync(PIN_KEY).catch(() => undefined);
        await SecureStore.deleteItemAsync(DURESS_KEY).catch(() => undefined);
        set({
          enabled: false,
          bioEnabled: false,
          unlocked: true,
          hydrated: true,
          duressTriggered: false,
          pendingDecoy: null,
        });
        return;
      }

      const enabledFlag = (await AsyncStorage.getItem(ENABLED_KEY)) === '1';
      const bioEnabled = (await AsyncStorage.getItem(BIO_KEY)) === '1';
      const pinHash = await SecureStore.getItemAsync(PIN_KEY);
      const enabled = enabledFlag && Boolean(pinHash);
      set({
        enabled,
        bioEnabled: enabled && bioEnabled,
        unlocked: !enabled,
        hydrated: true,
        duressTriggered: false,
        pendingDecoy: null,
      });
    } catch {
      set({ hydrated: true, unlocked: true, enabled: false });
    }
  },

  setEnabled: async (enabled, pin) => {
    if (enabled) {
      if (!pin || pin.length < 4) {
        throw new Error('El PIN debe tener al menos 4 dígitos');
      }
      const hashed = hashPin(pin);
      await SecureStore.setItemAsync(PIN_KEY, hashed);
      await AsyncStorage.setItem(ENABLED_KEY, '1');
      set({ enabled: true, unlocked: true });
      return;
    }
    await SecureStore.deleteItemAsync(PIN_KEY).catch(() => undefined);
    await SecureStore.deleteItemAsync(DURESS_KEY).catch(() => undefined);
    await AsyncStorage.setItem(ENABLED_KEY, '0');
    await AsyncStorage.setItem(BIO_KEY, '0');
    set({ enabled: false, bioEnabled: false, unlocked: true });
  },

  setDuressPin: async (pin) => {
    if (!pin || pin.length < 4) {
      throw new Error('El PIN de coacción debe tener al menos 4 dígitos');
    }
    const normal = await SecureStore.getItemAsync(PIN_KEY);
    const hashed = hashPin(pin);
    if (normal && hashed === normal) {
      throw new Error('El PIN de coacción debe ser distinto del PIN normal');
    }
    await SecureStore.setItemAsync(DURESS_KEY, hashed);
  },

  setBioEnabled: async (enabled) => {
    await AsyncStorage.setItem(BIO_KEY, enabled ? '1' : '0');
    set({ bioEnabled: enabled });
  },

  unlockWithPin: async (pin) => {
    const stored = await SecureStore.getItemAsync(PIN_KEY);
    if (!stored) {
      set({ unlocked: true, enabled: false });
      return 'ok';
    }
    const hashed = hashPin(pin);
    const duress = await SecureStore.getItemAsync(DURESS_KEY);
    if (duress && hashed === duress) {
      // Enter decoy WHILE primary session is still authenticated, then wipe.
      let pendingDecoy: PendingDecoySession | null = null;
      try {
        await securityApi.ensureDecoy();
        pendingDecoy = await securityApi.enterDecoy();
      } catch {
        pendingDecoy = null;
      }
      await wipeLocalSecrets();
      set({
        unlocked: true,
        enabled: false,
        bioEnabled: false,
        duressTriggered: true,
        pendingDecoy,
      });
      return 'duress';
    }
    if (hashed !== stored) return 'bad';
    set({ unlocked: true });
    return 'ok';
  },

  verifyNormalPin: async (pin) => {
    const stored = await SecureStore.getItemAsync(PIN_KEY);
    if (!stored) return false;
    return hashPin(pin) === stored;
  },

  unlockWithBiometrics: async () => {
    if (!get().bioEnabled) return false;
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Desbloquear Synap',
        cancelLabel: 'Usar PIN',
        disableDeviceFallback: false,
      });
      if (result.success) {
        set({ unlocked: true });
        return true;
      }
    } catch {
      /* ignore */
    }
    return false;
  },

  lock: () => {
    if (get().enabled) set({ unlocked: false });
  },

  clearDuressFlag: () => set({ duressTriggered: false }),

  takePendingDecoy: () => {
    const pending = get().pendingDecoy;
    set({ pendingDecoy: null });
    return pending;
  },

  hasHardwareBiometrics: async () => {
    try {
      const has = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      return has && enrolled;
    } catch {
      return false;
    }
  },
}));
