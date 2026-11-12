/**
 * Synapmsg messages API client.
 *
 * Endpoints (mounted at /chats/:chatId/messages):
 *   GET  /chats/:chatId/messages?page=&limit= → { messages, pagination }
 *   POST /chats/:chatId/messages  { text }    → { message }
 *
 * Plus the current-user profile update:
 *   PATCH /users/me  { name?, preferredLanguage?, preferredTranslateMode? }
 */

import { apiClient } from './client';
import {
  BillingConfig,
  BillingPlanInfo,
  Message,
  MessagesListResponse,
  SendMessageRequest,
  SendMessageResponse,
  UpdateUserRequest,
  User,
} from '../types';

export const messagesApi = {
  async list(
    chatId: string,
    page = 1,
    limit = 50,
  ): Promise<MessagesListResponse> {
    const { data } = await apiClient.get<MessagesListResponse>(
      `/chats/${chatId}/messages`,
      { params: { page, limit } },
    );
    return data;
  },

  async send(chatId: string, payload: SendMessageRequest): Promise<Message> {
    const { data } = await apiClient.post<SendMessageResponse>(
      `/chats/${chatId}/messages`,
      payload,
    );
    return data.message;
  },

  async schedule(
    chatId: string,
    text: string,
    sendAt: string,
  ): Promise<{ id: string; sendAt: string; text: string }> {
    const { data } = await apiClient.post<{
      scheduled: { id: string; sendAt: string; text: string };
    }>(`/chats/${chatId}/messages`, { text, sendAt });
    return data.scheduled;
  },

  async edit(chatId: string, messageId: string, text: string): Promise<Message> {
    const { data } = await apiClient.patch<{ message: Message }>(
      `/chats/${chatId}/messages/${messageId}`,
      { text },
    );
    return data.message;
  },

  async remove(chatId: string, messageId: string): Promise<Message> {
    const { data } = await apiClient.delete<{ message: Message }>(
      `/chats/${chatId}/messages/${messageId}`,
    );
    return data.message;
  },

  async react(
    chatId: string,
    messageId: string,
    emoji: string,
  ): Promise<{ reactions: NonNullable<Message['reactions']> }> {
    const { data } = await apiClient.post<{
      reactions: NonNullable<Message['reactions']>;
    }>(`/chats/${chatId}/messages/${messageId}/reactions`, { emoji });
    return data;
  },

  /** Abre foto/audio de una sola vez → destruye en ambos lados. */
  async openViewOnce(
    chatId: string,
    messageId: string,
  ): Promise<{ mediaUrl: string | null; mediaType: string | null }> {
    const { data } = await apiClient.post<{
      ok: boolean;
      mediaUrl: string | null;
      mediaType: string | null;
      messageId: string;
    }>(`/chats/${chatId}/messages/${messageId}/view-once`);
    return { mediaUrl: data.mediaUrl, mediaType: data.mediaType };
  },
};

export const usersApi = {
  async updateMe(payload: UpdateUserRequest): Promise<User> {
    const { data } = await apiClient.patch<{ user: User }>(
      '/users/me',
      payload,
    );
    return data.user;
  },

  async listGlossary(): Promise<
    Array<{ id: string; source: string; target: string }>
  > {
    const { data } = await apiClient.get<{
      entries: Array<{ id: string; source: string; target: string }>;
    }>('/users/me/glossary');
    return data.entries;
  },

  async addGlossary(
    source: string,
    target: string,
  ): Promise<{ id: string; source: string; target: string }> {
    const { data } = await apiClient.post<{
      entry: { id: string; source: string; target: string };
    }>('/users/me/glossary', { source, target });
    return data.entry;
  },

  async deleteGlossary(id: string): Promise<void> {
    await apiClient.delete(`/users/me/glossary/${id}`);
  },

  async getPlan(): Promise<BillingPlanInfo> {
    const { data } = await apiClient.get<BillingPlanInfo>('/billing/plan');
    return data;
  },

  async getBillingConfig(): Promise<BillingConfig> {
    const { data } = await apiClient.get<BillingConfig>('/billing/config');
    return data;
  },

  async createCheckout(): Promise<{ url: string; sessionId: string }> {
    const { data } = await apiClient.post<{ url: string; sessionId: string }>(
      '/billing/checkout',
    );
    return data;
  },

  async confirmCheckout(
    checkoutId: string,
  ): Promise<{
    granted: boolean;
    status: string;
    user: User | null;
  }> {
    const { data } = await apiClient.post<{
      granted: boolean;
      status: string;
      user: User | null;
    }>('/billing/confirm', { checkoutId });
    return data;
  },

  async openBillingPortal(): Promise<{ url: string }> {
    const { data } = await apiClient.post<{ url: string }>('/billing/portal');
    return data;
  },

  async upgradeStub(days = 30): Promise<User> {
    const { data } = await apiClient.post<{ user: User }>(
      '/billing/upgrade-stub',
      { days },
    );
    return data.user;
  },

  async downgradeStub(): Promise<User> {
    const { data } = await apiClient.post<{ user: User }>(
      '/billing/downgrade-stub',
    );
    return data.user;
  },

  async registerE2eDevice(bundle: {
    deviceId: string;
    identityKeyPub: string;
    signedPreKeyPub: string;
    signedPreKeyId: number;
    signedPreKeySig?: string;
    registrationId: number;
    preKeys: Array<{ keyId: number; publicKey: string }>;
    pqKemPub?: string;
    protocol?: string;
  }): Promise<{ ok: boolean; note?: string }> {
    const { data } = await apiClient.put<{ ok: boolean; note?: string }>(
      `/e2e/devices/${encodeURIComponent(bundle.deviceId)}`,
      {
        identityKeyPub: bundle.identityKeyPub,
        signedPreKeyPub: bundle.signedPreKeyPub,
        signedPreKeySig: bundle.signedPreKeySig,
        signedPreKeyId: bundle.signedPreKeyId,
        registrationId: bundle.registrationId,
        preKeys: bundle.preKeys,
        pqKemPub: bundle.pqKemPub,
        protocol: bundle.protocol ?? 'libsignal',
      },
    );
    return data;
  },

  async listE2eDevices(): Promise<
    Array<{ deviceId: string; updatedAt: string; preKeyCount: number }>
  > {
    const { data } = await apiClient.get<{
      devices: Array<{
        deviceId: string;
        updatedAt: string;
        preKeyCount: number;
      }>;
    }>('/e2e/devices');
    return data.devices;
  },
};

export default messagesApi;
