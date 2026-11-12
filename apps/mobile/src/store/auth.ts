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
import authApi from '../api/auth';
import { mapAuthError } from '../api/authErrors';
import { setAuthToken, setOnUnauthorized } from '../api/client';
import wsManager from '../api/websocket';
import { User, LoginRequest, RegisterRequest } from '../types';
import {
  clearAuthSession,
  getAuthSession,
  setAuthSession,
} from '../security/secureVault';

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isHydrated: boolean;
  error: string | null;

  // Actions
  hydrate: () => Promise<void>;
  login: (payload: LoginRequest) => Promise<void>;
  register: (payload: RegisterRequest) => Promise<void>;
  completeRecoveryLogin: (loginTicket: string, code: string) => Promise<void>;
  adoptSession: (token: string, user: User) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  setUser: (user: User) => void;
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

      if (token) {
        setAuthToken(token);
        const user = userJson ? (JSON.parse(userJson) as User) : null;
        set({ token, user, isHydrated: true });

        // Best-effort refresh of the user profile (token may be stale).
        try {
          const { user: fresh } = await authApi.me();
          await setAuthSession(token, JSON.stringify(fresh));
          set({ user: fresh });
          wsManager.connect(token);
          return;
        } catch {
          // Dead/stale token → clear and auto-login so the user is never stuck.
          setAuthToken(null);
          await clearAuthSession();
          set({ token: null, user: null });
          await tryAutoLogin();
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
      const result = await authApi.login(payload);
      // Never block the owner with FIDO2 gate in the app.
      if ('requiresWebAuthn' in result && result.requiresWebAuthn) {
        set({
          isLoading: false,
          error:
            'Login 2FA desactivado en servidor. Pedile a soporte LOGIN_SKIP_FIDO2=1 o usá otra cuenta.',
        });
        throw new Error('FIDO2_BLOCKED');
      }
      const { token, user } = result as {
        token: string;
        user: import('../types').User;
      };
      // Set session in memory first so UI enters even if vault write fails.
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
      if (err instanceof Error && err.message === 'FIDO2_BLOCKED') {
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
      const { token, user } = await authApi.loginWithRecovery(loginTicket, code);
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
      const { token, user } = await authApi.register(payload);
      // Persist + set auth state BEFORE opening the socket so the UI
      // can switch to the authenticated stack immediately.
      await setAuthSession(token, JSON.stringify(user));
      setAuthToken(token);
      set({ token, user, isLoading: false, error: null });
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
