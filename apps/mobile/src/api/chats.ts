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

  async detail(chatId: string): Promise<ChatDetailResponse> {
    const { data } = await apiClient.get<ChatDetailResponse>(
      `/chats/${chatId}`,
    );
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
