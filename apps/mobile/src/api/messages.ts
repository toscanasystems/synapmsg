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
};

export const usersApi = {
  async updateMe(payload: UpdateUserRequest): Promise<User> {
    const { data } = await apiClient.patch<{ user: User }>(
      '/users/me',
      payload,
    );
    return data.user;
  },
};

export default messagesApi;
