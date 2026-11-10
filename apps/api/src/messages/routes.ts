import { Router, Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authMiddleware } from '../middleware/auth';
import {
  createAndBroadcastMessage,
  HttpError,
  serializeMessage,
  WsMessagePayload,
} from './websocket';

const router = Router();

router.use(authMiddleware);

// ───────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────
async function ensureParticipant(chatId: string, userId: string): Promise<boolean> {
  const membership = await prisma.chatParticipant.findUnique({
    where: { chatId_userId: { chatId, userId } },
    select: { id: true },
  });
  return membership !== null;
}

interface SerializedMessage extends WsMessagePayload {}

function serializeDbMessage(
  msg: {
    id: string;
    chatId: string;
    senderId: string;
    originalText: string;
    originalLanguage: string;
    translatedText: string | null;
    translatedLanguage: string | null;
    isTranslated: boolean;
    createdAt: Date;
    sender: { id: string; username: string; name: string };
  }
): SerializedMessage {
  return serializeMessage(msg, {
    id: msg.sender.id,
    username: msg.sender.username,
    name: msg.sender.name,
  });
}

// ───────────────────────────────────────────────────────────
// GET /chats/:chatId/messages?page=1&limit=50
// ───────────────────────────────────────────────────────────
router.get('/:chatId/messages', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { chatId } = req.params;
    if (!chatId) {
      res.status(400).json({ error: 'chatId is required' });
      return;
    }

    const isParticipant = await ensureParticipant(chatId, req.user!.id);
    if (!isParticipant) {
      res.status(403).json({ error: 'You are not a participant of this chat' });
      return;
    }

    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? '50'), 10) || 50));

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where: { chatId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          sender: {
            select: { id: true, username: true, name: true },
          },
        },
      }),
      prisma.message.count({ where: { chatId } }),
    ]);

    // Reverse so oldest-first (client usually wants chronological order)
    const ascending = [...messages].reverse();

    res.json({
      messages: ascending.map(serializeDbMessage),
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

// ───────────────────────────────────────────────────────────
// POST /chats/:chatId/messages
// Body: { text }
// ───────────────────────────────────────────────────────────
router.post('/:chatId/messages', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { chatId } = req.params;
    if (!chatId) {
      res.status(400).json({ error: 'chatId is required' });
      return;
    }

    const { text } = (req.body ?? {}) as { text?: unknown };
    if (typeof text !== 'string' || !text.trim()) {
      res.status(400).json({ error: 'text is required and must be non-empty' });
      return;
    }

    const result = await createAndBroadcastMessage(chatId, req.user!.id, text);
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

export default router;
