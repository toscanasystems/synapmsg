import { Router, Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authMiddleware } from '../middleware/auth';
import {
  broadcastToChat,
  createAndBroadcastMessage,
  HttpError,
  serializeMessage,
  summarizeReactions,
  WsMessagePayload,
} from './websocket';
import {
  normalizeLanguageCode,
  translateForRecipients,
} from '../translation/service';
import { consumeTranslation, PlanLimitError } from '../billing/usage';

const router = Router();

router.use(authMiddleware);

const EDIT_WINDOW_MS = 48 * 60 * 60 * 1000;
const REACTION_EMOJI = new Set(['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '👏']);

async function ensureParticipant(chatId: string, userId: string): Promise<boolean> {
  const membership = await prisma.chatParticipant.findUnique({
    where: { chatId_userId: { chatId, userId } },
    select: { id: true },
  });
  return membership !== null;
}

type MsgWithRelations = {
  id: string;
  chatId: string;
  senderId: string;
  originalText: string;
  originalLanguage: string;
  translatedText: string | null;
  translatedLanguage: string | null;
  isTranslated: boolean;
  mediaUrl: string | null;
  mediaType: string | null;
  ciphertext: string | null;
  ciphertextType: number | null;
  isE2e: boolean;
  editedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  sender: { id: string; username: string; name: string };
  reactions: Array<{ emoji: string; userId: string }>;
  replyTo?: {
    id: string;
    originalText: string;
    deletedAt: Date | null;
    isE2e?: boolean;
    sender: { name: string };
  } | null;
};

async function serializeDbMessage(
  msg: MsgWithRelations,
  meId: string,
): Promise<WsMessagePayload> {
  const replyTo = msg.replyTo
    ? {
        id: msg.replyTo.id,
        senderName: msg.replyTo.sender.name,
        text: msg.replyTo.deletedAt
          ? 'Mensaje eliminado'
          : msg.replyTo.isE2e
            ? '🔒 Mensaje cifrado'
            : (msg.replyTo.originalText || '').slice(0, 140),
      }
    : null;
  let ciphertextOverride: string | null | undefined;
  let ciphertextTypeOverride: number | null | undefined;
  if (msg.isE2e && meId !== msg.senderId) {
    const del = await prisma.messageRecipientCipher.findUnique({
      where: {
        messageId_recipientUserId: {
          messageId: msg.id,
          recipientUserId: meId,
        },
      },
    });
    if (del) {
      ciphertextOverride = del.ciphertext;
      ciphertextTypeOverride = del.ciphertextType;
    }
  }
  return serializeMessage(
    msg,
    {
      id: msg.sender.id,
      username: msg.sender.username,
      name: msg.sender.name,
    },
    {
      reactions: summarizeReactions(msg.reactions, meId),
      replyTo,
      viewerId: meId,
      ciphertextOverride,
      ciphertextTypeOverride,
    },
  );
}

// GET /chats/:chatId/messages
router.get('/:chatId/messages', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { chatId } = req.params;
    if (!chatId) {
      res.status(400).json({ error: 'chatId is required' });
      return;
    }

    const membership = await prisma.chatParticipant.findUnique({
      where: { chatId_userId: { chatId, userId: req.user!.id } },
      select: { clearedAt: true },
    });
    if (!membership) {
      res.status(403).json({ error: 'You are not a participant of this chat' });
      return;
    }

    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? '50'), 10) || 50));

    const where = {
      chatId,
      ...(membership.clearedAt
        ? { createdAt: { gt: membership.clearedAt } }
        : {}),
    };

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          sender: { select: { id: true, username: true, name: true } },
          reactions: { select: { emoji: true, userId: true } },
          replyTo: {
            select: {
              id: true,
              originalText: true,
              deletedAt: true,
              isE2e: true,
              sender: { select: { name: true } },
            },
          },
        },
      }),
      prisma.message.count({ where }),
    ]);

    const ascending = [...messages].reverse();
    res.json({
      messages: await Promise.all(
        ascending.map((m) => serializeDbMessage(m, req.user!.id)),
      ),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2023') {
      res.status(400).json({ error: 'Invalid chatId' });
      return;
    }
    next(err);
  }
});

