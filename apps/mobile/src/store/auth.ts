/**
 * Synapmsg auth store (Zustand).
 *
 * Responsibilities:
 *   • Hydrate token + user from AsyncStorage on app start.
 *   • login() / register() — call API, persist token, set user.
 *   • logout() — clear AsyncStorage, reset state, disconnect WebSocket.
 *   • Wire the API client's "unauthorized" hook so 401s auto-logout.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import * as WebBrowser from 'expo-web-browser';
import authApi from '../api/auth';
import { mapAuthError } from '../api/authErrors';
import { setAuthToken, setOnUnauthorized, API_BASE_URL } from '../api/client';
import wsManager from '../api/websocket';
import {
  User,
  LoginRequest,
  RegisterRequest,
  STORAGE_KEYS,
} from '../types';
import {
  clearAuthSession,
  getAuthSession,
  setAuthSession,
} from '../security/secureVault';
import { getDeviceInstallId } from '../security/deviceInstallId';

WebBrowser.maybeCompleteAuthSession();

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isHydrated: boolean;
  error: string | null;
  /** Session kept locally but /auth/me failed due to network. */
  sessionOffline: boolean;
  /** One-time recovery passphrase waiting for "Ya lo apunté". */
  pendingRecoveryCode: string | null;

  // Actions
  hydrate: () => Promise<void>;
  login: (payload: LoginRequest) => Promise<void>;
  register: (payload: RegisterRequest) => Promise<void>;
  bootstrap: (preferredLanguage?: string) => Promise<void>;
  recoverWithCode: (code: string) => Promise<void>;
  completeRecoveryLogin: (loginTicket: string, code: string) => Promise<void>;
  adoptSession: (token: string, user: User) => Promise<void>;
  retrySession: () => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  setUser: (user: User) => void;
  clearPendingRecoveryCode: () => Promise<void>;
  setPendingRecoveryCode: (recoveryCode: string) => Promise<void>;
}

