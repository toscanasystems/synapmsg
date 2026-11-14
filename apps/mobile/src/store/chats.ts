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
import {
  awaitSignalStoreReady,
  commitSignalPreKeyRemovals,
  getLocalSignalDeviceId,
  isSignalStoreLoaded,
  peekLastDecryptError,
} from '../crypto/signalSession';
import {
  isSpentSignalEnvelopeError,
  loadCachedPlaintext,
  saveCachedPlaintext,
} from '../crypto/e2ePlaintextCache';
import { applyPrivateOnDeviceMt } from '../i18n/privateOnDeviceMt';

/** E2E envelopes that failed open — retry after Signal identity/OTKs are ready. */
type PendingDecrypt = {
  message: Message;
  peerUserId: string;
  chatId: string;
  attempts: number;
};
const pendingDecryptById = new Map<string, PendingDecrypt>();
/** Spent PreKey/Whisper ids — never SessionCipher-open again. */
const spentEnvelopeIds = new Set<string>();
/** Second path (WS vs catch-up) waits on the first decrypt for the same id. */
const decryptInflightById = new Map<string, Promise<Message>>();
let pendingFlushTimer: ReturnType<typeof setTimeout> | null = null;

const LOCK_NO_SERVER = '🔒 No hay conexión con el servidor';
const LOCK_NO_PEER_KEY =
  '🔒 Este teléfono todavía no tiene la llave de este contacto';
const LOCK_ASK_RESEND =
  '🔒 No se pudo abrir este mensaje. Pedile a quien te lo mandó que lo reenvíe';

function looksLikeNetworkFailure(errText: string): boolean {
  const e = (errText || '').toLowerCase();
  return (
    e.includes('network') ||
    e.includes('timeout') ||
    e.includes('timed out') ||
    e.includes('failed to fetch') ||
    e.includes('network request failed') ||
    e.includes('internet') ||
    e.includes('unreachable') ||
    e.includes('econnrefused') ||
    e.includes('enotfound') ||
    e.includes('offline')
  );
}

function userFacingDecryptLock(lastErr: string): string {
  // Offline / airplane: prefer the plain network message.
  if (useAuthStore.getState().sessionOffline) {
    return LOCK_NO_SERVER;
  }
  const e = (lastErr || '').toLowerCase();
  if (looksLikeNetworkFailure(e)) {
    return LOCK_NO_SERVER;
  }
  if (
    e.includes('missing local') ||
    e.includes('store not ready') ||
    e.includes('no session for whisper') ||
    e.includes('need prekey') ||
    e.includes('identity not installed') ||
    e.includes('peer bundle')
  ) {
    return LOCK_NO_PEER_KEY;
  }
  if (isSpentSignalEnvelopeError(lastErr) || e.includes('message key not found')) {
    return LOCK_ASK_RESEND;
  }
  // Device-guard / unknown: ask to resend — never technical jargon on screen.
  return LOCK_ASK_RESEND;
}

function findLocalOpened(
  chatId: string | undefined,
  messageId: string,
): Message | undefined {
  if (!chatId) return undefined;
  const list = useChatsStore.getState().messagesByChat[chatId] ?? [];
  const hit = list.find((m) => m.id === messageId);
  return hit && hasUsablePlaintext(hit) ? hit : undefined;
}

function schedulePendingFlush(delayMs: number): void {
  if (pendingFlushTimer) return;
  pendingFlushTimer = setTimeout(() => {
    pendingFlushTimer = null;
    void flushPendingSignalDecrypts();
  }, delayMs);
}

function enqueuePendingDecrypt(
  message: Message,
  peerUserId: string,
  chatId: string,
  attempts = 0,
): void {
  if (!message.ciphertext) return;
  const prev = pendingDecryptById.get(message.id);
  pendingDecryptById.set(message.id, {
    message: { ...message },
    peerUserId,
    chatId,
    attempts: Math.max(attempts, prev?.attempts ?? 0),
  });
  schedulePendingFlush(attempts === 0 ? 600 : 1200);
}

