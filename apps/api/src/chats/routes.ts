import { Router, Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authMiddleware } from '../middleware/auth';
import { serializeUser } from '../auth/routes';

const router = Router();

router.use(authMiddleware);

// ───────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────
interface ChatWithPreview {
  id: string;
  type: 'single' | 'group';
  createdAt: string;
  updatedAt: string;
  participants: Array<{
    id: string;
    userId: string;
    role: 'admin' | 'member';
    joinedAt: string;
    user: ReturnType<typeof serializeUser>;
  }>;
  lastMessage?: {
    id: string;
    text: string;
    senderId: string;
    createdAt: string;
  } | null;
}

async function buildChatPreview(chatId: string): Promise<ChatWithPreview | null> {
  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    include: {
      participants: {
        include: {
          user: true,
        },
        orderBy: { joinedAt: 'asc' },
      },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          id: true,
          originalText: true,
          senderId: true,
          createdAt: true,
        },
      },
    },
  });
  if (!chat) return null;

  const last = chat.messages[0];
  return {
    id: chat.id,
    type: chat.type,
    createdAt: chat.createdAt.toISOString(),
    updatedAt: chat.updatedAt.toISOString(),
    participants: chat.participants.map((p) => ({
      id: p.id,
      userId: p.userId,
      role: p.role,
      joinedAt: p.joinedAt.toISOString(),
      user: serializeUser(p.user),
    })),
    lastMessage: last
      ? {
          id: last.id,
          text: last.originalText,
          senderId: last.senderId,
          createdAt: last.createdAt.toISOString(),
        }
      : null,
  };
}

// ───────────────────────────────────────────────────────────
// GET /chats — list chats the user is part of, with last message preview
// ───────────────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const chats = await prisma.chat.findMany({
      where: {
        participants: { some: { userId: req.user!.id } },
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });

    const previews = (await Promise.all(chats.map((c) => buildChatPreview(c.id)))).filter(
      (c): c is ChatWithPreview => c !== null
    );

    res.json({ chats: previews });
  } catch (err) {
    next(err);
  }
});

// ───────────────────────────────────────────────────────────
// POST /chats — create or reuse a single chat with participantId
// ───────────────────────────────────────────────────────────
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { participantId } = (req.body ?? {}) as { participantId?: unknown };

    if (typeof participantId !== 'string' || !participantId.trim()) {
      res.status(400).json({ error: 'participantId is required' });
      return;
    }
    if (participantId === req.user!.id) {
      res.status(400).json({ error: 'Cannot create a chat with yourself' });
      return;
    }

    // Ensure the other user exists
    const other = await prisma.user.findUnique({
      where: { id: participantId },
      select: { id: true },
    });
    if (!other) {
      res.status(404).json({ error: 'Participant not found' });
      return;
    }

    // Reuse an existing single chat with exactly these two participants.
    const existing = await prisma.chat.findFirst({
      where: {
        type: 'single',
        AND: [
          { participants: { some: { userId: req.user!.id } } },
          { participants: { some: { userId: participantId } } },
        ],
      },
      include: {
        participants: { include: { user: true } },
      },
    });

    let chatId: string;
    let isNew = false;
    if (existing) {
      chatId = existing.id;
    } else {
      // Create the chat and both participants in a transaction
      const created = await prisma.chat.create({
        data: {
          type: 'single',
          participants: {
            create: [
              { userId: req.user!.id, role: 'admin' },
              { userId: participantId, role: 'member' },
            ],
          },
        },
        include: {
          participants: { include: { user: true } },
        },
      });
      chatId = created.id;
      isNew = true;
    }

    const preview = await buildChatPreview(chatId);
    if (!preview) {
      res.status(500).json({ error: 'Failed to load chat' });
      return;
    }

    res.status(isNew ? 201 : 200).json({ chat: preview });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
      res.status(400).json({ error: 'Invalid participantId' });
      return;
    }
    next(err);
  }
});

// ───────────────────────────────────────────────────────────
// GET /chats/:id — chat detail with participants
// ───────────────────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }

    // Ensure the requesting user is a participant
    const membership = await prisma.chatParticipant.findUnique({
      where: {
        chatId_userId: { chatId: id, userId: req.user!.id },
      },
      select: { id: true },
    });
    if (!membership) {
      res.status(403).json({ error: 'You are not a participant of this chat' });
      return;
    }

    const preview = await buildChatPreview(id);
    if (!preview) {
      res.status(404).json({ error: 'Chat not found' });
      return;
    }

    res.json({ chat: preview, participants: preview.participants });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2023') {
        res.status(400).json({ error: 'Invalid chat id' });
        return;
      }
      if (err.code === 'P2025') {
        res.status(404).json({ error: 'Chat not found' });
        return;
      }
    }
    next(err);
  }
});

export default router;
