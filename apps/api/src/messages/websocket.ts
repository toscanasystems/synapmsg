import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { URL } from 'url';
import { prisma } from '../lib/prisma';
import { verifyToken, AuthTokenPayload } from '../lib/jwt';
import {
  translateForRecipients,
  normalizeLanguageCode,
  toAppLanguageCode,
} from '../translation/service';
import { consumeTranslation, PlanLimitError } from '../billing/usage';

function toAppLang(code: string): string {
  return toAppLanguageCode(code);
}
import { pushToUserTokens } from '../lib/push';
import {
  PRIVATE_PLAINTEXT_FORBIDDEN,
  assertPrivateRowOpaque,
  buildPrivateMessageDbFields,
} from './privateEnvelope';

// ───────────────────────────────────────────────────────────
// Connection registry: userId -> set of open sockets
// A single user may have multiple sockets (multiple devices/tabs).
// ───────────────────────────────────────────────────────────
const connections = new Map<string, Set<WebSocket>>();

export function getUserConnections(userId: string): Set<WebSocket> {
  return connections.get(userId) ?? new Set();
}

function addConnection(userId: string, socket: WebSocket): void {
  let set = connections.get(userId);
  if (!set) {
    set = new Set();
    connections.set(userId, set);
  }
  set.add(socket);
}

function removeConnection(userId: string, socket: WebSocket): void {
  const set = connections.get(userId);
  if (!set) return;
  set.delete(socket);
  if (set.size === 0) {
    connections.delete(userId);
  }
}

// ───────────────────────────────────────────────────────────
// Outbound payloads
// ───────────────────────────────────────────────────────────
export type ReactionSummary = {
  emoji: string;
  count: number;
  me: boolean;
  userIds?: string[];
};

export type ReplyPreview = {
  id: string;
  senderName: string;
  text: string;
};

export interface WsMessagePayload {
  id: string;
  chatId: string;
  senderId: string;
  sender: {
    id: string;
    username: string;
    name: string;
  };
  originalText: string;
  originalLanguage: string;
  translatedText: string;
  translatedLanguage: string | null;
  isTranslated: boolean;
  mediaUrl?: string | null;
  mediaType?: string | null;
  ciphertext?: string | null;
  ciphertextType?: number | null;
  isE2e?: boolean;
  editedAt?: string | null;
  deletedAt?: string | null;
  expiresAt?: string | null;
  viewOnce?: boolean;
  viewOnceOpenedAt?: string | null;
  replyTo?: ReplyPreview | null;
  reactions?: ReactionSummary[];
  createdAt: string;
}

function safeSend(socket: WebSocket, payload: unknown): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  try {
    socket.send(JSON.stringify(payload));
  } catch {
    // ignore broken-pipe errors
  }
}

export function sendToUser(userId: string, payload: unknown): number {
  const set = connections.get(userId);
  if (!set || set.size === 0) return 0;
  let delivered = 0;
  for (const socket of set) {
    if (socket.readyState === WebSocket.OPEN) {
      safeSend(socket, payload);
      delivered += 1;
    }
  }
  return delivered;
}

export function isUserConnected(userId: string): boolean {
  const set = connections.get(userId);
  if (!set) return false;
  for (const socket of set) {
    if (socket.readyState === WebSocket.OPEN) return true;
  }
  return false;
}

/** Notify everyone who shares a chat with this user about online/offline. */
export async function broadcastPresence(
  userId: string,
  online: boolean,
): Promise<void> {
  const now = new Date();
  if (!online) {
    await prisma.user
      .update({ where: { id: userId }, data: { lastSeenAt: now } })
      .catch(() => undefined);
  } else {
    await prisma.user
      .update({ where: { id: userId }, data: { lastSeenAt: now } })
      .catch(() => undefined);
  }
  const memberships = await prisma.chatParticipant.findMany({
    where: { userId },
    select: { chatId: true },
  });
  if (memberships.length === 0) return;
  const peers = await prisma.chatParticipant.findMany({
    where: {
      chatId: { in: memberships.map((m) => m.chatId) },
      userId: { not: userId },
    },
    select: { userId: true },
  });
  const unique = new Set(peers.map((p) => p.userId));
  const payload = {
    type: 'presence',
    userId,
    online,
    lastSeenAt: now.toISOString(),
  };
  for (const peerId of unique) {
    sendToUser(peerId, payload);
  }
}

