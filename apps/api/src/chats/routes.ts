import { Router, Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authMiddleware } from '../middleware/auth';
import { serializeUser } from '../auth/routes';
import {
  broadcastToChat,
  getUserConnections,
} from '../messages/websocket';

const router = Router();

router.use(authMiddleware);

// ───────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────
interface ChatWithPreview {
  id: string;
  type: 'single' | 'group';
  name: string | null;
  encryptionMode: 'cloud' | 'e2e';
  disappearHours: number;
  disappearText: boolean;
  disappearImage: boolean;
  disappearAudio: boolean;
  createdAt: string;
  updatedAt: string;
  participants: Array<{
    id: string;
    userId: string;
    role: 'admin' | 'member';
    joinedAt: string;
    lastReadAt: string | null;
    user: ReturnType<typeof serializeUser> & { online: boolean };
  }>;
  lastMessage?: {
    id: string;
    text: string;
    senderId: string;
    createdAt: string;
  } | null;
}

async function buildChatPreview(
  chatId: string,
  viewerId?: string,
): Promise<ChatWithPreview | null> {
  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    include: {
      participants: {
        include: {
          user: true,
        },
        orderBy: { joinedAt: 'asc' },
      },
    },
  });
  if (!chat) return null;

  const viewer = viewerId
    ? chat.participants.find((p) => p.userId === viewerId)
    : undefined;
  const clearedAt = viewer?.clearedAt ?? null;

  const last = await prisma.message.findFirst({
    where: {
      chatId,
      ...(clearedAt ? { createdAt: { gt: clearedAt } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      originalText: true,
      mediaType: true,
      senderId: true,
      createdAt: true,
      isE2e: true,
    },
  });
  return {
    id: chat.id,
    type: chat.type,
    name: chat.name ?? null,
    encryptionMode: chat.encryptionMode === 'e2e' ? 'e2e' : 'cloud',
    disappearHours: [0, 1, 6, 12, 24].includes(chat.disappearHours)
      ? chat.disappearHours
      : 0,
    disappearText: chat.disappearText,
    disappearImage: chat.disappearImage,
    disappearAudio: chat.disappearAudio,
    createdAt: chat.createdAt.toISOString(),
    updatedAt: chat.updatedAt.toISOString(),
    participants: chat.participants.map((p) => ({
      id: p.id,
      userId: p.userId,
      role: p.role,
      joinedAt: p.joinedAt.toISOString(),
      lastReadAt: p.lastReadAt ? p.lastReadAt.toISOString() : null,
      user: {
        ...serializeUser(p.user),
        online: getUserConnections(p.userId).size > 0,
      },
    })),
    lastMessage: last
      ? {
          id: last.id,
          text: last.isE2e
            ? '🔒 Mensaje cifrado'
            : last.mediaType === 'image'
              ? '📷 Foto'
              : last.mediaType === 'audio'
                ? '🎵 Audio'
                : last.mediaType === 'file'
                  ? '📄 Archivo'
                  : last.originalText,
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

    const viewerId = req.user!.id;
    const previews = (
      await Promise.all(chats.map((c) => buildChatPreview(c.id, viewerId)))
    ).filter((c): c is ChatWithPreview => c !== null);

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

    const preview = await buildChatPreview(chatId, req.user!.id);
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
// POST /chats/group — create a group chat
// Body: { name, participantIds: string[] }
// ───────────────────────────────────────────────────────────
router.post('/group', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, participantIds } = (req.body ?? {}) as {
      name?: unknown;
      participantIds?: unknown;
    };

    if (typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    if (!Array.isArray(participantIds) || participantIds.length === 0) {
      res.status(400).json({ error: 'participantIds must be a non-empty array' });
      return;
    }

    const ids = Array.from(
      new Set(
        participantIds
          .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
          .filter((id) => id !== req.user!.id),
      ),
    ).slice(0, 49);

    if (ids.length === 0) {
      res.status(400).json({ error: 'Add at least one other participant' });
      return;
    }

    const found = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    if (found.length !== ids.length) {
      res.status(400).json({ error: 'One or more participants were not found' });
      return;
    }

    const created = await prisma.chat.create({
      data: {
        type: 'group',
        name: name.trim().slice(0, 80),
        participants: {
          create: [
            { userId: req.user!.id, role: 'admin' },
            ...ids.map((userId) => ({ userId, role: 'member' as const })),
          ],
        },
      },
    });

    const preview = await buildChatPreview(created.id, req.user!.id);
    res.status(201).json({ chat: preview });
  } catch (err) {
    next(err);
  }
});

// POST /chats/:id/members — add members to a group (admin)
router.post('/:id/members', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { participantIds } = (req.body ?? {}) as { participantIds?: unknown };
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const me = await prisma.chatParticipant.findUnique({
      where: { chatId_userId: { chatId: id, userId: req.user!.id } },
    });
    if (!me || me.role !== 'admin') {
      res.status(403).json({ error: 'Only group admins can add members' });
      return;
    }
    const chat = await prisma.chat.findUnique({ where: { id } });
    if (!chat || chat.type !== 'group') {
      res.status(400).json({ error: 'Not a group chat' });
      return;
    }
    if (!Array.isArray(participantIds) || participantIds.length === 0) {
      res.status(400).json({ error: 'participantIds required' });
      return;
    }
    const ids = Array.from(
      new Set(
        participantIds
          .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
          .filter((x) => x !== req.user!.id),
      ),
    ).slice(0, 49);

    const existing = await prisma.chatParticipant.findMany({
      where: { chatId: id },
      select: { userId: true },
    });
    const existingSet = new Set(existing.map((e) => e.userId));
    const slots = Math.max(0, 50 - existing.length);
    const toAdd = ids.filter((uid) => !existingSet.has(uid)).slice(0, slots);
    if (slots === 0) {
      res.status(400).json({ error: 'Grupo: máximo 50 miembros' });
      return;
    }
    if (toAdd.length === 0) {
      res.status(400).json({ error: 'No new members to add' });
      return;
    }
    const found = await prisma.user.findMany({
      where: { id: { in: toAdd } },
      select: { id: true },
    });
    if (found.length !== toAdd.length) {
      res.status(400).json({ error: 'One or more users not found' });
      return;
    }
    await prisma.chatParticipant.createMany({
      data: toAdd.map((userId) => ({ chatId: id, userId, role: 'member' })),
    });
    const preview = await buildChatPreview(id, req.user!.id);
    res.json({ chat: preview });
  } catch (err) {
    next(err);
  }
});

