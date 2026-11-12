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

import { Alert } from 'react-native';
import { create } from 'zustand';
import chatsApi from '../api/chats';
import messagesApi from '../api/messages';
import wsManager from '../api/websocket';
import { ApiError } from '../api/client';
import { useAuthStore } from './auth';
import { Chat, ChatEncryptionMode, Message } from '../types';
import {
  decryptMessageFromPeer,
  encryptMessageForPeer,
  IdentityKeyChangedError,
} from '../crypto/e2eSession';
import {
  hasUserTrustedPeer,
  promptIdentityTrust,
} from '../crypto/identityTrust';
import { getLocalSignalDeviceId } from '../crypto/signalSession';
import { applyPrivateOnDeviceMt } from '../i18n/privateOnDeviceMt';

interface ChatsState {
  chats: Chat[];
  messagesByChat: Record<string, Message[]>;
  unreadByChat: Record<string, number>;
  isLoading: boolean;
  sendingChatId: string | null;
  error: string | null;

  fetchChats: () => Promise<void>;
  fetchMessages: (chatId: string) => Promise<void>;
  sendMessage: (
    chatId: string,
    text: string,
    media?: {
      mediaUrl?: string;
      mediaType?: string;
      replyToId?: string;
      viewOnce?: boolean;
    },
  ) => Promise<void>;
  scheduleMessage: (chatId: string, text: string, sendAt: string) => Promise<void>;
  receiveMessage: (message: Message) => void;
  startChat: (userId: string) => Promise<Chat>;
  createGroup: (name: string, participantIds: string[]) => Promise<Chat>;
  leaveGroup: (chatId: string) => Promise<void>;
  addMembers: (chatId: string, participantIds: string[]) => Promise<Chat>;
  editMessage: (chatId: string, messageId: string, text: string) => Promise<void>;
  deleteMessage: (chatId: string, messageId: string) => Promise<void>;
  reactToMessage: (chatId: string, messageId: string, emoji: string) => Promise<void>;
  applyEditedMessage: (message: Message) => void;
  applyReactions: (
    chatId: string,
    messageId: string,
    reactions: NonNullable<Message['reactions']>,
  ) => void;
  clearUnread: (chatId: string) => void;
  /** Clears messages for this user (API clearedAt + local wipe). */
  clearChat: (chatId: string) => Promise<void>;
  setEncryptionMode: (
    chatId: string,
    mode: ChatEncryptionMode,
  ) => Promise<void>;
  reset: () => void;
}

function peerIdForChat(chat: Chat | undefined, meId: string): string | null {
  if (!chat) return null;
  const other = chat.participants.find((p) => p.userId !== meId);
  return other?.userId ?? null;
}

function otherParticipantIds(chat: Chat | undefined, meId: string): string[] {
  if (!chat) return [];
  return (chat.participants || [])
    .map((p) => p.userId)
    .filter((id) => id && id !== meId);
}

function peerLabelForChat(chat: Chat | undefined, meId: string): string {
  if (!chat) return 'contacto';
  const other = chat.participants.find((p) => p.userId !== meId);
  return (
    other?.user?.privateNumberFormatted ||
    other?.user?.username ||
    other?.user?.name ||
    'contacto'
  );
}

