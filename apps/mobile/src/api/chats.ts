/**
 * Synapmsg chats API client.
 *
 * Endpoints (mounted at /chats):
 *   GET   /chats                  → { chats: Chat[] }
 *   POST  /chats  (participantId) → { chat: Chat }
 *   GET   /chats/:id              → { chat, participants }
 *
 * Plus user-search (mounted at /users):
 *   GET /users/search?q=          → { users: User[] }
 */

import { apiClient } from './client';
import {
  Chat,
  ChatDetailResponse,
  ChatsListResponse,
  CreateChatRequest,
  CreateChatResponse,
  SearchUsersResponse,
  User,
} from '../types';

export const chatsApi = {
  async list(): Promise<Chat[]> {
    const { data } = await apiClient.get<ChatsListResponse>('/chats');
    return data.chats;
  },

  async createOrReuse(payload: CreateChatRequest): Promise<Chat> {
    const { data } = await apiClient.post<CreateChatResponse>(
      '/chats',
      payload,
    );
    return data.chat;
  },

  async createGroup(name: string, participantIds: string[]): Promise<Chat> {
    const { data } = await apiClient.post<CreateChatResponse>('/chats/group', {
      name,
      participantIds,
    });
    return data.chat;
  },

  async addMembers(chatId: string, participantIds: string[]): Promise<Chat> {
    const { data } = await apiClient.post<CreateChatResponse>(
      `/chats/${chatId}/members`,
      { participantIds },
    );
    return data.chat;
  },

  async leaveGroup(chatId: string): Promise<void> {
    await apiClient.post(`/chats/${chatId}/leave`);
  },

  async markRead(chatId: string): Promise<void> {
    await apiClient.post(`/chats/${chatId}/read`);
  },

  /** Vaciar chat for this user only (server-side clearedAt). */
  async clear(chatId: string): Promise<{ clearedAt: string }> {
    const { data } = await apiClient.post<{ ok: boolean; clearedAt: string }>(
      `/chats/${chatId}/clear`,
    );
    return { clearedAt: data.clearedAt };
  },

  async setEncryptionMode(
    chatId: string,
    mode: 'cloud' | 'e2e',
  ): Promise<{ encryptionMode: 'cloud' | 'e2e' }> {
    const { data } = await apiClient.patch<{
      chatId: string;
      encryptionMode: 'cloud' | 'e2e';
    }>(`/e2e/chats/${chatId}/mode`, { mode });
    return { encryptionMode: data.encryptionMode };
  },

  async fetchPeerBundle(userId: string): Promise<{
    userId: string;
    deviceId: string;
    identityKey: string;
    protocol?: string;
    pqHybrid?: boolean;
    keyChanged?: boolean;
  }> {
    const { data } = await apiClient.get<{
      userId: string;
      deviceId: string;
      identityKey: string;
      protocol?: string;
      pqHybrid?: boolean;
      keyChanged?: boolean;
    }>(`/e2e/users/${userId}/bundle`);
    return data;
  },

  async detail(chatId: string): Promise<ChatDetailResponse> {
    const { data } = await apiClient.get<ChatDetailResponse>(
      `/chats/${chatId}`,
    );
    return data;
  },

  /** Autodestrucción bilateral (emisor + receptor). */
  async setDisappear(
    chatId: string,
    payload: {
      hours: 0 | 1 | 6 | 12 | 24;
      text?: boolean;
      image?: boolean;
      audio?: boolean;
    },
  ): Promise<{
    disappearHours: number;
    disappearText: boolean;
    disappearImage: boolean;
    disappearAudio: boolean;
  }> {
    const { data } = await apiClient.patch<{
      disappearHours: number;
      disappearText: boolean;
      disappearImage: boolean;
      disappearAudio: boolean;
    }>(`/chats/${chatId}/disappear`, payload);
    return data;
  },

  /** Search for users by username/email/name (excludes self server-side). */
  async searchUsers(query: string): Promise<User[]> {
    const { data } = await apiClient.get<SearchUsersResponse>(
      '/users/search',
      { params: { q: query } },
    );
    return data.users;
  },
};

export default chatsApi;