// POST /chats/:id/leave — leave a group
router.post('/:id/leave', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const chat = await prisma.chat.findUnique({ where: { id } });
    if (!chat || chat.type !== 'group') {
      res.status(400).json({ error: 'Not a group chat' });
      return;
    }
    const membership = await prisma.chatParticipant.findUnique({
      where: { chatId_userId: { chatId: id, userId: req.user!.id } },
    });
    if (!membership) {
      res.status(403).json({ error: 'Not a participant' });
      return;
    }
    await prisma.chatParticipant.delete({ where: { id: membership.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /chats/:id/clear — "Vaciar chat" for the current user only.
 * Sets clearedAt; history before that timestamp is hidden for this participant.
 */
router.post('/:id/clear', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const membership = await prisma.chatParticipant.findUnique({
      where: { chatId_userId: { chatId: id, userId: req.user!.id } },
    });
    if (!membership) {
      res.status(403).json({ error: 'You are not a participant of this chat' });
      return;
    }
    const clearedAt = new Date();
    await prisma.chatParticipant.update({
      where: { id: membership.id },
      data: { clearedAt },
    });
    res.json({ ok: true, clearedAt: clearedAt.toISOString() });
  } catch (err) {
    next(err);
  }
});

// POST /chats/:id/read — mark chat as read up to now
router.post('/:id/read', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const membership = await prisma.chatParticipant.findUnique({
      where: { chatId_userId: { chatId: id, userId: req.user!.id } },
    });
    if (!membership) {
      res.status(403).json({ error: 'Not a participant' });
      return;
    }
    const readAt = new Date();
    await prisma.chatParticipant.update({
      where: { id: membership.id },
      data: { lastReadAt: readAt },
    });
    await broadcastToChat(id, {
      type: 'messages_read',
      chatId: id,
      userId: req.user!.id,
      readAt: readAt.toISOString(),
    });
    res.json({ ok: true, readAt: readAt.toISOString() });
  } catch (err) {
    next(err);
  }
});

// PATCH /chats/:id/disappear — autodestrucción bilateral (ambos dispositivos)
router.patch(
  '/:id/disappear',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ error: 'id is required' });
        return;
      }
      const membership = await prisma.chatParticipant.findUnique({
        where: { chatId_userId: { chatId: id, userId: req.user!.id } },
        select: { id: true },
      });
      if (!membership) {
        res.status(403).json({ error: 'Not a participant' });
        return;
      }
      const body = (req.body ?? {}) as {
        hours?: unknown;
        text?: unknown;
        image?: unknown;
        audio?: unknown;
      };
      const hoursRaw = Number(body.hours);
      const hours = [0, 1, 6, 12, 24].includes(hoursRaw) ? hoursRaw : 0;
      const data = {
        disappearHours: hours,
        disappearText:
          typeof body.text === 'boolean' ? body.text : undefined,
        disappearImage:
          typeof body.image === 'boolean' ? body.image : undefined,
        disappearAudio:
          typeof body.audio === 'boolean' ? body.audio : undefined,
      };
      const updated = await prisma.chat.update({
        where: { id },
        data: {
          disappearHours: data.disappearHours,
          ...(data.disappearText !== undefined
            ? { disappearText: data.disappearText }
            : {}),
          ...(data.disappearImage !== undefined
            ? { disappearImage: data.disappearImage }
            : {}),
          ...(data.disappearAudio !== undefined
            ? { disappearAudio: data.disappearAudio }
            : {}),
        },
      });
      const payload = {
        type: 'disappear_updated',
        chatId: id,
        disappearHours: updated.disappearHours,
        disappearText: updated.disappearText,
        disappearImage: updated.disappearImage,
        disappearAudio: updated.disappearAudio,
      };
      await broadcastToChat(id, payload);
      res.json(payload);
    } catch (err) {
      next(err);
    }
  },
);

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

    const preview = await buildChatPreview(id, req.user!.id);
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