/** Re-attempt queued Private envelopes once the Signal store + identity are ready. */
export async function flushPendingSignalDecrypts(): Promise<void> {
  if (pendingDecryptById.size === 0) return;
  try {
    await awaitSignalStoreReady();
  } catch (err) {
    console.warn(
      '[signal] flush pending: store not ready',
      err instanceof Error ? err.message : err,
      'storeLoaded=',
      isSignalStoreLoaded(),
    );
    schedulePendingFlush(1500);
    return;
  }
  const batch = [...pendingDecryptById.entries()];
  for (const [id, item] of batch) {
    pendingDecryptById.delete(id);
    const decoded = await maybeDecryptMessage(
      item.message,
      item.peerUserId,
      item.chatId,
      { skipEnqueue: true },
    );
    if (!hasUsablePlaintext(decoded)) {
      const lastErr = peekLastDecryptError();
      // At most one retry, and never for a spent one-time message key.
      if (
        !spentEnvelopeIds.has(id) &&
        !isSpentSignalEnvelopeError(lastErr) &&
        item.attempts < 1
      ) {
        enqueuePendingDecrypt(
          item.message,
          item.peerUserId,
          item.chatId,
          item.attempts + 1,
        );
      } else if (isSpentSignalEnvelopeError(lastErr)) {
        spentEnvelopeIds.add(id);
      }
      continue;
    }
    if (decoded.ciphertext) {
      void saveCachedPlaintext({
        id: decoded.id,
        chatId: item.chatId,
        ciphertext: decoded.ciphertext,
        originalText: decoded.originalText,
        translatedText: decoded.translatedText || decoded.originalText,
      });
    }
    useChatsStore.setState((state) => {
      const list = state.messagesByChat[item.chatId] ?? [];
      const next = list.map((m) => (m.id === id ? decoded : m));
      const preview =
        !decoded.originalText || decoded.originalText.startsWith('🔒')
          ? '🔒 Mensaje cifrado'
          : decoded.originalText;
      const chats = state.chats.map((c) => {
        if (c.id !== item.chatId) return c;
        if (c.lastMessage?.id !== id) return c;
        return {
          ...c,
          lastMessage: {
            ...c.lastMessage,
            text: preview,
          },
        };
      });
      return {
        messagesByChat: { ...state.messagesByChat, [item.chatId]: next },
        chats,
      };
    });
  }
}

interface ChatsState {
  chats: Chat[];
  messagesByChat: Record<string, Message[]>;
  unreadByChat: Record<string, number>;
  /** Chat currently open on screen (for reconnect catch-up). */
  activeChatId: string | null;
  isLoading: boolean;
  sendingChatId: string | null;
  error: string | null;