// POST /chats/:chatId/messages
router.post('/:chatId/messages', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { chatId } = req.params;
    if (!chatId) {
      res.status(400).json({ error: 'chatId is required' });
      return;
    }

    const {
      text,
      mediaUrl,
      mediaType,
      sendAt,
      replyToId,
      ciphertext,
      ciphertextType,
      viewOnce,
      recipientEnvelopes,
    } = (req.body ?? {}) as {
        text?: unknown;
        mediaUrl?: unknown;
        mediaType?: unknown;
        sendAt?: unknown;
        replyToId?: unknown;
        ciphertext?: unknown;
        ciphertextType?: unknown;
        viewOnce?: unknown;
        recipientEnvelopes?: unknown;
      };
    const envelopes = Array.isArray(recipientEnvelopes)
      ? recipientEnvelopes
          .filter(
            (e): e is { recipientUserId: string; ciphertext: string; ciphertextType?: number } =>
              Boolean(
                e &&
                  typeof e === 'object' &&
                  typeof (e as { recipientUserId?: unknown }).recipientUserId ===
                    'string' &&
                  typeof (e as { ciphertext?: unknown }).ciphertext === 'string',
              ),
          )
          .slice(0, 49)
      : [];
    const hasCipher =
      (typeof ciphertext === 'string' && ciphertext.trim().length > 0) ||
      envelopes.length > 0;
    if (!hasCipher && (typeof text !== 'string' || !text.trim())) {
      res.status(400).json({ error: 'text is required and must be non-empty' });
      return;
    }

    // Optional schedule: sendAt ISO in the future → queue, don't deliver yet.
    if (typeof sendAt === 'string' && sendAt.trim()) {
      const when = new Date(sendAt);
      if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now() + 15_000) {
        res.status(400).json({ error: 'sendAt must be at least ~30s in the future' });
        return;
      }
      if (!(await ensureParticipant(chatId, req.user!.id))) {
        res.status(403).json({ error: 'Not a participant' });
        return;
      }
      // E2E: never queue plaintext on the server (harvest / judicial exposure).
      const chatMode = await prisma.chat.findUnique({
        where: { id: chatId },
        select: { encryptionMode: true },
      });
      if (chatMode?.encryptionMode === 'e2e') {
        res.status(400).json({
          error:
            'En chats Privado no se pueden programar mensajes (el servidor no guarda texto legible).',
        });
        return;
      }
      if (typeof text !== 'string' || !text.trim()) {
        res.status(400).json({ error: 'text is required to schedule' });
        return;
      }
      const scheduled = await prisma.scheduledMessage.create({
        data: {
          chatId,
          senderId: req.user!.id,
          text: text.trim(),
          mediaUrl: typeof mediaUrl === 'string' ? mediaUrl : null,
          mediaType: typeof mediaType === 'string' ? mediaType : null,
          sendAt: when,
        },
      });
      res.status(201).json({
        scheduled: {
          id: scheduled.id,
          chatId: scheduled.chatId,
          sendAt: scheduled.sendAt.toISOString(),
          text: scheduled.text,
        },
      });
      return;
    }

    const result = await createAndBroadcastMessage(
      chatId,
      req.user!.id,
      typeof text === 'string' ? text : '',
      {
        mediaUrl: typeof mediaUrl === 'string' ? mediaUrl : null,
        mediaType: typeof mediaType === 'string' ? mediaType : null,
        replyToId: typeof replyToId === 'string' ? replyToId : null,
        ciphertext:
          typeof ciphertext === 'string' && ciphertext.trim().length > 0
            ? String(ciphertext).trim()
            : null,
        ciphertextType:
          typeof ciphertextType === 'number'
            ? ciphertextType
            : envelopes.length
              ? 3
              : hasCipher
                ? 1
                : null,
        viewOnce: viewOnce === true,
        recipientEnvelopes: envelopes,
      },
    );
    res.status(201).json({ message: result.message });
  } catch (err) {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2023') {
      res.status(400).json({ error: 'Invalid chatId' });
      return;
    }
    next(err);
  }
});

