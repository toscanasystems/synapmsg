/**
 * Chat polls — named or anonymous; optional quiz correct option.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { authMiddleware } from '../middleware/auth';
import { createAndBroadcastMessage, sendToUser } from '../messages/websocket';

const router = Router({ mergeParams: true });
router.use(authMiddleware);

async function assertMember(chatId: string, userId: string): Promise<boolean> {
  const row = await prisma.chatParticipant.findUnique({
    where: { chatId_userId: { chatId, userId } },
  });
  return Boolean(row);
}

function serializePoll(
  poll: {
    id: string;
    chatId: string;
    question: string;
    anonymous: boolean;
    quiz: boolean;
    correctOptionId: string | null;
    messageId: string | null;
    createdAt: Date;
    options: Array<{ id: string; text: string; sort: number }>;
    votes: Array<{ optionId: string; userId: string }>;
  },
  viewerId: string,
) {
  const counts = new Map<string, number>();
  for (const o of poll.options) counts.set(o.id, 0);
  for (const v of poll.votes) {
    counts.set(v.optionId, (counts.get(v.optionId) || 0) + 1);
  }
  const myVote = poll.votes.find((v) => v.userId === viewerId)?.optionId ?? null;
  return {
    id: poll.id,
    chatId: poll.chatId,
    question: poll.question,
    anonymous: poll.anonymous,
    quiz: poll.quiz,
    correctOptionId: poll.quiz ? poll.correctOptionId : null,
    messageId: poll.messageId,
    createdAt: poll.createdAt.toISOString(),
    totalVotes: poll.votes.length,
    myVote,
    options: poll.options
      .slice()
      .sort((a, b) => a.sort - b.sort)
      .map((o) => ({
        id: o.id,
        text: o.text,
        votes: counts.get(o.id) || 0,
        voters: poll.anonymous
          ? []
          : poll.votes
              .filter((v) => v.optionId === o.id)
              .map((v) => v.userId),
      })),
  };
}

/** POST /chats/:chatId/polls */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const chatId = req.params.chatId;
    if (!chatId || !(await assertMember(chatId, req.user!.id))) {
      res.status(403).json({ error: 'Not a participant' });
      return;
    }
    const body = (req.body ?? {}) as {
      question?: unknown;
      options?: unknown;
      anonymous?: unknown;
      quiz?: unknown;
      correctOptionIndex?: unknown;
    };
    const question =
      typeof body.question === 'string' ? body.question.trim().slice(0, 280) : '';
    const options = Array.isArray(body.options)
      ? body.options
          .filter((o): o is string => typeof o === 'string' && o.trim().length > 0)
          .map((o) => o.trim().slice(0, 120))
          .slice(0, 8)
      : [];
    if (!question || options.length < 2) {
      res.status(400).json({ error: 'question + ≥2 options required' });
      return;
    }
    const anonymous = Boolean(body.anonymous);
    const quiz = Boolean(body.quiz);
    const correctIdx =
      typeof body.correctOptionIndex === 'number'
        ? Math.floor(body.correctOptionIndex)
        : -1;

    const poll = await prisma.chatPoll.create({
      data: {
        chatId,
        creatorId: req.user!.id,
        question,
        anonymous,
        quiz,
        options: {
          create: options.map((text, sort) => ({ text, sort })),
        },
      },
      include: { options: true, votes: true },
    });

    let correctOptionId: string | null = null;
    if (quiz && correctIdx >= 0 && correctIdx < poll.options.length) {
      correctOptionId = poll.options[correctIdx]!.id;
      await prisma.chatPoll.update({
        where: { id: poll.id },
        data: { correctOptionId },
      });
    }

    // Cloud system message so it appears in the timeline.
    const chat = await prisma.chat.findUnique({ where: { id: chatId } });
    const mode = chat?.encryptionMode === 'e2e' ? 'e2e' : 'cloud';
    let messageId: string | null = null;
    if (mode === 'cloud') {
      const result = await createAndBroadcastMessage(
        chatId,
        req.user!.id,
        `📊 ${question}`,
        { mediaType: 'poll', mediaUrl: `poll:${poll.id}` },
      );
      messageId = result.raw.id;
      await prisma.chatPoll.update({
        where: { id: poll.id },
        data: { messageId },
      });
    }

    const full = await prisma.chatPoll.findUniqueOrThrow({
      where: { id: poll.id },
      include: { options: true, votes: true },
    });
    const wire = serializePoll(full, req.user!.id);
    const participants = await prisma.chatParticipant.findMany({
      where: { chatId },
      select: { userId: true },
    });
    for (const p of participants) {
      sendToUser(p.userId, { type: 'poll_updated', chatId, poll: wire });
    }
    res.status(201).json({ poll: wire });
  } catch (err) {
    next(err);
  }
});

/** POST /chats/:chatId/polls/:pollId/vote */
router.post(
  '/:pollId/vote',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const chatId = req.params.chatId;
      const pollId = req.params.pollId;
      const optionId =
        typeof (req.body as { optionId?: unknown })?.optionId === 'string'
          ? String((req.body as { optionId: string }).optionId)
          : '';
      if (!chatId || !pollId || !(await assertMember(chatId, req.user!.id))) {
        res.status(403).json({ error: 'Not a participant' });
        return;
      }
      const poll = await prisma.chatPoll.findFirst({
        where: { id: pollId, chatId },
        include: { options: true, votes: true },
      });
      if (!poll) {
        res.status(404).json({ error: 'Poll not found' });
        return;
      }
      if (!poll.options.some((o) => o.id === optionId)) {
        res.status(400).json({ error: 'Invalid option' });
        return;
      }
      await prisma.chatPollVote.upsert({
        where: {
          pollId_userId: { pollId, userId: req.user!.id },
        },
        create: { pollId, optionId, userId: req.user!.id },
        update: { optionId },
      });
      const full = await prisma.chatPoll.findUniqueOrThrow({
        where: { id: pollId },
        include: { options: true, votes: true },
      });
      const wire = serializePoll(full, req.user!.id);
      const participants = await prisma.chatParticipant.findMany({
        where: { chatId },
        select: { userId: true },
      });
      for (const p of participants) {
        const forViewer = serializePoll(full, p.userId);
        sendToUser(p.userId, {
          type: 'poll_updated',
          chatId,
          poll: forViewer,
        });
      }
      res.json({ poll: wire });
    } catch (err) {
      next(err);
    }
  },
);

/** GET /chats/:chatId/polls/:pollId */
router.get('/:pollId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const chatId = req.params.chatId;
    const pollId = req.params.pollId;
    if (!chatId || !pollId || !(await assertMember(chatId, req.user!.id))) {
      res.status(403).json({ error: 'Not a participant' });
      return;
    }
    const poll = await prisma.chatPoll.findFirst({
      where: { id: pollId, chatId },
      include: { options: true, votes: true },
    });
    if (!poll) {
      res.status(404).json({ error: 'Poll not found' });
      return;
    }
    res.json({ poll: serializePoll(poll, req.user!.id) });
  } catch (err) {
    next(err);
  }
});

export default router;