// Register the 401 handler ONCE at module load time. Zustand store
// already exposes `getState`, so the handler can lazily call `logout()`.
// We delay the registration until the store is created below.
let storeCreated = false;

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isLoading: false,
  isHydrated: false,
  error: null,
  sessionOffline: false,
  pendingRecoveryCode: null,

  hydrate: async () => {
    // Auto-login OFF by default (release). Opt-in: EXPO_PUBLIC_AUTO_LOGIN=1.
    const autoLoginEnabled =
      String(process.env.EXPO_PUBLIC_AUTO_LOGIN ?? '0').replace(/['"]/g, '') ===
      '1';

    const tryAutoLogin = async () => {
      if (!autoLoginEnabled) return;
      set({ isLoading: true, error: null });
      try {
        // Credentials only via env — never bake secrets into release APK.
        const autoEmail = String(
          process.env.EXPO_PUBLIC_AUTO_EMAIL ?? '',
        ).replace(/['"]/g, '');
        const autoPassword = String(
          process.env.EXPO_PUBLIC_AUTO_PASSWORD ?? '',
        ).replace(/['"]/g, '');
        if (!autoEmail || !autoPassword) return;
        await get().login({ email: autoEmail, password: autoPassword });
      } catch {
        /* Fall through to Login */
      } finally {
        set({ isLoading: false, isHydrated: true });
      }
    };

    try {
      const { token, userJson } = await getAuthSession();
      let pendingRecoveryCode: string | null = null;
      try {
        pendingRecoveryCode = await AsyncStorage.getItem(
          STORAGE_KEYS.PENDING_RECOVERY_CODE,
        );
      } catch {
        pendingRecoveryCode = null;
      }

      if (token) {
        setAuthToken(token);
        const user = userJson ? (JSON.parse(userJson) as User) : null;
        set({
          token,
          user,
          isHydrated: true,
          pendingRecoveryCode,
          sessionOffline: false,
        });

        // Best-effort refresh of the user profile (token may be stale).
        try {
          const { user: fresh } = await authApi.me();
          await setAuthSession(token, JSON.stringify(fresh));
          set({ user: fresh, sessionOffline: false });
          wsManager.connect(token);
          return;
        } catch (err) {
          // Network blip → keep local session so the user is not kicked to Bootstrap.
          const status =
            err && typeof err === 'object' && 'status' in err
              ? Number((err as { status?: number }).status)
              : undefined;
          const msg = String(
            err && typeof err === 'object' && 'message' in err
              ? (err as { message?: string }).message
              : err ?? '',
          ).toLowerCase();
          const isNetwork =
            status === 0 ||
            /network|timeout|econnaborted|network request failed/.test(msg);
          if (isNetwork) {
            set({ sessionOffline: true });
            try {
              wsManager.connect(token);
            } catch {
              /* best-effort */
            }
            return;
          }
          // Real auth rejection (401/403) → clear and fall through.
          if (status === 401 || status === 403) {
            setAuthToken(null);
            await clearAuthSession();
            set({ token: null, user: null, sessionOffline: false });
            await tryAutoLogin();
            return;
          }
          // Unknown error: keep session offline rather than wipe the account.
          set({ sessionOffline: true });
          return;
        }
      }

      if (autoLoginEnabled) {
        set({ isHydrated: true });
        await tryAutoLogin();
        return;
      }

      set({ isHydrated: true });
    } catch {
      // Hydration should never crash the app — fail gracefully.
      set({ isHydrated: true });
      await tryAutoLogin();
    }
  },

  login: async (payload) => {
    set({ isLoading: true, error: null });
    try {
      const deviceInstallId = await getDeviceInstallId();
      const result = await authApi.login({ ...payload, deviceInstallId });
      if ('requiresWebAuthn' in result && result.requiresWebAuthn) {
        // New installation + enrolled key → browser WebAuthn, then deep link back.
        const url =
          `${API_BASE_URL}/security/login-fido2.html` +
          `?ticket=${encodeURIComponent(result.loginTicket)}` +
          `&device=${encodeURIComponent(deviceInstallId)}`;
        set({
          isLoading: false,
          error:
            'Este teléfono es nuevo: confirmá con tu llave física (FIDO2).',
        });
        const browser = await WebBrowser.openAuthSessionAsync(
          url,
          'synapmsg://auth/fido2',
        );
        if (browser.type === 'success' && browser.url) {
          const q = browser.url.includes('?')
            ? browser.url.slice(browser.url.indexOf('?') + 1)
            : '';
          const params = new URLSearchParams(q);
          const token = params.get('token');
          const userRaw = params.get('user');
          if (token && userRaw) {
            const user = JSON.parse(decodeURIComponent(userRaw)) as User;
            await get().adoptSession(token, user);
            return;
          }
        }
        throw new Error('FIDO2_REQUIRED');
      }
      const { token, user } = result as {
        token: string;
        user: import('../types').User;
      };
      setAuthToken(token);
      set({ token, user, isLoading: false, error: null });
      try {
        await setAuthSession(token, JSON.stringify(user));
      } catch {
        /* persist best-effort */
      }
      try {
        wsManager.connect(token);
      } catch {
        /* WS is best-effort; auth already succeeded */
      }
    } catch (err) {
      if (err instanceof Error && err.message === 'FIDO2_REQUIRED') {
        set({
          isLoading: false,
          error: 'Sin llave física no se puede entrar en este teléfono nuevo.',
        });
        throw err;
      }
      const message = mapAuthError(err);
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  completeRecoveryLogin: async (loginTicket: string, code: string) => {
    set({ isLoading: true, error: null });
    try {
      const deviceInstallId = await getDeviceInstallId();
      const { token, user } = await authApi.loginWithRecovery(
        loginTicket,
        code,
        deviceInstallId,
      );
      await setAuthSession(token, JSON.stringify(user));
      setAuthToken(token);
      set({ token, user, isLoading: false, error: null });
      try {
        wsManager.connect(token);
      } catch {
        /* ignore */
      }
    } catch (err) {
      const message = mapAuthError(err);
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  register: async (payload) => {
    set({ isLoading: true, error: null });
    try {
      const { token, user, recoveryCode } = await authApi.register(payload);
      // Persist + set auth state BEFORE opening the socket so the UI
      // can switch to the authenticated stack immediately.
      await setAuthSession(token, JSON.stringify(user));
      setAuthToken(token);
      if (recoveryCode) {
        await AsyncStorage.setItem(
          STORAGE_KEYS.PENDING_RECOVERY_CODE,
          recoveryCode,
        );
      }
      set({
        token,
        user,
        isLoading: false,
        error: null,
        pendingRecoveryCode: recoveryCode ?? null,
      });
      try {
        wsManager.connect(token);
      } catch {
        /* WS is best-effort; auth already succeeded */
      }
    } catch (err) {
      const message = mapAuthError(err);
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  bootstrap: async (preferredLanguage = 'es') => {
    set({ isLoading: true, error: null });
    try {
      const { token, user, recoveryCode } = await authApi.bootstrap(
        preferredLanguage,
      );
      setAuthToken(token);
      if (recoveryCode) {
        await AsyncStorage.setItem(
          STORAGE_KEYS.PENDING_RECOVERY_CODE,
          recoveryCode,
        );
      }
      set({
        token,
        user,
        isLoading: false,
        error: null,
        sessionOffline: false,
        pendingRecoveryCode: recoveryCode ?? null,
      });
      try {
        await setAuthSession(token, JSON.stringify(user));
      } catch {
        /* persist best-effort */
      }
      try {
        wsManager.connect(token);
      } catch {
        /* WS is best-effort */
      }
    } catch (err) {
      const message = mapAuthError(err);
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  recoverWithCode: async (code: string) => {
    set({ isLoading: true, error: null });
    try {
      const { token, user } = await authApi.recover(code);
      // Prior phone / prior account Signal material must not ride into the
      // recovered session (server already wiped device pubs on recover).
      try {
        const { wipeSignalLocalSecrets } = await import(
          '../crypto/signalSession'
        );
        await wipeSignalLocalSecrets();
      } catch {
        /* best-effort */
      }
      await setAuthSession(token, JSON.stringify(user));
      setAuthToken(token);
      set({
        token,
        user,
        isLoading: false,
        error: null,
        sessionOffline: false,
        pendingRecoveryCode: null,
      });
      try {
        wsManager.connect(token);
      } catch {
        /* best-effort */
      }
      // Re-publish a fresh Signal bundle so Privado chats can send again.
      try {
        const { ensureSignalBundle } = await import('../crypto/signalSession');
        const { usersApi } = await import('../api/messages');
        const bundle = await ensureSignalBundle();
        await usersApi.registerE2eDevice({
          deviceId: bundle.deviceId,
          identityKeyPub: bundle.identityKeyPub,
          signedPreKeyPub: bundle.signedPreKeyPub,
          signedPreKeyId: bundle.signedPreKeyId,
          signedPreKeySig: bundle.signedPreKeySig,
          registrationId: bundle.registrationId,
          preKeys: bundle.preKeys,
          protocol: bundle.protocol,
        });
      } catch {
        /* user can re-register from Ajustes */
      }
    } catch (err) {
      const message = mapAuthError(err);
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  retrySession: async () => {
    const { token } = get();
    if (!token) return;
    set({ isLoading: true, error: null });
    try {
      setAuthToken(token);
      const { user: fresh } = await authApi.me();
      await setAuthSession(token, JSON.stringify(fresh));
      set({ user: fresh, sessionOffline: false, isLoading: false });
      wsManager.connect(token);
    } catch (err) {
      const status =
        err && typeof err === 'object' && 'status' in err
          ? Number((err as { status?: number }).status)
          : undefined;
      if (status === 401 || status === 403) {
        setAuthToken(null);
        await clearAuthSession();
        set({
          token: null,
          user: null,
          sessionOffline: false,
          isLoading: false,
        });
        return;
      }
      set({ sessionOffline: true, isLoading: false });
    }
  },

  clearPendingRecoveryCode: async () => {
    await AsyncStorage.removeItem(STORAGE_KEYS.PENDING_RECOVERY_CODE);
    set({ pendingRecoveryCode: null });
  },

  setPendingRecoveryCode: async (recoveryCode: string) => {
    await AsyncStorage.setItem(
      STORAGE_KEYS.PENDING_RECOVERY_CODE,
      recoveryCode,
    );
    set({ pendingRecoveryCode: recoveryCode });
  },

  adoptSession: async (token, user) => {
    await setAuthSession(token, JSON.stringify(user));
    setAuthToken(token);
    set({ token, user, isLoading: false, error: null });
    try {
      wsManager.connect(token);
    } catch {
      /* ignore */
    }
  },

  logout: async () => {
    wsManager.disconnect();
    setAuthToken(null);
    await clearAuthSession();
    set({ token: null, user: null, error: null });
  },

  clearError: () => set({ error: null }),
  setUser: (user) => set({ user }),
}));

// Wire the 401 handler now that the store exists.
if (!storeCreated) {
  storeCreated = true;
  setOnUnauthorized(() => {
    // Only logout if we currently hold a token (otherwise it's just an
    // unauthenticated call landing 401, e.g. wrong password).
    const { token, logout } = useAuthStore.getState();
    if (token) {
      void logout();
    }
  });
}

export default useAuthStore;