  setActiveChatId: (chatId: string | null) => void;
  /** After WS drop: refresh open chats so missed frames are not skipped. */
  catchUpAfterReconnect: () => Promise<void>;
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

function hasUsablePlaintext(m: Message | undefined): boolean {
  return Boolean(
    m?.originalText &&
      m.originalText.length > 0 &&
      !m.originalText.startsWith('🔒'),
  );
}

async function maybeDecryptMessage(
  message: Message,
  peerUserId: string | null,
  chatId?: string,
  opts?: { skipEnqueue?: boolean },
): Promise<Message> {
  const finish = async (next: Message): Promise<Message> => {
    if (!next.isE2e) return next;
    const me = useAuthStore.getState().user;
    return applyPrivateOnDeviceMt(
      next,
      me?.preferredLanguage || 'es',
      me?.id,
    );
  };

  if (!(message.isE2e && message.ciphertext && peerUserId)) {
    return finish(message);
  }

  const cid = chatId || message.chatId;

  // 1) Already opened in this chat — never SessionCipher again.
  const localOpened = findLocalOpened(cid, message.id);
  if (localOpened) {
    return finish({
      ...message,
      originalText: localOpened.originalText,
      translatedText: localOpened.translatedText || localOpened.originalText,
      isTranslated: localOpened.isTranslated,
    });
  }

  // 2) Another path (WS / catch-up / flush) already decrypting this id — wait.
  const inflight = decryptInflightById.get(message.id);
  if (inflight) {
    console.warn('[signal] decrypt dedup wait', message.id);
    return inflight;
  }

  const work = (async (): Promise<Message> => {
    // Re-check after winning the race to start.
    const raced = findLocalOpened(cid, message.id);
    if (raced) {
      return finish({
        ...message,
        originalText: raced.originalText,
        translatedText: raced.translatedText || raced.originalText,
        isTranslated: raced.isTranslated,
      });
    }

    const cached = await loadCachedPlaintext(message.id, message.ciphertext);
    if (cached) {
      return finish({
        ...message,
        originalText: cached.originalText,
        translatedText: cached.translatedText,
        isTranslated: false,
      });
    }

    if (spentEnvelopeIds.has(message.id)) {
      return finish({
        ...message,
        originalText: LOCK_ASK_RESEND,
        translatedText: LOCK_ASK_RESEND,
        isTranslated: false,
      });
    }

    // Airplane / sin red: no intentar abrir hasta que vuelva la conexión.
    if (useAuthStore.getState().sessionOffline) {
      if (!opts?.skipEnqueue && cid) {
        enqueuePendingDecrypt(message, peerUserId, cid);
      }
      return finish({
        ...message,
        originalText: LOCK_NO_SERVER,
        translatedText: LOCK_NO_SERVER,
        isTranslated: false,
      });
    }

    try {
      await awaitSignalStoreReady();
    } catch (err) {
      console.warn(
        '[signal] store not ready before decrypt',
        message.id,
        'storeLoaded=',
        isSignalStoreLoaded(),
        err instanceof Error ? err.message : err,
      );
      if (!opts?.skipEnqueue && cid) {
        enqueuePendingDecrypt(message, peerUserId, cid);
      }
      return finish({
        ...message,
        originalText: LOCK_NO_PEER_KEY,
        translatedText: LOCK_NO_PEER_KEY,
        isTranslated: false,
      });
    }

    const { mayDecryptE2e } = await import('../security/deviceGuard');
    const gate = mayDecryptE2e();
    if (!gate.ok) {
      // Not a network failure — do not say "sin conexión". Ask to resend.
      return finish({
        ...message,
        originalText: LOCK_ASK_RESEND,
        translatedText: LOCK_ASK_RESEND,
        isTranslated: false,
      });
    }

    try {
      // Triple-check: catch-up may have finished while we awaited store ready.
      const again = findLocalOpened(cid, message.id);
      if (again) {
        return finish({
          ...message,
          originalText: again.originalText,
          translatedText: again.translatedText || again.originalText,
          isTranslated: again.isTranslated,
        });
      }

      const plain = await decryptMessageFromPeer(
        peerUserId,
        message.ciphertext!,
      );
      if (plain) {
        const opened: Message = {
          ...message,
          originalText: plain,
          translatedText: plain,
          isTranslated: false,
        };
        // Persist id+plaintext together, then drop the one-time prekey.
        if (cid && message.ciphertext) {
          await saveCachedPlaintext({
            id: message.id,
            chatId: cid,
            ciphertext: message.ciphertext,
            originalText: plain,
            translatedText: plain,
          });
        }
        await commitSignalPreKeyRemovals().catch(() => undefined);
        // Put plaintext in the chat list immediately so a parallel path reuses it.
        if (cid) {
          useChatsStore.setState((state) => {
            const list = state.messagesByChat[cid] ?? [];
            const idx = list.findIndex((m) => m.id === message.id);
            const nextList =
              idx >= 0
                ? list.map((m) => (m.id === message.id ? opened : m))
                : [...list, opened];
            return {
              messagesByChat: { ...state.messagesByChat, [cid]: nextList },
            };
          });
        }
        return finish(opened);
      }

      const lastErr = peekLastDecryptError();
      console.warn(
        '[signal] decrypt returned null for message',
        message.id,
        'peer',
        peerUserId,
        'storeLoaded=',
        isSignalStoreLoaded(),
      );
      if (isSpentSignalEnvelopeError(lastErr)) {
        spentEnvelopeIds.add(message.id);
        pendingDecryptById.delete(message.id);
        console.warn(
          '[signal] spent envelope — will not retry',
          message.id,
          lastErr,
        );
      } else if (!opts?.skipEnqueue && cid) {
        enqueuePendingDecrypt(message, peerUserId, cid);
      }
      return finish({
        ...message,
        originalText: userFacingDecryptLock(lastErr),
        translatedText: userFacingDecryptLock(lastErr),
        isTranslated: false,
      });
    } catch (err) {
      if (err instanceof IdentityKeyChangedError) {
        const chat = useChatsStore.getState().chats.find((c) => c.id === cid);
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
                if (cid) void useChatsStore.getState().fetchMessages(cid);
              },
            });
          });
        }
        return finish({
          ...message,
          originalText: '🔒 La llave de seguridad cambió',
          translatedText: '🔒 La llave de seguridad cambió',
          isTranslated: false,
        });
      }
      const cause = err instanceof Error ? err.message : String(err);
      console.warn(
        '[signal] decrypt threw for message',
        message.id,
        'storeLoaded=',
        isSignalStoreLoaded(),
        cause,
      );
      if (isSpentSignalEnvelopeError(cause)) {
        spentEnvelopeIds.add(message.id);
        pendingDecryptById.delete(message.id);
      } else if (!opts?.skipEnqueue && cid) {
        enqueuePendingDecrypt(message, peerUserId, cid);
      }
      return finish({
        ...message,
        originalText: userFacingDecryptLock(cause),
        translatedText: userFacingDecryptLock(cause),
        isTranslated: false,
      });
    }
  })();

  decryptInflightById.set(message.id, work);
  try {
    return await work;
  } finally {
    if (decryptInflightById.get(message.id) === work) {
      decryptInflightById.delete(message.id);
    }
  }
}

