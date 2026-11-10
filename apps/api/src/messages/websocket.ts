import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { URL } from 'url';
import { prisma } from '../lib/prisma';
import { verifyToken, AuthTokenPayload } from '../lib/jwt';
import {
  translateForRecipients,
  normalizeLanguageCode,
} from '../translation/service';

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

export function sendToUser(userId: string, payload: unknown): void {
  const set = connections.get(userId);
  if (!set) return;
  for (const socket of set) {
    safeSend(socket, payload);
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
  createdAt: Date;
}

export function serializeMessage(msg: DbMessage, sender: { id: string; username: string; name: string }): WsMessagePayload {
  return {
    id: msg.id,
    chatId: msg.chatId,
    senderId: msg.senderId,
    sender,
    originalText: msg.originalText,
    originalLanguage: msg.originalLanguage,
    translatedText: msg.translatedText ?? msg.originalText,
    translatedLanguage: msg.translatedLanguage,
    isTranslated: msg.isTranslated,
    createdAt: msg.createdAt.toISOString(),
  };
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
export async function createAndBroadcastMessage(
  chatId: string,
  senderId: string,
  text: string
): Promise<{ message: WsMessagePayload; raw: DbMessage }> {
  if (typeof text !== 'string' || !text.trim()) {
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
  // 2. Detect language — v1 heuristic: sender's preferredLanguage
  const originalLanguage = normalizeLanguageCode(sender.preferredLanguage);

  // 3. Save original message (translation fields null for now)
  const message: DbMessage = await prisma.message.create({
    data: {
      chatId,
      senderId,
      originalText: text,
      originalLanguage,
      translatedText: null,
      translatedLanguage: null,
      isTranslated: false,
    },
  });

  // 4. Compute distinct recipient languages (everyone except sender)
  const recipients = chat.participants.filter((p) => p.userId !== senderId);
  const recipientLanguages = recipients
    .map((r) => normalizeLanguageCode(r.user.preferredLanguage))
    .filter((lang) => lang !== originalLanguage); // no need to translate sender's own lang

  // 5. Translate to each distinct recipient language
  const translationMap = await translateForRecipients(
    text,
    recipientLanguages,
    originalLanguage
  );

  // Pick a canonical translation to persist on the message row.
  // For single chats this is exactly the other participant's translation.
  let storedTranslation: { text: string; language: string } | null = null;
  if (recipientLanguages.length > 0) {
    const canonicalLang = recipientLanguages[0];
    const canonicalText = translationMap.get(canonicalLang);
    if (canonicalText && canonicalText !== text) {
      storedTranslation = { text: canonicalText, language: canonicalLang };
    }
  }

  // 6. Update the message with the canonical translation
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
      const t = translationMap.get(lang);
      if (t && t !== updatedMessage.originalText) {
        translatedText = t;
        translatedLanguage = lang;
        isTranslated = true;
      } else {
        // No translation available (same language as sender, or translation failed)
        translatedText = updatedMessage.originalText;
        translatedLanguage = null;
        isTranslated = false;
      }
    }

    const perRecipientMessage: WsMessagePayload = {
      id: updatedMessage.id,
      chatId: updatedMessage.chatId,
      senderId: updatedMessage.senderId,
      sender: senderInfo,
      originalText: updatedMessage.originalText,
      originalLanguage: updatedMessage.originalLanguage,
      translatedText,
      translatedLanguage,
      isTranslated,
      createdAt: updatedMessage.createdAt.toISOString(),
    };

    sendToUser(participant.userId, {
      type: 'message',
      chatId,
      message: perRecipientMessage,
    });
  }

  return {
    message: serializeMessage(updatedMessage, senderInfo),
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
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function handleIncomingMessage(socket: WebSocket, userId: string, data: ClientIncoming): void {
  if (!data || typeof data.type !== 'string') return;

  if (data.type === 'message') {
    const chatId = isString(data.chatId) ? data.chatId.trim() : '';
    const text = isString(data.text) ? data.text : '';

    if (!chatId || !text.trim()) return;

    createAndBroadcastMessage(chatId, userId, text).catch((err) => {
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

    addConnection(userId, socket);
    safeSend(socket, { type: 'connected', userId });

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
    });

    socket.on('error', () => {
      removeConnection(userId, socket);
    });
  });

  return wss;
}
