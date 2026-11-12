/**
 * Synapmsg auth API client.
 *
 * Endpoints (mounted at /auth):
 *   POST /auth/register  → { token, user }
 *   POST /auth/login     → { token, user }
 *   GET  /auth/me        → { user }
 */

import { apiClient } from './client';
import {
  AuthResponse,
  LoginRequest,
  MeResponse,
  RegisterRequest,
} from '../types';

export type LoginResult =
  | AuthResponse
  | {
      requiresWebAuthn: true;
      loginTicket: string;
      userId: string;
      hasRecoveryCodes: boolean;
    };

export const authApi = {
  async login(payload: LoginRequest): Promise<LoginResult> {
    const { data } = await apiClient.post<LoginResult>('/auth/login', payload);
    return data;
  },

  async loginWithRecovery(
    loginTicket: string,
    code: string,
  ): Promise<AuthResponse> {
    const { data } = await apiClient.post<AuthResponse>('/auth/login/recovery', {
      loginTicket,
      code,
    });
    return data;
  },

  async register(payload: RegisterRequest): Promise<AuthResponse> {
    const { data } = await apiClient.post<AuthResponse>(
      '/auth/register',
      payload,
    );
    return data;
  },

  async me(): Promise<MeResponse> {
    const { data } = await apiClient.get<MeResponse>('/auth/me');
    return data;
  },
};

export default authApi;
