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
import { ApiError, setAuthToken, setOnUnauthorized } from '../api/client';
import wsManager from '../api/websocket';
import { STORAGE_KEYS, User, LoginRequest, RegisterRequest } from '../types';

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
    try {
      const [token, userJson] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.TOKEN),
        AsyncStorage.getItem(STORAGE_KEYS.USER),
      ]);

      if (token) {
        setAuthToken(token);
        const user = userJson ? (JSON.parse(userJson) as User) : null;
        set({ token, user, isHydrated: true });

        // Best-effort refresh of the user profile (token may be stale).
        try {
          const { user: fresh } = await authApi.me();
          await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(fresh));
          set({ user: fresh });
          // Now that we have a valid token, open the WebSocket.
          wsManager.connect(token);
        } catch {
          // If /me fails (e.g. 401), the unauthorized handler will fire.
        }
      } else {
        set({ isHydrated: true });
      }
    } catch (err) {
      // Hydration should never crash the app — fail gracefully.
      set({ isHydrated: true });
    }
  },

  login: async (payload) => {
    set({ isLoading: true, error: null });
    try {
      const { token, user } = await authApi.login(payload);
      await AsyncStorage.setItem(STORAGE_KEYS.TOKEN, token);
      await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
      setAuthToken(token);
      wsManager.connect(token);
      set({ token, user, isLoading: false });
    } catch (err) {
      const message =
        err instanceof ApiError && err.status > 0
          ? err.message
          : 'Could not reach the server. Check your connection.';
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  register: async (payload) => {
    set({ isLoading: true, error: null });
    try {
      const { token, user } = await authApi.register(payload);
      await AsyncStorage.setItem(STORAGE_KEYS.TOKEN, token);
      await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
      setAuthToken(token);
      wsManager.connect(token);
      set({ token, user, isLoading: false });
    } catch (err) {
      const message =
        err instanceof ApiError && err.status > 0
          ? err.message
          : 'Could not reach the server. Check your connection.';
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  logout: async () => {
    wsManager.disconnect();
    setAuthToken(null);
    await AsyncStorage.multiRemove([STORAGE_KEYS.TOKEN, STORAGE_KEYS.USER]);
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