// PATCH /chats/:chatId/messages/:messageId — edit within 48h
router.patch(
  '/:chatId/messages/:messageId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { chatId, messageId } = req.params;
      const { text, ciphertext, ciphertextType, recipientEnvelopes } = (req.body ??
        {}) as {
        text?: unknown;
        ciphertext?: unknown;
        ciphertextType?: unknown;
        recipientEnvelopes?: unknown;
      };
      if (!chatId || !messageId) {
        res.status(400).json({ error: 'chatId and messageId are required' });
        return;
      }

      const msg = await prisma.message.findUnique({
        where: { id: messageId },
        include: {
          sender: {
            select: {
              id: true,
              username: true,
              name: true,
              preferredLanguage: true,
            },
          },
          reactions: { select: { emoji: true, userId: true } },
          chat: { include: { participants: { include: { user: true } } } },
        },
      });
      if (!msg || msg.chatId !== chatId) {
        res.status(404).json({ error: 'Message not found' });
        return;
      }
      if (msg.senderId !== req.user!.id) {
        res.status(403).json({ error: 'Only the sender can edit this message' });
        return;
      }
      if (msg.deletedAt) {
        res.status(400).json({ error: 'Cannot edit a deleted message' });
        return;
      }
      if (Date.now() - msg.createdAt.getTime() > EDIT_WINDOW_MS) {
        res.status(400).json({ error: 'Edit window is 48 hours' });
        return;
      }

      const e2eEdit = msg.isE2e || msg.chat.encryptionMode === 'e2e';
      const envelopes = Array.isArray(recipientEnvelopes)
        ? recipientEnvelopes
            .filter(
              (
                e,
              ): e is {
                recipientUserId: string;
                ciphertext: string;
                ciphertextType?: number;
              } =>
                Boolean(
                  e &&
                    typeof e === 'object' &&
                    typeof (e as { recipientUserId?: unknown }).recipientUserId ===
                      'string' &&
                    typeof (e as { ciphertext?: unknown }).ciphertext === 'string',
                ),
            )
            .slice(0, 49)
        : [];
      const hasCipher =
        typeof ciphertext === 'string' && ciphertext.trim().length >= 16;

      if (e2eEdit) {
        if (!hasCipher && envelopes.length === 0) {
          res.status(400).json({
            error:
              'Edición Privada: envía ciphertext (o recipientEnvelopes), no texto plano.',
          });
          return;
        }
        const primary =
          hasCipher
            ? String(ciphertext).trim()
            : envelopes[0]!.ciphertext.trim();
        const primaryType =
          typeof ciphertextType === 'number'
            ? ciphertextType
            : typeof envelopes[0]?.ciphertextType === 'number'
              ? envelopes[0]!.ciphertextType!
              : 3;
        const updated = await prisma.message.update({
          where: { id: messageId },
          data: {
            originalText: '',
            translatedText: null,
            isTranslated: false,
            ciphertext: primary,
            ciphertextType: primaryType,
            isE2e: true,
            editedAt: new Date(),
          },
          include: {
            sender: { select: { id: true, username: true, name: true } },
            reactions: { select: { emoji: true, userId: true } },
          },
        });
        if (envelopes.length > 0) {
          await prisma.messageRecipientCipher.deleteMany({
            where: { messageId },
          });
          await prisma.messageRecipientCipher.createMany({
            data: envelopes.map((e) => ({
              messageId,
              recipientUserId: e.recipientUserId,
              ciphertext: e.ciphertext.trim(),
              ciphertextType:
                typeof e.ciphertextType === 'number' ? e.ciphertextType : 3,
            })),
          });
        }
        const wire = await serializeDbMessage(updated, req.user!.id);
        const { sendToUser } = await import('./websocket');
        for (const part of msg.chat.participants) {
          const viewerWire = await serializeDbMessage(updated, part.userId);
          sendToUser(part.userId, {
            type: 'message_edited',
            chatId,
            message: viewerWire,
          });
        }
        res.json({ message: wire });
        return;
      }

      if (typeof text !== 'string' || !text.trim()) {
        res.status(400).json({ error: 'text is required' });
        return;
      }

      const trimmed = text.trim();
      const senderLangHint = normalizeLanguageCode(
        msg.sender?.preferredLanguage || msg.originalLanguage,
      );
      const recipients = msg.chat.participants.filter((p) => p.userId !== req.user!.id);
      const recipientLanguages = recipients.map((r) =>
        normalizeLanguageCode(r.user.preferredLanguage),
      );

      const glossaryRows = await prisma.glossaryEntry.findMany({
        where: { userId: req.user!.id },
        select: { source: true, target: true },
        take: 100,
      });
      if (recipientLanguages.length > 0) {
        try {
          await consumeTranslation(req.user!.id);
        } catch (err) {
          if (err instanceof PlanLimitError) {
            res.status(err.status).json({ error: err.message, code: err.code });
            return;
          }
          throw err;
        }
      }
      const { map: translationMap, detectedSource } = await translateForRecipients(
        trimmed,
        recipientLanguages,
        senderLangHint,
        glossaryRows,
      );
      let translatedText: string | null = null;
      let translatedLanguage: string | null = null;
      let isTranslated = false;
      if (recipientLanguages[0]) {
        const t = translationMap.get(recipientLanguages[0]);
        if (t && t !== trimmed) {
          translatedText = t;
          translatedLanguage = recipientLanguages[0].toLowerCase();
          isTranslated = true;
        }
      }
      const detectedLang = (detectedSource || msg.originalLanguage).toLowerCase();

      const updated = await prisma.message.update({
        where: { id: messageId },
        data: {
          originalText: trimmed,
          originalLanguage: detectedLang,
          translatedText,
          translatedLanguage,
          isTranslated,
          editedAt: new Date(),
        },
        include: {
          sender: { select: { id: true, username: true, name: true } },
          reactions: { select: { emoji: true, userId: true } },
        },
      });

      const editedWire = await serializeDbMessage(updated, req.user!.id);
      const payload = {
        type: 'message_edited',
        chatId,
        message: editedWire,
      };
      await broadcastToChat(chatId, payload);
      res.json({ message: editedWire });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /chats/:chatId/messages/:messageId — soft-delete own message
router.delete(
  '/:chatId/messages/:messageId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { chatId, messageId } = req.params;
      if (!chatId || !messageId) {
        res.status(400).json({ error: 'chatId and messageId are required' });
        return;
      }
      const msg = await prisma.message.findUnique({
        where: { id: messageId },
        include: {
          sender: { select: { id: true, username: true, name: true } },
          reactions: { select: { emoji: true, userId: true } },
        },
      });
      if (!msg || msg.chatId !== chatId) {
        res.status(404).json({ error: 'Message not found' });
        return;
      }
      if (msg.senderId !== req.user!.id) {
        res.status(403).json({ error: 'Only the sender can delete this message' });
        return;
      }
      if (msg.deletedAt) {
        res.json({ message: await serializeDbMessage(msg, req.user!.id) });
        return;
      }
      const updated = await prisma.message.update({
        where: { id: messageId },
        data: {
          deletedAt: new Date(),
          mediaUrl: null,
          mediaType: null,
          originalText: '',
          translatedText: null,
          isTranslated: false,
        },
        include: {
          sender: { select: { id: true, username: true, name: true } },
          reactions: { select: { emoji: true, userId: true } },
        },
      });
      await prisma.messageReaction.deleteMany({ where: { messageId } });
      const deletedWire = await serializeDbMessage(
        { ...updated, reactions: [] },
        req.user!.id,
      );
      const payload = {
        type: 'message_deleted',
        chatId,
        message: deletedWire,
      };
      await broadcastToChat(chatId, payload);
      res.json({ message: deletedWire });
    } catch (err) {
      next(err);
    }
  },
);

