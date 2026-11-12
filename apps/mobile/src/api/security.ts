import { apiClient } from './client';

export const securityApi = {
  async wipe(opts?: {
    reason?: string;
    issuerDeviceId?: string;
  }): Promise<{
    ok: boolean;
    otherDevicesRemoved?: number;
    issuerDeviceId?: string | null;
  }> {
    const { data } = await apiClient.post<{
      ok: boolean;
      otherDevicesRemoved?: number;
      issuerDeviceId?: string | null;
    }>('/security/wipe', {
      reason: opts?.reason ?? 'user_requested',
      issuerDeviceId: opts?.issuerDeviceId,
    });
    return data;
  },


  async generateRecoveryCodes(): Promise<string[]> {
    const { data } = await apiClient.post<{ codes: string[] }>(
      '/security/recovery-codes',
    );
    return data.codes;
  },

  async publishKtl(): Promise<{ seq: number; hash: string }> {
    const { data } = await apiClient.post<{
      entry: { seq: number; hash: string };
    }>('/security/ktl/publish');
    return data.entry;
  },

  async getKtl(userId: string): Promise<
    Array<{ seq: number; identityKeyPub: string; hash: string; at: string }>
  > {
    const { data } = await apiClient.get<{
      entries: Array<{
        seq: number;
        identityKeyPub: string;
        hash: string;
        at: string;
      }>;
    }>(`/security/ktl/${userId}`);
    return data.entries;
  },

  /** Unauthenticated public audit log (same entries, KTL-style). */
  async getKtlPublic(userId: string): Promise<
    Array<{ seq: number; identityKeyPub: string; hash: string; at: string }>
  > {
    const { data } = await apiClient.get<{
      entries: Array<{
        seq: number;
        identityKeyPub: string;
        hash: string;
        at: string;
      }>;
    }>(`/security/ktl/public/${userId}`);
    return data.entries;
  },

  async getDms(): Promise<{
    enabled: boolean;
    idleDays: number;
    action: string;
  }> {
    const { data } = await apiClient.get<{
      dms: { enabled: boolean; idleDays: number; action: string };
    }>('/security/dms');
    return data.dms;
  },

  async setDms(dms: {
    enabled: boolean;
    idleDays: number;
    action: string;
  }): Promise<void> {
    await apiClient.put('/security/dms', dms);
  },

  async webauthnRegisterOptions(): Promise<Record<string, unknown>> {
    const { data } = await apiClient.post<Record<string, unknown>>(
      '/security/webauthn/register/options',
    );
    return data;
  },

  async webauthnRegisterVerify(
    attestation: Record<string, unknown>,
    label?: string,
  ): Promise<void> {
    await apiClient.post('/security/webauthn/register/verify', {
      ...attestation,
      label,
    });
  },

  async listWebauthn(): Promise<Array<{ id: string; label: string }>> {
    const { data } = await apiClient.get<{
      credentials: Array<{ id: string; label: string }>;
    }>('/security/webauthn/credentials');
    return data.credentials;
  },

  async status(): Promise<Record<string, unknown>> {
    const { data } = await apiClient.get<Record<string, unknown>>(
      '/security/status',
    );
    return data;
  },

  async ensureDecoy(): Promise<{ decoyUserId: string; ready: boolean }> {
    const { data } = await apiClient.post<{
      decoyUserId: string;
      ready: boolean;
    }>('/security/decoy/ensure');
    return data;
  },

  async decoyStatus(): Promise<boolean> {
    const { data } = await apiClient.get<{ configured: boolean }>(
      '/security/decoy/status',
    );
    return data.configured;
  },

  async enterDecoy(): Promise<{
    token: string;
    user: import('../types').User;
  }> {
    const { data } = await apiClient.post<{
      token: string;
      user: import('../types').User;
      decoy: boolean;
    }>('/security/decoy/enter');
    return { token: data.token, user: data.user };
  },
};

export default securityApi;
