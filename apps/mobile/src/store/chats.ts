/**
 * Synapmsg chats store (Zustand).
 *
 * State:
 *   chats:          Chat[]                          (sorted by updatedAt desc)
 *   messagesByChat: Record<chatId, Message[]>       (chronological asc)
 *   unreadByChat:   Record<chatId, number>
 *   isLoading:      boolean
 *   sendingChatId:  string | null                   (currently sending a message)
 *   error:          string | null
 *
 * Actions:
 *   fetchChats()
 *   fetchMessages(chatId)
 *   sendMessage(chatId, text)         — optimistic update
 *   receiveMessage(message)           — WebSocket handler
 *   startChat(userId)                 — POST /chats, returns Chat
 *   clearUnread(chatId)
 *   reset()
 */

import { create } from 'zustand';
import chatsApi from '../api/chats';
import messagesApi from '../api/messages';
import wsManager from '../api/websocket';
import { ApiError } from '../api/client';
import { useAuthStore } from './auth';
import { Chat, Message } from '../types';

interface ChatsState {
  chats: Chat[];
  messagesByChat: Record<string, Message[]>;
  unreadByChat: Record<string, number>;
  isLoading: boolean;
  sendingChatId: string | null;
  error: string | null;

  fetchChats: () => Promise<void>;
  fetchMessages: (chatId: string) => Promise<void>;
  sendMessage: (chatId: string, text: string) => Promise<void>;
  receiveMessage: (message: Message) => void;
  startChat: (userId: string) => Promise<Chat>;
  clearUnread: (chatId: string) => void;
  reset: () => void;
}

// Optimistic messages get a synthetic id prefix so they can be reconciled
// when the server-confirmed message arrives over WebSocket.
const OPTIMISTIC_PREFIX = '__optimistic__';

let wsListenerRegistered = false;

