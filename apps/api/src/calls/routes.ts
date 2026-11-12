/**
 * HTTP call signaling (fallback when peer WebSocket is down).
 */

import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { authMiddleware } from '../middleware/auth';
import {
  mintCallRoom,
  rememberCallRoom,
  getRememberedCallRoom,
  clearCallRoom,
} from './config';
import {
  putPendingCall,
  listPendingForUser,
  clearPendingForChat,
} from './pending';
import {
  isUserConnected,
  sendToUser,
} from '../messages/websocket';
import { pushToUserTokens } from '../lib/push';

const router = Router();
router.use(authMiddleware);

/** GET /calls/pending — invites waiting for this user */
router.get('/pending', (req: Request, res: Response) => {
  const list = listPendingForUser(req.user!.id).map((c) => ({
    id: c.id,
    chatId: c.chatId,
    fromUserId: c.fromUserId,
    fromName: c.fromName,
    callType: c.callType,
    callRoom: c.callRoom,
    createdAt: new Date(c.createdAt).toISOString(),
  }));
  res.json({
    pending: list,
    meOnline: isUserConnected(req.user!.id),
  });
});

/** GET /calls/ready/:chatId — who is WS-online in this chat */
router.get(
  '/ready/:chatId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const chatId = String(req.params.chatId || '');
      const me = req.user!.id;
      const participants = await prisma.chatParticipant.findMany({
        where: { chatId },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      });
      if (!participants.some((p) => p.userId === me)) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      res.json({
        meOnline: isUserConnected(me),
        peers: participants
          .filter((p) => p.userId !== me)
          .map((p) => ({
            userId: p.userId,
            name: p.user.name,
            email: p.user.email,
            online: isUserConnected(p.userId),
          })),
      });
    } catch (err) {
      next(err);
    }
  },
);

/** POST /calls/invite { chatId, callType, fromName? } */
router.post(
  '/invite',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const chatId = String((req.body ?? {}).chatId || '').trim();
      const callType =
        (req.body ?? {}).callType === 'video' ? 'video' : 'voice';
      const fromName =
        typeof (req.body ?? {}).fromName === 'string'
          ? String((req.body as { fromName: string }).fromName).slice(0, 80)
          : undefined;
      if (!chatId) {
        res.status(400).json({ error: 'chatId required' });
        return;
      }
      const me = req.user!.id;
      const participants = await prisma.chatParticipant.findMany({
        where: { chatId },
        include: {
          user: { select: { id: true, name: true, pushToken: true } },
        },
      });
      if (!participants.some((p) => p.userId === me)) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const callRoom = mintCallRoom();
      rememberCallRoom(chatId, callRoom);

      const peers = participants.filter((p) => p.userId !== me);
      const peerOnline = peers.some((p) => isUserConnected(p.userId));

      for (const peer of peers) {
        putPendingCall({
          chatId,
          fromUserId: me,
          fromName,
          toUserId: peer.userId,
          callType,
          callRoom,
        });
        sendToUser(peer.userId, {
          type: 'call_invite',
          chatId,
          fromUserId: me,
          fromName,
          callType,
          callRoom,
        });
      }

      sendToUser(me, {
        type: 'call_room',
        chatId,
        callRoom,
        callType,
      });
      sendToUser(me, {
        type: 'call_ringing',
        chatId,
        callRoom,
        callType,
        peerOnline,
      });

      void pushToUserTokens(
        peers.map((p) => p.user.pushToken),
        fromName || 'Synap',
        callType === 'video' ? 'Videollamada entrante' : 'Llamada entrante',
        { type: 'call_invite', chatId, callType, callRoom, fromName },
      );

      res.json({
        ok: true,
        callRoom,
        peerOnline,
        peers: peers.map((p) => ({
          userId: p.userId,
          name: p.user.name,
          online: isUserConnected(p.userId),
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

/** POST /calls/accept { chatId } */
router.post(
  '/accept',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const chatId = String((req.body ?? {}).chatId || '').trim();
      if (!chatId) {
        res.status(400).json({ error: 'chatId required' });
        return;
      }
      const me = req.user!.id;
      const participants = await prisma.chatParticipant.findMany({
        where: { chatId },
        select: { userId: true },
      });
      if (!participants.some((p) => p.userId === me)) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      const callRoom = getRememberedCallRoom(chatId) || mintCallRoom();
      rememberCallRoom(chatId, callRoom);
      clearPendingForChat(chatId, me);

      for (const p of participants) {
        sendToUser(p.userId, {
          type: 'call_accept',
          chatId,
          fromUserId: me,
          callType: 'voice',
          callRoom,
        });
        if (p.userId === me) {
          sendToUser(me, {
            type: 'call_room',
            chatId,
            callRoom,
          });
        }
      }
      res.json({ ok: true, callRoom });
    } catch (err) {
      next(err);
    }
  },
);

/** POST /calls/end { chatId } */
router.post('/end', (req: Request, res: Response) => {
  const chatId = String((req.body ?? {}).chatId || '').trim();
  if (chatId) {
    clearCallRoom(chatId);
    clearPendingForChat(chatId);
  }
  res.json({ ok: true });
});

export default router;