// POST /chats/:chatId/messages/:messageId/reactions { emoji }
router.post(
  '/:chatId/messages/:messageId/reactions',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { chatId, messageId } = req.params;
      const { emoji } = (req.body ?? {}) as { emoji?: unknown };
      if (!chatId || !messageId) {
        res.status(400).json({ error: 'chatId and messageId are required' });
        return;
      }
      if (typeof emoji !== 'string' || !REACTION_EMOJI.has(emoji)) {
        res.status(400).json({
          error: `emoji must be one of: ${[...REACTION_EMOJI].join(' ')}`,
        });
        return;
      }
      if (!(await ensureParticipant(chatId, req.user!.id))) {
        res.status(403).json({ error: 'Not a participant' });
        return;
      }

      const msg = await prisma.message.findFirst({
        where: { id: messageId, chatId },
        select: { id: true, deletedAt: true },
      });
      if (!msg) {
        res.status(404).json({ error: 'Message not found' });
        return;
      }
      if (msg.deletedAt) {
        res.status(400).json({ error: 'Cannot react to a deleted message' });
        return;
      }

      const existing = await prisma.messageReaction.findUnique({
        where: {
          messageId_userId: { messageId, userId: req.user!.id },
        },
      });

      if (existing && existing.emoji === emoji) {
        await prisma.messageReaction.delete({ where: { id: existing.id } });
      } else if (existing) {
        await prisma.messageReaction.update({
          where: { id: existing.id },
          data: { emoji },
        });
      } else {
        await prisma.messageReaction.create({
          data: { messageId, userId: req.user!.id, emoji },
        });
      }

      const reactions = await prisma.messageReaction.findMany({
        where: { messageId },
        select: { emoji: true, userId: true },
      });
      const summary = summarizeReactions(reactions, req.user!.id);
      await broadcastToChat(chatId, {
        type: 'reaction_updated',
        chatId,
        messageId,
        reactions: summary,
      });
      res.json({ reactions: summary });
    } catch (err) {
      next(err);
    }
  },
);