// Optimistic messages get a synthetic id prefix so they can be reconciled
// when the server-confirmed message arrives over WebSocket.
const OPTIMISTIC_PREFIX = '__optimistic__';

let wsListenerRegistered = false;

export const useChatsStore = create<ChatsState>((set, get) => ({
  chats: [],
  messagesByChat: {},
  unreadByChat: {},
  activeChatId: null,
  isLoading: false,
  sendingChatId: null,
  error: null,

  setActiveChatId: (chatId) => set({ activeChatId: chatId }),

  catchUpAfterReconnect: async () => {
    // Store first, then REST catch-up, then decrypt — never decrypt mid-hydrate.
    try {
      await awaitSignalStoreReady();
    } catch (err) {
      console.warn(
        '[signal] catch-up deferred: store not ready',
        err instanceof Error ? err.message : err,
      );
      return;
    }
    const { activeChatId, messagesByChat, fetchChats, fetchMessages } = get();
    const ids = new Set<string>(Object.keys(messagesByChat));
    if (activeChatId) ids.add(activeChatId);
    try {
      await fetchChats();
    } catch {
      /* keep going — messages still matter */
    }
    await Promise.all(
      [...ids].map(async (id) => {
        try {
          await fetchMessages(id);
        } catch {
          /* per-chat failure is non-fatal */
        }
      }),
    );
  },

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
      await awaitSignalStoreReady();
      const { messages } = await messagesApi.list(chatId, 1, 100);
      const me = useAuthStore.getState().user;
      const existing = get().messagesByChat[chatId] ?? [];
      const byId = new Map(existing.map((m) => [m.id, m]));
      // Signal envelopes are single-use. Never SessionCipher-open an id we
      // already have locally (plaintext or prior lock) — catch-up would burn
      // the live ratchet. Only decrypt brand-new ids from the server list.
      const decrypted: Message[] = [];
      for (const m of messages) {
        const local = byId.get(m.id);
        const fromPeer = m.senderId === me?.id ? null : m.senderId;
        // Already opened locally — never SessionCipher-open again (ratchet is one-shot).
        if (local && local.ciphertext === m.ciphertext && hasUsablePlaintext(local)) {
          decrypted.push({
            ...m,
            originalText: local.originalText,
            translatedText: local.translatedText || local.originalText,
            isTranslated: local.isTranslated,
          });
          continue;
        }
        // Own sends: keep local plaintext; server has ciphertext only.
        if (fromPeer == null) {
          decrypted.push({
            ...m,
            originalText:
              (local && hasUsablePlaintext(local) && local.originalText) ||
              (m.originalText && !m.originalText.startsWith('🔒')
                ? m.originalText
                : '🔒 Mensaje cifrado'),
            translatedText:
              (local && hasUsablePlaintext(local) &&
                (local.translatedText || local.originalText)) ||
              '🔒 Mensaje cifrado',
            isTranslated: false,
          });
          continue;
        }
        // New id OR prior lock/failure with same ciphertext: try (again) to open.
        decrypted.push(await maybeDecryptMessage(m, fromPeer, chatId));
      }
      set((state) => ({
        messagesByChat: {
          ...state.messagesByChat,
          [chatId]: decrypted,
        },
      }));
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      const message =
        useAuthStore.getState().sessionOffline || looksLikeNetworkFailure(raw)
          ? 'No hay conexión con el servidor'
          : err instanceof ApiError
            ? err.message
            : 'No se pudieron cargar los mensajes';
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
      // Dedup: if catch-up already opened this id, reuse plaintext — no second SessionCipher.
      const already = findLocalOpened(chatId, message.id);
      const decoded = already
        ? {
            ...message,
            originalText: already.originalText,
            translatedText: already.translatedText || already.originalText,
            isTranslated: already.isTranslated,
          }
        : await maybeDecryptMessage(message, fromPeer, chatId);
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
      activeChatId: null,
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

  let sawDisconnect = false;
  const unsubState = wsManager.onStateChange((state) => {
    if (state === 'disconnected' || state === 'connecting') {
      sawDisconnect = true;
      return;
    }
    if (state === 'connected' && sawDisconnect) {
      sawDisconnect = false;
      void useChatsStore.getState().catchUpAfterReconnect();
    }
  });

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
    unsubState();
    unsubscribe();
  };
}

export default useChatsStore;