async function maybeDecryptMessage(
  message: Message,
  peerUserId: string | null,
  chatId?: string,
): Promise<Message> {
  let next = message;
  if (message.isE2e && message.ciphertext && peerUserId) {
    const { mayDecryptE2e } = await import('../security/deviceGuard');
    const gate = mayDecryptE2e();
    if (!gate.ok) {
      next = {
        ...message,
        originalText: `🔒 No se pudo descifrar (${gate.reason || 'entorno no confiable'})`,
        translatedText: `🔒 No se pudo descifrar (${gate.reason || 'entorno no confiable'})`,
        isTranslated: false,
      };
    } else {
      try {
        const plain = await decryptMessageFromPeer(
          peerUserId,
          message.ciphertext,
        );
        if (plain) {
          next = {
            ...message,
            originalText: plain,
            translatedText: plain,
            isTranslated: false,
          };
        } else if (
          !message.originalText ||
          message.originalText.startsWith('🔒')
        ) {
          console.warn(
            '[signal] decrypt returned null for message',
            message.id,
            'peer',
            peerUserId,
          );
          next = {
            ...message,
            originalText: '🔒 No se pudo descifrar (sesión Signal)',
            translatedText: '🔒 No se pudo descifrar (sesión Signal)',
            isTranslated: false,
          };
        }
      } catch (err) {
        if (err instanceof IdentityKeyChangedError) {
          const chat = useChatsStore
            .getState()
            .chats.find((c) => c.id === (chatId || message.chatId));
          const me = useAuthStore.getState().user;
          const label = peerLabelForChat(chat, me?.id || '');
          if (!hasUserTrustedPeer(err.peerUserId)) {
            void getLocalSignalDeviceId().then((deviceId) => {
              promptIdentityTrust({
                peerUserId: err.peerUserId,
                peerLabel: label,
                newIdentityKeyB64: err.newIdentityKeyB64,
                deviceId,
                onTrusted: () => {
                  const cid = chatId || message.chatId;
                  if (cid) void useChatsStore.getState().fetchMessages(cid);
                },
              });
            });
          }
          next = {
            ...message,
            originalText: '🔒 La llave de seguridad cambió',
            translatedText: '🔒 La llave de seguridad cambió',
            isTranslated: false,
          };
        } else if (
          !message.originalText ||
          message.originalText.startsWith('🔒')
        ) {
          next = {
            ...message,
            originalText: '🔒 No se pudo descifrar (sesión Signal)',
            translatedText: '🔒 No se pudo descifrar (sesión Signal)',
            isTranslated: false,
          };
        }
      }
    }
  }
  const me = useAuthStore.getState().user;
  // Private only: ML Kit on-device. Cloud keeps DeepL on the server — do not run MT here.
  if (!next.isE2e) return next;
  return applyPrivateOnDeviceMt(
    next,
    me?.preferredLanguage || 'es',
    me?.id,
  );
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
      const me = useAuthStore.getState().user;
      const chat = get().chats.find((c) => c.id === chatId);
      const peerId = me ? peerIdForChat(chat, me.id) : null;
      const decrypted = await Promise.all(
        messages.map(async (m) => {
          // Own messages: keep server placeholder / local cache; decrypt others via sender.
          const fromPeer = m.senderId === me?.id ? null : m.senderId;
          return maybeDecryptMessage(m, fromPeer, chatId);
        }),
      );
      set((state) => ({
        messagesByChat: {
          ...state.messagesByChat,
          [chatId]: decrypted,
        },
      }));
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Failed to load messages';
      set({ error: message });
    }
  },

  sendMessage: async (chatId, text, media) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const me = useAuthStore.getState().user;
    if (!me) return;

    const chat = get().chats.find((c) => c.id === chatId);
    const e2e = chat?.encryptionMode === 'e2e';
    const peerId = peerIdForChat(chat, me.id);
    const others = otherParticipantIds(chat, me.id);
    const isGroup = chat?.type === 'group';

    let ciphertext: string | undefined;
    let ciphertextType: number | undefined;
    let recipientEnvelopes:
      | Array<{
          recipientUserId: string;
          ciphertext: string;
          ciphertextType?: number;
        }>
      | undefined;
    if (e2e) {
      if (others.length === 0) {
        set({ error: 'No hay destinatario para cifrar E2E' });
        return;
      }
      if (isGroup && others.length > 49) {
        set({ error: 'Grupo Privado: máximo 50 miembros' });
        return;
      }
      try {
        if (isGroup) {
          recipientEnvelopes = [];
          for (const uid of others) {
            const enc = await encryptMessageForPeer(uid, trimmed);
            recipientEnvelopes.push({
              recipientUserId: uid,
              ciphertext: enc.ciphertext,
              ciphertextType: enc.ciphertextType,
            });
          }
          ciphertext = recipientEnvelopes[0]?.ciphertext;
          ciphertextType = recipientEnvelopes[0]?.ciphertextType;
        } else {
          if (!peerId) {
            set({ error: 'No hay destinatario para cifrar E2E' });
            return;
          }
          const enc = await encryptMessageForPeer(peerId, trimmed);
          ciphertext = enc.ciphertext;
          ciphertextType = enc.ciphertextType;
        }
      } catch (err) {
        if (err instanceof IdentityKeyChangedError) {
          const label = peerLabelForChat(chat, me.id);
          const deviceId = await getLocalSignalDeviceId();
          set({ error: 'Identity key changed' });
          promptIdentityTrust({
            peerUserId: err.peerUserId,
            peerLabel: label,
            newIdentityKeyB64: err.newIdentityKeyB64,
            deviceId,
            onTrusted: () => {
              void get().sendMessage(chatId, text, media);
            },
          });
          return;
        }
        const msg =
          err instanceof Error
            ? err.message
            : 'No se pudo cifrar (registrá el dispositivo E2E)';
        set({ error: msg });
        Alert.alert(
          'No se envió',
          msg.includes('E2E') ||
            msg.includes('cifrar') ||
            msg.includes('device') ||
            msg.includes('dispositivo')
            ? 'Este chat es Privado E2E y faltan claves en el teléfono. En el menú del chat: Privacidad → sincronización en la nube (o registrá E2E en Ajustes).'
            : msg,
        );
        return;
      }
    }

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
      mediaUrl: media?.mediaUrl ?? null,
      mediaType: media?.mediaType ?? null,
      ciphertext: ciphertext ?? null,
      ciphertextType: ciphertextType ?? null,
      isE2e: e2e,
      viewOnce: Boolean(media?.viewOnce),
      replyTo: null,
      createdAt: new Date().toISOString(),
    };

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

    try {
      const confirmed = await messagesApi.send(chatId, e2e
        ? {
            ciphertext,
            ciphertextType,
            recipientEnvelopes,
            mediaUrl: media?.mediaUrl,
            mediaType: media?.mediaType,
            replyToId: media?.replyToId,
            viewOnce: media?.viewOnce,
          }
        : {
            text: trimmed,
            mediaUrl: media?.mediaUrl,
            mediaType: media?.mediaType,
            replyToId: media?.replyToId,
            viewOnce: media?.viewOnce,
          });
      const shown = e2e
        ? {
            ...confirmed,
            originalText: trimmed,
            translatedText: trimmed,
            isE2e: true,
            mediaUrl: media?.mediaUrl ?? confirmed.mediaUrl,
            viewOnce: Boolean(media?.viewOnce || confirmed.viewOnce),
          }
        : {
            ...confirmed,
            mediaUrl: media?.mediaUrl ?? confirmed.mediaUrl,
            viewOnce: Boolean(media?.viewOnce || confirmed.viewOnce),
          };
      set((state) => {
        const list = state.messagesByChat[chatId] ?? [];
        const stillOptimistic = list.some((m) => m.id === optimisticId);
        if (!stillOptimistic) return state;
        const next = list.map((m) => (m.id === optimisticId ? shown : m));
        return {
          messagesByChat: { ...state.messagesByChat, [chatId]: next },
        };
      });
    } catch (err) {
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

  scheduleMessage: async (chatId, text, sendAt) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const chat = get().chats.find((c) => c.id === chatId);
    if (chat?.encryptionMode === 'e2e') {
      throw new Error(
        'En chats Privado E2E no se pueden programar mensajes (evitarían plaintext en el servidor).',
      );
    }
    await messagesApi.schedule(chatId, trimmed, sendAt);
  },

  receiveMessage: (message) => {
    const { chatId } = message;
    const me = useAuthStore.getState().user;
    const chat = get().chats.find((c) => c.id === chatId);
    const peerId = me ? peerIdForChat(chat, me.id) : null;
    // Group: always decrypt with sender's session. Own echoes keep optimistic text.
    const fromPeer =
      message.senderId === me?.id
        ? peerId
        : message.senderId;

    void (async () => {
      const decoded = await maybeDecryptMessage(message, fromPeer, chatId);
      const isMine = me?.id === decoded.senderId;

      set((state) => {
        const list = state.messagesByChat[chatId] ?? [];
        const exists = list.some(
          (m) =>
            m.id === decoded.id ||
            (m.id.startsWith(OPTIMISTIC_PREFIX) &&
              m.senderId === decoded.senderId &&
              (m.originalText === decoded.originalText ||
                (Boolean(m.isE2e) && Boolean(decoded.isE2e)))),
        );
        let messagesByChat: typeof state.messagesByChat;
        if (exists) {
          const next = list.map((m) => {
            const keepOwnPlain = (
              local: Message,
              incoming: Message,
            ): Message => {
              if (
                isMine &&
                incoming.isE2e &&
                (!incoming.originalText ||
                  incoming.originalText.startsWith('🔒')) &&
                local.originalText &&
                !local.originalText.startsWith('🔒')
              ) {
                return {
                  ...incoming,
                  originalText: local.originalText,
                  translatedText: local.translatedText || local.originalText,
                };
              }
              return incoming;
            };
            if (m.id === decoded.id) return keepOwnPlain(m, decoded);
            if (
              m.id.startsWith(OPTIMISTIC_PREFIX) &&
              m.senderId === decoded.senderId &&
              (m.originalText === decoded.originalText ||
                (Boolean(m.isE2e) && Boolean(decoded.isE2e)))
            ) {
              // Own Private echo has ciphertext only — keep local plaintext.
              return keepOwnPlain(m, decoded);
            }
            return m;
          });
          messagesByChat = { ...state.messagesByChat, [chatId]: next };
        } else {
          messagesByChat = {
            ...state.messagesByChat,
            [chatId]: [...list, decoded],
          };
        }

        const previewText = decoded.isE2e
          ? !decoded.originalText || decoded.originalText.startsWith('🔒')
            ? '🔒 Mensaje cifrado'
            : decoded.originalText
          : isMine
            ? decoded.originalText
            : decoded.translatedText || decoded.originalText;

        const chats = state.chats.map((c) => {
          if (c.id !== chatId) return c;
          return {
            ...c,
            updatedAt: decoded.createdAt,
            lastMessage: {
              id: decoded.id,
              text: previewText,
              senderId: decoded.senderId,
              createdAt: decoded.createdAt,
            },
          };
        });
        chats.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

        const unreadByChat = { ...state.unreadByChat };
        if (!isMine && !exists) {
          unreadByChat[chatId] = (unreadByChat[chatId] ?? 0) + 1;
        }

        return { messagesByChat, chats, unreadByChat };
      });
    })();
  },

  startChat: async (userId) => {
    try {
      const chat = await chatsApi.createOrReuse({ participantId: userId });
      // Download + persist peer Signal public bundle before first Private send.
      try {
        const { ensurePeerSession } = await import('../crypto/signalSession');
        await ensurePeerSession(userId);
      } catch (bundleErr) {
        console.warn(
          '[signal] ensurePeerSession on startChat failed',
          bundleErr instanceof Error ? bundleErr.message : bundleErr,
        );
      }
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

  createGroup: async (name, participantIds) => {
    try {
      const chat = await chatsApi.createGroup(name, participantIds);
      set((state) => {
        const chats = [chat, ...state.chats.filter((c) => c.id !== chat.id)];
        return { chats };
      });
      return chat;
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'No se pudo crear el grupo';
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

  clearChat: async (chatId) => {
    await chatsApi.clear(chatId);
    set((state) => ({
      messagesByChat: { ...state.messagesByChat, [chatId]: [] },
      unreadByChat: { ...state.unreadByChat, [chatId]: 0 },
      chats: state.chats.map((c) =>
        c.id === chatId ? { ...c, lastMessage: null } : c,
      ),
    }));
  },

  setEncryptionMode: async (chatId, mode) => {
    const { encryptionMode } = await chatsApi.setEncryptionMode(chatId, mode);
    set((state) => ({
      chats: state.chats.map((c) =>
        c.id === chatId ? { ...c, encryptionMode } : c,
      ),
    }));
  },

  leaveGroup: async (chatId) => {
    await chatsApi.leaveGroup(chatId);
    set((state) => ({
      chats: state.chats.filter((c) => c.id !== chatId),
      messagesByChat: { ...state.messagesByChat, [chatId]: [] },
      unreadByChat: { ...state.unreadByChat, [chatId]: 0 },
    }));
  },

  addMembers: async (chatId, participantIds) => {
    const chat = await chatsApi.addMembers(chatId, participantIds);
    set((state) => {
      const exists = state.chats.some((c) => c.id === chat.id);
      const chats = exists
        ? state.chats.map((c) => (c.id === chat.id ? chat : c))
        : [chat, ...state.chats];
      chats.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
      return { chats };
    });
    return chat;
  },

  editMessage: async (chatId, messageId, text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const me = useAuthStore.getState().user;
    const chat = get().chats.find((c) => c.id === chatId);
    const e2e = chat?.encryptionMode === 'e2e';
    let updated;
    if (e2e && me) {
      const others = otherParticipantIds(chat, me.id);
      if (chat?.type === 'group' && others.length > 0) {
        const recipientEnvelopes = [];
        for (const uid of others) {
          const enc = await encryptMessageForPeer(uid, trimmed);
          recipientEnvelopes.push({
            recipientUserId: uid,
            ciphertext: enc.ciphertext,
            ciphertextType: enc.ciphertextType,
          });
        }
        updated = await messagesApi.edit(chatId, messageId, {
          ciphertext: recipientEnvelopes[0]?.ciphertext,
          ciphertextType: recipientEnvelopes[0]?.ciphertextType,
          recipientEnvelopes,
        });
      } else {
        const peerId = peerIdForChat(chat, me.id);
        if (!peerId) throw new Error('Sin destinatario para editar E2E');
        const enc = await encryptMessageForPeer(peerId, trimmed);
        updated = await messagesApi.edit(chatId, messageId, {
          ciphertext: enc.ciphertext,
          ciphertextType: enc.ciphertextType,
        });
      }
      get().applyEditedMessage({
        ...updated,
        originalText: trimmed,
        translatedText: trimmed,
        editedAt: updated.editedAt || new Date().toISOString(),
      });
      return;
    }
    updated = await messagesApi.edit(chatId, messageId, trimmed);
    get().applyEditedMessage(updated);
  },

  deleteMessage: async (chatId, messageId) => {
    const updated = await messagesApi.remove(chatId, messageId);
    get().applyEditedMessage(updated);
  },

  reactToMessage: async (chatId, messageId, emoji) => {
    const { reactions } = await messagesApi.react(chatId, messageId, emoji);
    get().applyReactions(chatId, messageId, reactions);
  },

  applyEditedMessage: (message) => {
    set((state) => {
      const list = state.messagesByChat[message.chatId] ?? [];
      const idx = list.findIndex((m) => m.id === message.id);
      if (idx === -1) return state;
      const next = [...list];
      next[idx] = { ...next[idx], ...message };
      return {
        messagesByChat: {
          ...state.messagesByChat,
          [message.chatId]: next,
        },
      };
    });
  },

  applyReactions: (chatId, messageId, reactions) => {
    const meId = useAuthStore.getState().user?.id;
    const normalized = reactions.map((r) => ({
      ...r,
      me: meId
        ? Boolean(r.userIds?.includes(meId) || r.me)
        : Boolean(r.me),
    }));
    set((state) => {
      const list = state.messagesByChat[chatId] ?? [];
      const idx = list.findIndex((m) => m.id === messageId);
      if (idx === -1) return state;
      const next = [...list];
      next[idx] = { ...next[idx], reactions: normalized };
      return {
        messagesByChat: {
          ...state.messagesByChat,
          [chatId]: next,
        },
      };
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
    } else if (
      (msg.type === 'message_edited' || msg.type === 'message_deleted') &&
      msg.message
    ) {
      useChatsStore.getState().applyEditedMessage(msg.message);
    } else if (msg.type === 'reaction_updated' && msg.messageId) {
      useChatsStore
        .getState()
        .applyReactions(msg.chatId, msg.messageId, msg.reactions ?? []);
    }
  });
  return () => {
    wsListenerRegistered = false;
    unsubscribe();
  };
}

export default useChatsStore;
