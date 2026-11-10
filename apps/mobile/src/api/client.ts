/**
 * Synapmsg API client — central Axios instance.
 *
 * Responsibilities:
 *   • Read the JWT from AsyncStorage on every outgoing request.
 *   • Normalize the API error shape into a thrown `ApiError`.
 *   • On 401 responses, hand control to a registered "unauthorized"
 *     handler (the auth store wires itself in via `setOnUnauthorized`).
 *
 * The base URL is configured through the `EXPO_PUBLIC_API_URL` env var
 * and falls back to localhost:3000 for development.
 */

import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../types';

export const API_BASE_URL: string =
  // EXPO_PUBLIC_* vars are inlined by Metro at build time.
  (process.env.EXPO_PUBLIC_API_URL as string | undefined) ??
  'http://localhost:3000';

/**
 * WebSocket URL derived from the API base URL.
 * Replaces http(s):// with ws(s):// and appends /ws.
 */
export function buildWsUrl(token: string): string {
  const base = API_BASE_URL.replace(/^http/, 'ws');
  const sep = base.endsWith('/') ? '' : '/';
  return `${base}${sep}ws?token=${encodeURIComponent(token)}`;
}

/** Normalized API error — what every API module rejects with. */
export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;

/**
 * Register a single handler invoked whenever the API returns 401.
 * The auth store calls this so it can clear state + force navigation.
 */
export function setOnUnauthorized(handler: UnauthorizedHandler): void {
  unauthorizedHandler = handler;
}

/** In-memory token cache so request interceptors don't always await AsyncStorage. */
let cachedToken: string | null = null;

/** Public setter — auth store calls this after hydrate/login/logout. */
export function setAuthToken(token: string | null): void {
  cachedToken = token;
}

export function getAuthToken(): string | null {
  return cachedToken;
}

// ───────────────────────────────────────────────────────────
// Axios instance
// ───────────────────────────────────────────────────────────
export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15_000,
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
});

// Attach JWT to every request.
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    if (!cachedToken) {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.TOKEN);
      cachedToken = stored;
    }
    if (cachedToken) {
      config.headers.Authorization = `Bearer ${cachedToken}`;
    }
    return config;
  },
  (error: AxiosError) => Promise.reject(error),
);

// Normalize errors + surface 401s to the auth store.
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ error?: string; message?: string }>) => {
    const status = error.response?.status ?? 0;
    const payload = error.response?.data;

    const message =
      payload?.error ||
      payload?.message ||
      error.message ||
      'Network request failed';

    // Trigger the registered unauthorized handler (if any).
    const handler = unauthorizedHandler;
    if (status === 401 && handler) {
      // Defer so we don't re-enter the axios promise chain synchronously.
      // Capture into `handler` so TS can narrow across the closure boundary.
      setTimeout(() => {
        try {
          handler();
        } catch {
          /* swallow — handler must not throw into axios */
        }
      }, 0);
    }

    return Promise.reject(new ApiError(status, message, payload));
  },
);

export default apiClient;