// POST /chats/:chatId/messages/:messageId/view-once
// Abre foto/audio de una sola vez → entrega media y luego destruye para ambos.
router.post(
  '/:chatId/messages/:messageId/view-once',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { chatId, messageId } = req.params;
      if (!chatId || !messageId) {
        res.status(400).json({ error: 'chatId and messageId are required' });
        return;
      }
      if (!(await ensureParticipant(chatId, req.user!.id))) {
        res.status(403).json({ error: 'Not a participant' });
        return;
      }
      const msg = await prisma.message.findFirst({
        where: { id: messageId, chatId, deletedAt: null },
        include: {
          sender: { select: { id: true, username: true, name: true } },
        },
      });
      if (!msg || !msg.viewOnce) {
        res.status(404).json({ error: 'View-once message not found' });
        return;
      }
      if (msg.viewOnceOpenedAt) {
        res.status(410).json({ error: 'Ya fue abierto' });
        return;
      }
      // Emisor ya conoce el media; no destruye al "abrir".
      if (msg.senderId === req.user!.id) {
        res.json({
          ok: true,
          mediaUrl: msg.mediaUrl,
          mediaType: msg.mediaType,
          messageId: msg.id,
        });
        return;
      }
      const mediaUrl = msg.mediaUrl;
      const mediaType = msg.mediaType;
      const now = new Date();
      // Entregar una vez y destruir en ambos lados.
      await prisma.message.update({
        where: { id: msg.id },
        data: {
          viewOnceOpenedAt: now,
          deletedAt: now,
          mediaUrl: null,
          originalText: '',
          translatedText: null,
          ciphertext: null,
        },
      });
      const wire = serializeMessage(
        { ...msg, viewOnceOpenedAt: now, deletedAt: now, mediaUrl: null },
        msg.sender,
      );
      await broadcastToChat(chatId, {
        type: 'message_deleted',
        chatId,
        reason: 'view_once',
        message: wire,
      });
      res.json({
        ok: true,
        mediaUrl,
        mediaType,
        messageId: msg.id,
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