// ───────────────────────────────────────────────────────────
// Message creation pipeline (shared by HTTP POST and WS)
// ───────────────────────────────────────────────────────────
interface DbMessage {
  id: string;
  chatId: string;
  senderId: string;
  originalText: string;
  originalLanguage: string;
  translatedText: string | null;
  translatedLanguage: string | null;
  isTranslated: boolean;
  mediaUrl?: string | null;
  mediaType?: string | null;
  ciphertext?: string | null;
  ciphertextType?: number | null;
  isE2e?: boolean;
  editedAt?: Date | null;
  deletedAt?: Date | null;
  expiresAt?: Date | null;
  viewOnce?: boolean;
  viewOnceOpenedAt?: Date | null;
  replyToId?: string | null;
  createdAt: Date;
}

export type ReactionSummaryWire = ReactionSummary & { userIds: string[] };

export function summarizeReactions(
  rows: Array<{ emoji: string; userId: string }>,
  meId?: string,
): ReactionSummaryWire[] {
  const map = new Map<string, { count: number; me: boolean; userIds: string[] }>();
  for (const r of rows) {
    const cur = map.get(r.emoji) ?? { count: 0, me: false, userIds: [] };
    cur.count += 1;
    cur.userIds.push(r.userId);
    if (meId && r.userId === meId) cur.me = true;
    map.set(r.emoji, cur);
  }
  return Array.from(map.entries()).map(([emoji, v]) => ({
    emoji,
    count: v.count,
    me: v.me,
    userIds: v.userIds,
  }));
}

export function serializeMessage(
  msg: DbMessage,
  sender: { id: string; username: string; name: string },
  opts?: {
    reactions?: ReactionSummary[];
    replyTo?: ReplyPreview | null;
    viewerId?: string;
    /** Per-viewer group envelope (fan-out). */
    ciphertextOverride?: string | null;
    ciphertextTypeOverride?: number | null;
  },
): WsMessagePayload {
  if (msg.deletedAt) {
    return {
      id: msg.id,
      chatId: msg.chatId,
      senderId: msg.senderId,
      sender,
      originalText: 'Mensaje eliminado',
      originalLanguage: msg.originalLanguage,
      translatedText: 'Mensaje eliminado',
      translatedLanguage: null,
      isTranslated: false,
      mediaUrl: null,
      mediaType: null,
      editedAt: null,
      deletedAt: msg.deletedAt.toISOString(),
      expiresAt: msg.expiresAt ? msg.expiresAt.toISOString() : null,
      viewOnce: Boolean(msg.viewOnce),
      viewOnceOpenedAt: msg.viewOnceOpenedAt
        ? msg.viewOnceOpenedAt.toISOString()
        : null,
      replyTo: null,
      reactions: [],
      createdAt: msg.createdAt.toISOString(),
    };
  }
  const isE2e = Boolean(msg.isE2e);
  const placeholder = isE2e ? '🔒 Mensaje cifrado' : msg.originalText;
  const isViewerSender =
    Boolean(opts?.viewerId) && opts!.viewerId === msg.senderId;
  // Receptor: sin media hasta abrir. Emisor: puede ver lo que envió.
  const viewOnceLocked =
    Boolean(msg.viewOnce) &&
    !msg.viewOnceOpenedAt &&
    !msg.deletedAt &&
    !isViewerSender;
  return {
    id: msg.id,
    chatId: msg.chatId,
    senderId: msg.senderId,
    sender,
    originalText: isE2e ? placeholder : msg.originalText,
    originalLanguage: msg.originalLanguage,
    translatedText: isE2e
      ? placeholder
      : (msg.translatedText ?? msg.originalText),
    translatedLanguage: isE2e ? null : msg.translatedLanguage,
    isTranslated: isE2e ? false : msg.isTranslated,
    mediaUrl: viewOnceLocked ? null : msg.mediaUrl ?? null,
    mediaType: msg.mediaType ?? null,
    ciphertext:
      opts?.ciphertextOverride !== undefined
        ? opts.ciphertextOverride
        : msg.ciphertext ?? null,
    ciphertextType:
      opts?.ciphertextTypeOverride !== undefined
        ? opts.ciphertextTypeOverride
        : msg.ciphertextType ?? null,
    isE2e,
    editedAt: msg.editedAt ? msg.editedAt.toISOString() : null,
    deletedAt: null,
    expiresAt: msg.expiresAt ? msg.expiresAt.toISOString() : null,
    viewOnce: Boolean(msg.viewOnce),
    viewOnceOpenedAt: msg.viewOnceOpenedAt
      ? msg.viewOnceOpenedAt.toISOString()
      : null,
    replyTo: opts?.replyTo ?? null,
    reactions: opts?.reactions ?? [],
    createdAt: msg.createdAt.toISOString(),
  };
}