export const useChatsStore = create<ChatsState>((set, get) => ({
  chats: [],
  messagesByChat: {},
  unreadByChat: {},
  isLoading: false,
  sendingChatId: null,
  error: null,

  fetchChats: async () => {
    set({ isLoading: true, error: null });
    try {
      const chats = await chatsApi.list();
      // Newest first — server already sorts by updatedAt desc, but
      // re-sort here so optimistic updates stay consistent.
      chats.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
      set({ chats, isLoading: false });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Failed to load chats';
      set({ isLoading: false, error: message });
    }
  },

  fetchMessages: async (chatId) => {
    try {
      const { messages } = await messagesApi.list(chatId, 1, 100);
      // Server returns ascending (oldest first). Replace the cache.
      set((state) => ({
        messagesByChat: {
          ...state.messagesByChat,
          [chatId]: messages,
        },
      }));
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Failed to load messages';
      set({ error: message });
    }
  },

  sendMessage: async (chatId, text) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const me = useAuthStore.getState().user;
    if (!me) return;

    // Build an optimistic message: sender = current user, untranslated.
    const optimisticId = `${OPTIMISTIC_PREFIX}${Date.now()}`;
    const optimistic: Message = {
      id: optimisticId,
      chatId,
      senderId: me.id,
      sender: { id: me.id, username: me.username, name: me.name },
      originalText: trimmed,
      originalLanguage: me.preferredLanguage,
      translatedText: trimmed,
      translatedLanguage: null,
      isTranslated: false,
      createdAt: new Date().toISOString(),
    };

    // Insert optimistically.
    set((state) => {
      const existing = state.messagesByChat[chatId] ?? [];
      return {
        messagesByChat: {
          ...state.messagesByChat,
          [chatId]: [...existing, optimistic],
        },
        sendingChatId: chatId,
      };
    });

    // Best-effort HTTP send. The server also broadcasts the canonical
    // message via WebSocket; we reconcile via receiveMessage below.
    try {
      const confirmed = await messagesApi.send(chatId, { text: trimmed });
      // Replace the optimistic row with the real one if it hasn't been
      // superseded by the WS broadcast already.
      set((state) => {
        const list = state.messagesByChat[chatId] ?? [];
        const stillOptimistic = list.some((m) => m.id === optimisticId);
        if (!stillOptimistic) return state;
        const next = list.map((m) => (m.id === optimisticId ? confirmed : m));
        return {
          messagesByChat: { ...state.messagesByChat, [chatId]: next },
        };
      });
    } catch (err) {
      // Mark the optimistic message as failed by removing it (simple
      // approach — could be extended to show a retry button).
      set((state) => {
        const list = state.messagesByChat[chatId] ?? [];
        const next = list.filter((m) => m.id !== optimisticId);
        return {
          messagesByChat: { ...state.messagesByChat, [chatId]: next },
          error:
            err instanceof ApiError ? err.message : 'Failed to send message',
        };
      });
    } finally {
      set({ sendingChatId: null });
    }
  },

  receiveMessage: (message) => {
    const { chatId } = message;

    set((state) => {
      const list = state.messagesByChat[chatId] ?? [];

      // Dedupe by id (and by originalText + createdAt for the optimistic
      // case where we don't yet know the real id).
      const exists = list.some(
        (m) =>
          m.id === message.id ||
          (m.id.startsWith(OPTIMISTIC_PREFIX) &&
            m.senderId === message.senderId &&
            m.originalText === message.originalText),
      );
      if (exists) {
        // Replace the optimistic placeholder with the canonical message.
        const next = list.map((m) =>
          m.id === message.id ||
          (m.id.startsWith(OPTIMISTIC_PREFIX) &&
            m.senderId === message.senderId &&
            m.originalText === message.originalText)
            ? message
            : m,
        );
        return {
          messagesByChat: { ...state.messagesByChat, [chatId]: next },
        };
      }

      return {
        messagesByChat: {
          ...state.messagesByChat,
          [chatId]: [...list, message],
        },
      };
    });

    // Update the chat preview + unread count.
    const me = useAuthStore.getState().user;
    const isMine = me?.id === message.senderId;

    set((state) => {
      const chats = state.chats.map((chat) => {
        if (chat.id !== chatId) return chat;
        return {
          ...chat,
          updatedAt: message.createdAt,
          lastMessage: {
            id: message.id,
            text: isMine ? message.originalText : message.translatedText,
            senderId: message.senderId,
            createdAt: message.createdAt,
          },
        };
      });

      // Resort so the chat with the new message bubbles to the top.
      chats.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

      const unreadByChat = { ...state.unreadByChat };
      if (!isMine) {
        unreadByChat[chatId] = (unreadByChat[chatId] ?? 0) + 1;
      }

      return { chats, unreadByChat };
    });
  },

  startChat: async (userId) => {
    try {
      const chat = await chatsApi.createOrReuse({ participantId: userId });
      // Insert if not already present.
      set((state) => {
        if (state.chats.some((c) => c.id === chat.id)) return state;
        return { chats: [chat, ...state.chats] };
      });
      return chat;
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Could not start chat';
      set({ error: message });
      throw err;
    }
  },

  clearUnread: (chatId) => {
    set((state) => {
      if (!state.unreadByChat[chatId]) return state;
      const next = { ...state.unreadByChat };
      delete next[chatId];
      return { unreadByChat: next };
    });
  },

  reset: () => {
    set({
      chats: [],
      messagesByChat: {},
      unreadByChat: {},
      isLoading: false,
      sendingChatId: null,
      error: null,
    });
  },
}));

/**
 * Register the global WebSocket message listener once.
 * Called from App.tsx after the auth store is hydrated.
 */
export function registerWebSocketListener(): () => void {
  if (wsListenerRegistered) return () => {};
  wsListenerRegistered = true;

  const unsubscribe = wsManager.onMessage((msg) => {
    if (msg.type === 'message' && msg.message) {
      useChatsStore.getState().receiveMessage(msg.message);
    }
  });
  return () => {
    wsListenerRegistered = false;
    unsubscribe();
  };
}

export default useChatsStore;