/** Broadcast a payload to every participant of a chat. */
export async function broadcastToChat(chatId: string, payload: unknown): Promise<void> {
  const participants = await prisma.chatParticipant.findMany({
    where: { chatId },
    select: { userId: true },
  });
  for (const p of participants) {
    sendToUser(p.userId, payload);
  }
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Full message pipeline:
 *   1. Verify sender is a participant of the chat
 *   2. Detect language (v1: sender's preferredLanguage)
 *   3. Save original message
 *   4. Translate to each recipient's preferredLanguage via DeepL
 *   5. Store a canonical translation on the message row
 *   6. Broadcast to all participants over WebSocket (per-recipient translation)
 *
 * Returns the saved message (with sender info) for HTTP responses.
 */
function computeExpiresAt(
  chat: {
    disappearHours: number;
    disappearText: boolean;
    disappearImage: boolean;
    disappearAudio: boolean;
  },
  mediaType?: string | null,
): Date | null {
  const hours = chat.disappearHours;
  if (![1, 6, 12, 24].includes(hours)) return null;
  const kind =
    mediaType === 'image'
      ? 'image'
      : mediaType === 'audio'
        ? 'audio'
        : 'text';
  if (kind === 'text' && !chat.disappearText) return null;
  if (kind === 'image' && !chat.disappearImage) return null;
  if (kind === 'audio' && !chat.disappearAudio) return null;
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

export type RecipientEnvelope = {
  recipientUserId: string;
  ciphertext: string;
  ciphertextType?: number;
};

export async function createAndBroadcastMessage(
  chatId: string,
  senderId: string,
  text: string,
  media?: {
    mediaUrl?: string | null;
    mediaType?: string | null;
    replyToId?: string | null;
    ciphertext?: string | null;
    ciphertextType?: number | null;
    viewOnce?: boolean;
    /** Group E2E: one libsignal envelope per other member (≤49). */
    recipientEnvelopes?: RecipientEnvelope[];
  },
): Promise<{ message: WsMessagePayload; raw: DbMessage }> {
  const fanout = Array.isArray(media?.recipientEnvelopes)
    ? media!.recipientEnvelopes!.filter(
        (e) =>
          typeof e?.recipientUserId === 'string' &&
          typeof e?.ciphertext === 'string' &&
          e.ciphertext.trim().length >= 16,
      )
    : [];
  const hasCipher =
    (typeof media?.ciphertext === 'string' && media.ciphertext.trim().length > 0) ||
    fanout.length > 0;

  if (!hasCipher && (typeof text !== 'string' || !text.trim())) {
    throw new HttpError(400, 'text is required and must be non-empty');
  }

  // 1. Load chat + participants + verify membership
  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    include: {
      participants: {
        include: { user: true },
      },
    },
  });
  if (!chat) {
    throw new HttpError(404, 'Chat not found');
  }

  const senderParticipant = chat.participants.find((p) => p.userId === senderId);
  if (!senderParticipant) {
    throw new HttpError(403, 'You are not a participant of this chat');
  }

  const sender = senderParticipant.user;
  const e2eMode = chat.encryptionMode === 'e2e';

  if (e2eMode && !hasCipher) {
    throw new HttpError(400, PRIVATE_PLAINTEXT_FORBIDDEN);
  }
  // Private chats must not put readable body on the wire either.
  if (e2eMode && typeof text === 'string' && text.trim().length > 0) {
    throw new HttpError(
      400,
      'Chat Privado: no envíes texto en claro. Solo ciphertext.',
    );
  }

  // Hint only — DeepL auto-detect overrides when possible.
  const languageHint = normalizeLanguageCode(sender.preferredLanguage);

  let replyPreview: ReplyPreview | null = null;
  let replyToId: string | null = null;
  if (media?.replyToId) {
    const parent = await prisma.message.findFirst({
      where: { id: media.replyToId, chatId },
      include: { sender: { select: { name: true } } },
    });
    if (parent && !parent.deletedAt) {
      replyToId = parent.id;
      replyPreview = {
        id: parent.id,
        senderName: parent.sender.name,
        text: parent.isE2e
          ? '🔒 Mensaje cifrado'
          : (parent.originalText || '').slice(0, 140),
      };
    }
  }

  const recipients = chat.participants.filter((p) => p.userId !== senderId);

  const expiresAt = computeExpiresAt(chat, media?.mediaType);
  const viewOnce = Boolean(media?.viewOnce) &&
    (media?.mediaType === 'image' || media?.mediaType === 'audio');

  // Private path: opaque envelope only — never translate / never keep plaintext.
  if (e2eMode && hasCipher) {
    const isGroup = chat.type === 'group';
    if (isGroup && fanout.length > 0) {
      const memberIds = new Set(chat.participants.map((p) => p.userId));
      const others = chat.participants.filter((p) => p.userId !== senderId);
      if (others.length > 49) {
        throw new HttpError(400, 'Grupo Privado: máximo 50 miembros (incl. tú)');
      }
      for (const e of fanout) {
        if (!memberIds.has(e.recipientUserId) || e.recipientUserId === senderId) {
          throw new HttpError(400, 'Sobre de grupo para destinatario inválido');
        }
      }
      const byRecipient = new Map(
        fanout.map((e) => [
          e.recipientUserId,
          {
            ciphertext: e.ciphertext.trim(),
            ciphertextType:
              typeof e.ciphertextType === 'number' ? e.ciphertextType : 3,
          },
        ]),
      );
      for (const o of others) {
        if (!byRecipient.has(o.userId)) {
          throw new HttpError(
            400,
            'Grupo Privado: falta el sobre cifrado para un miembro',
          );
        }
      }
    }

    const primaryCipher =
      typeof media?.ciphertext === 'string' && media.ciphertext.trim().length >= 16
        ? media.ciphertext.trim()
        : fanout[0]?.ciphertext.trim() || '';
    const primaryType =
      typeof media?.ciphertextType === 'number'
        ? media.ciphertextType
        : typeof fanout[0]?.ciphertextType === 'number'
          ? fanout[0]!.ciphertextType!
          : 3;

    let envelope;
    try {
      envelope = buildPrivateMessageDbFields(
        {
          ciphertext: primaryCipher,
          ciphertextType: primaryType,
          mediaUrl: media?.mediaUrl || null,
          mediaType: media?.mediaType || null,
          replyToId,
          expiresAt,
          viewOnce,
          originalLanguage: toAppLang(languageHint),
        },
        text, // ignored — must never land in originalText
      );
    } catch (e) {
      throw new HttpError(
        400,
        e instanceof Error ? e.message : 'Sobre privado inválido',
      );
    }

    const message: DbMessage = await prisma.message.create({
      data: {
        chatId,
        senderId,
        ...envelope,
      },
    });
    assertPrivateRowOpaque(message, typeof text === 'string' ? text : undefined);

    if (fanout.length > 0) {
      await prisma.messageRecipientCipher.createMany({
        data: fanout.map((e) => ({
          messageId: message.id,
          recipientUserId: e.recipientUserId,
          ciphertext: e.ciphertext.trim(),
          ciphertextType:
            typeof e.ciphertextType === 'number' ? e.ciphertextType : 3,
        })),
      });
    }

    await prisma.chat
      .update({ where: { id: chatId }, data: { updatedAt: new Date() } })
      .catch(() => undefined);

    const senderInfo = {
      id: sender.id,
      username: sender.username,
      name: sender.name,
    };
    const deliveryRows =
      fanout.length > 0
        ? await prisma.messageRecipientCipher.findMany({
            where: { messageId: message.id },
          })
        : [];
    const deliveryMap = new Map(
      deliveryRows.map((d) => [d.recipientUserId, d]),
    );

    let senderWire: WsMessagePayload | null = null;
    for (const participant of chat.participants) {
      const del = deliveryMap.get(participant.userId);
      const wire = serializeMessage(message, senderInfo, {
        replyTo: replyPreview,
        viewerId: participant.userId,
        ciphertextOverride: del ? del.ciphertext : message.ciphertext,
        ciphertextTypeOverride: del ? del.ciphertextType : message.ciphertextType,
      });
      if (participant.userId === senderId) senderWire = wire;
      sendToUser(participant.userId, {
        type: 'message',
        chatId,
        message: wire,
      });
    }
    void pushToUserTokens(
      recipients.map((r) => (r.user as { pushToken?: string | null }).pushToken),
      sender.name || sender.username,
      viewOnce
        ? media?.mediaType === 'audio'
          ? '🎵 Audio · una vez'
          : '📷 Foto · una vez'
        : '🔒 Mensaje cifrado',
      { type: 'message', chatId, senderId },
    ).catch(() => undefined);
    return {
      message:
        senderWire ||
        serializeMessage(message, senderInfo, {
          replyTo: replyPreview,
          viewerId: senderId,
        }),
      raw: message,
    };
  }

  // Glossary for the sender (protect brand/names during MT).
  const glossaryRows = await prisma.glossaryEntry.findMany({
    where: { userId: senderId },
    select: { source: true, target: true },
    take: 100,
  });

  // Skip DeepL for pure media captions that are short placeholders.
  const skipTranslate =
    Boolean(media?.mediaUrl) &&
    /^(📷|📄|🎵|📍|👤|↪)/.test(text.trim());

  // 3. Recipients + translation (auto-detect source language).
  const recipientLanguages = recipients.map((r) =>
    normalizeLanguageCode(r.user.preferredLanguage),
  );

  let translationMap = new Map<string, string>();
  let detectedSource = languageHint;
  if (!skipTranslate && recipientLanguages.length > 0) {
    try {
      await consumeTranslation(senderId);
    } catch (err) {
      if (err instanceof PlanLimitError) {
        throw new HttpError(err.status, err.message);
      }
      throw err;
    }
    const result = await translateForRecipients(
      text,
      recipientLanguages,
      languageHint,
      glossaryRows,
    );
    translationMap = result.map;
    detectedSource = result.detectedSource || languageHint;
  }

  const originalLanguage = detectedSource;

  // 4. Save original message with detected language
  const message: DbMessage = await prisma.message.create({
    data: {
      chatId,
      senderId,
      originalText: text,
      originalLanguage: toAppLang(originalLanguage),
      translatedText: null,
      translatedLanguage: null,
      isTranslated: false,
      mediaUrl: media?.mediaUrl || null,
      mediaType: media?.mediaType || null,
      replyToId,
      isE2e: false,
      expiresAt,
      viewOnce,
    },
  });

  // Pick a canonical translation to persist on the message row.
  let storedTranslation: { text: string; language: string } | null = null;
  if (recipientLanguages.length > 0) {
    const canonicalLang = recipientLanguages[0];
    const canonicalText = translationMap.get(canonicalLang);
    if (canonicalText && canonicalText !== text) {
      storedTranslation = {
        text: canonicalText,
        language: toAppLang(canonicalLang),
      };
    }
  }

  // 5. Update the message with the canonical translation
  let updatedMessage: DbMessage = message;
  if (storedTranslation) {
    updatedMessage = await prisma.message.update({
      where: { id: message.id },
      data: {
        translatedText: storedTranslation.text,
        translatedLanguage: storedTranslation.language,
        isTranslated: true,
      },
    });
  }

  // Bump chat.updatedAt so the chat list reorders correctly
  await prisma.chat.update({
    where: { id: chatId },
    data: { updatedAt: new Date() },
  }).catch(() => {
    // non-fatal
  });

  // 7. Broadcast to all participants (per-recipient translation)
  const senderInfo = {
    id: sender.id,
    username: sender.username,
    name: sender.name,
  };

  for (const participant of chat.participants) {
    const isSender = participant.userId === senderId;
    const lang = normalizeLanguageCode(participant.user.preferredLanguage);

    let translatedText: string;
    let translatedLanguage: string | null;
    let isTranslated: boolean;

    if (isSender) {
      // Sender always sees their original text
      translatedText = updatedMessage.originalText;
      translatedLanguage = null;
      isTranslated = false;
    } else {
      const t =
        translationMap.get(lang) ??
        translationMap.get(normalizeLanguageCode(lang));
      if (t && t !== updatedMessage.originalText) {
        translatedText = t;
        translatedLanguage = toAppLang(lang);
        isTranslated = true;
      } else {
        // No translation available (same language as sender, or translation failed)
        translatedText = updatedMessage.originalText;
        translatedLanguage = null;
        isTranslated = false;
      }
    }

    const base = serializeMessage(updatedMessage, senderInfo, {
      replyTo: replyPreview,
      viewerId: participant.userId,
    });
    const perRecipientMessage: WsMessagePayload = {
      ...base,
      originalText: updatedMessage.originalText,
      originalLanguage: updatedMessage.originalLanguage,
      translatedText,
      translatedLanguage,
      isTranslated,
    };

    sendToUser(participant.userId, {
      type: 'message',
      chatId,
      message: perRecipientMessage,
    });
  }

  // 8. Push to recipients (even if app is backgrounded / WS down).
  const pushJobs = recipients.map((r) => {
    const lang = normalizeLanguageCode(r.user.preferredLanguage);
    const body =
      (translationMap.get(lang) && translationMap.get(lang) !== text
        ? translationMap.get(lang)
        : text) || text;
    const preview = viewOnce
      ? media?.mediaType === 'audio'
        ? '🎵 Audio · una vez'
        : '📷 Foto · una vez'
      : media?.mediaType === 'image'
        ? '📷 Foto'
        : media?.mediaType === 'audio'
          ? '🎵 Audio'
          : media?.mediaType === 'file'
            ? '📄 Archivo'
            : body;
    return pushToUserTokens(
      [(r.user as { pushToken?: string | null }).pushToken],
      sender.name || sender.username,
      preview.slice(0, 160),
      { type: 'message', chatId, senderId },
    );
  });
  void Promise.all(pushJobs).catch(() => undefined);

  void import('../bots/notify')
    .then(({ enqueueBotUpdatesForMessage }) =>
      enqueueBotUpdatesForMessage({
        chatId,
        messageId: updatedMessage.id,
        senderId,
        text: updatedMessage.originalText || text,
        isE2e: false,
      }),
    )
    .catch(() => undefined);

  return {
    message: serializeMessage(updatedMessage, senderInfo, {
      replyTo: replyPreview,
      viewerId: senderId,
    }),
    raw: updatedMessage,
  };
}

// ───────────────────────────────────────────────────────────
// WebSocket server setup
// ───────────────────────────────────────────────────────────
interface ClientIncoming {
  type: string;
  chatId?: unknown;
  text?: unknown;
  mediaUrl?: unknown;
  mediaType?: unknown;
  replyToId?: unknown;
  viewOnce?: unknown;
  callType?: unknown;
  fromName?: unknown;
  signal?: unknown;
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

async function relayCallEvent(
  userId: string,
  data: ClientIncoming,
  type: 'call_invite' | 'call_accept' | 'call_reject' | 'call_end',
): Promise<void> {
  const chatId = isString(data.chatId) ? data.chatId.trim() : '';
  if (!chatId) return;

  const participants = await prisma.chatParticipant.findMany({
    where: { chatId },
    select: { userId: true },
  });
  const me = participants.find((p) => p.userId === userId);
  if (!me) return;

  const callType =
    data.callType === 'video' || data.callType === 'voice'
      ? data.callType
      : 'voice';
  const fromName = isString(data.fromName) ? data.fromName : undefined;

  const {
    mintCallRoom,
    rememberCallRoom,
    getRememberedCallRoom,
    clearCallRoom,
  } = await import('../calls/config');

  let callRoom: string | undefined;
  if (type === 'call_invite') {
    callRoom = mintCallRoom();
    rememberCallRoom(chatId, callRoom);
  } else if (type === 'call_accept') {
    callRoom = getRememberedCallRoom(chatId) || mintCallRoom();
    rememberCallRoom(chatId, callRoom);
  } else if (type === 'call_end' || type === 'call_reject') {
    clearCallRoom(chatId);
  } else {
    callRoom = getRememberedCallRoom(chatId) || undefined;
  }

  // Caller needs the opaque room too (invite/accept).
  if (callRoom && (type === 'call_invite' || type === 'call_accept')) {
    sendToUser(userId, {
      type: 'call_room',
      chatId,
      callRoom,
      callType,
    });
  }

  let peerDelivered = 0;
  const peerIds: string[] = [];
  for (const p of participants) {
    if (p.userId === userId) continue;
    peerIds.push(p.userId);
    peerDelivered += sendToUser(p.userId, {
      type,
      chatId,
      fromUserId: userId,
      fromName,
      callType,
      ...(callRoom ? { callRoom } : {}),
    });
  }

  if (type === 'call_invite') {
    const peerOnline =
      peerDelivered > 0 || peerIds.some((id) => isUserConnected(id));
    // HTTP fallback inbox so callee still sees the ring if WS is down.
    if (callRoom) {
      const { putPendingCall } = await import('../calls/pending');
      for (const peerId of peerIds) {
        putPendingCall({
          chatId,
          fromUserId: userId,
          fromName,
          toUserId: peerId,
          callType,
          callRoom,
        });
      }
    }
    // Tell caller immediately if the peer has a live Synap WS.
    sendToUser(userId, {
      type: 'call_ringing',
      chatId,
      callRoom,
      callType,
      peerOnline,
    });

    const others = await prisma.user.findMany({
      where: { id: { in: peerIds } },
      select: { pushToken: true },
    });
    void pushToUserTokens(
      others.map((u) => u.pushToken),
      fromName || 'Synap',
      callType === 'video' ? 'Videollamada entrante' : 'Llamada entrante',
      {
        type: 'call_invite',
        chatId,
        callType,
        ...(callRoom ? { callRoom } : {}),
        ...(fromName ? { fromName } : {}),
      },
    );
  }
}

function handleIncomingMessage(socket: WebSocket, userId: string, data: ClientIncoming): void {
  if (!data || typeof data.type !== 'string') return;

  if (data.type === 'message') {
    const chatId = isString(data.chatId) ? data.chatId.trim() : '';
    const text = isString(data.text) ? data.text : '';
    const mediaUrl = isString(data.mediaUrl) ? data.mediaUrl : undefined;
    const mediaType = isString(data.mediaType) ? data.mediaType : undefined;
    const replyToId = isString(data.replyToId) ? data.replyToId : undefined;
    const viewOnce = data.viewOnce === true;

    if (!chatId || !text.trim()) return;

    createAndBroadcastMessage(chatId, userId, text, {
      mediaUrl,
      mediaType,
      replyToId,
      viewOnce,
    }).catch((err) => {
      // Send error back to the client if it's an HttpError
      const status = err?.status ?? 500;
      const message = err?.message ?? 'Internal error';
      safeSend(socket, {
        type: 'error',
        status,
        message,
        chatId,
      });
    });
    return;
  }

  if (data.type === 'typing' || data.type === 'typing_stop') {
    const chatId = isString(data.chatId) ? data.chatId.trim() : '';
    if (!chatId) return;
    void (async () => {
      const participants = await prisma.chatParticipant.findMany({
        where: { chatId },
        select: { userId: true },
      });
      if (!participants.some((p) => p.userId === userId)) return;
      for (const p of participants) {
        if (p.userId === userId) continue;
        sendToUser(p.userId, {
          type: data.type,
          chatId,
          fromUserId: userId,
        });
      }
    })();
    return;
  }

  if (
    data.type === 'call_invite' ||
    data.type === 'call_accept' ||
    data.type === 'call_reject' ||
    data.type === 'call_end'
  ) {
    void relayCallEvent(userId, data, data.type);
    return;
  }

  if (data.type === 'webrtc_signal') {
    const chatId = isString(data.chatId) ? data.chatId.trim() : '';
    if (!chatId || data.signal == null) return;
    let encoded = '';
    try {
      encoded = JSON.stringify(data.signal);
    } catch {
      return;
    }
    if (encoded.length > 16_384) return; // drop oversized SDP/ICE floods
    void (async () => {
      const participants = await prisma.chatParticipant.findMany({
        where: { chatId },
        select: { userId: true },
      });
      if (!participants.some((p) => p.userId === userId)) return;
      for (const p of participants) {
        if (p.userId === userId) continue;
        sendToUser(p.userId, {
          type: 'webrtc_signal',
          chatId,
          fromUserId: userId,
          signal: data.signal,
        });
      }
    })();
    return;
  }

  if (data.type === 'ping') {
    safeSend(socket, { type: 'pong' });
    return;
  }
}

/**
 * Attach a WebSocket server to an existing HTTP server.
 * Clients connect to ws://host:PORT/ws?token=JWT
 */
export function attachWebSocketServer(server: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    let pathname = '';
    try {
      pathname = new URL(req.url || '', 'http://localhost').pathname;
    } catch {
      pathname = '';
    }

    if (pathname !== '/ws') {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (socket, req) => {
    // Parse token from query string
    const url = new URL(req.url || '', 'http://localhost');
    const token = url.searchParams.get('token');

    if (!token) {
      safeSend(socket, { type: 'error', message: 'Missing token' });
      socket.close(4001, 'Missing token');
      return;
    }

    let payload: AuthTokenPayload;
    try {
      payload = verifyToken(token);
    } catch {
      safeSend(socket, { type: 'error', message: 'Invalid or expired token' });
      socket.close(4003, 'Invalid token');
      return;
    }

    const userId = payload.sub;
    if (!userId) {
      socket.close(4003, 'Invalid token');
      return;
    }

    const wasOffline = getUserConnections(userId).size === 0;
    addConnection(userId, socket);
    safeSend(socket, { type: 'connected', userId });
    if (wasOffline) {
      void broadcastPresence(userId, true);
    }

    socket.on('message', (raw) => {
      let data: ClientIncoming;
      try {
        data = JSON.parse(raw.toString());
      } catch {
        safeSend(socket, { type: 'error', message: 'Invalid JSON payload' });
        return;
      }
      handleIncomingMessage(socket, userId, data);
    });

    socket.on('close', () => {
      removeConnection(userId, socket);
      if (getUserConnections(userId).size === 0) {
        void broadcastPresence(userId, false);
      }
    });

    socket.on('error', () => {
      removeConnection(userId, socket);
      if (getUserConnections(userId).size === 0) {
        void broadcastPresence(userId, false);
      }
    });
  });

  return wss;
}
