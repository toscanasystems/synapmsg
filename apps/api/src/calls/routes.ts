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
  createGroupSession,
  getSessionByChat,
  joinGroupSession,
  leaveGroupSession,
  markRinging,
  rosterOf,
  setMemberMuted,
  destroyGroupSessionByChat,
  GROUP_CALL_MAX_MEMBERS,
} from './groupSession';
import {
  isUserConnected,
  sendToUser,
} from '../messages/websocket';
import { pushToUserTokens } from '../lib/push';

const router = Router();
router.use(authMiddleware);

function broadcastRoster(chatId: string): void {
  const session = getSessionByChat(chatId);
  if (!session) return;
  const roster = rosterOf(session);
  for (const m of roster) {
    sendToUser(m.userId, {
      type: 'call_roster',
      chatId: session.chatId,
      callRoom: session.callRoom,
      callType: 'voice',
      isGroup: true,
      members: roster,
    });
  }
}

/** GET /calls/pending — invites waiting for this user */
router.get('/pending', (req: Request, res: Response) => {
  const list = listPendingForUser(req.user!.id).map((c) => ({
    id: c.id,
    chatId: c.chatId,
    fromUserId: c.fromUserId,
    fromName: c.fromName,
    callType: c.callType,
    callRoom: c.callRoom,
    isGroup: c.isGroup === true,
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

/** GET /calls/roster/:chatId */
router.get('/roster/:chatId', (req: Request, res: Response) => {
  const chatId = String(req.params.chatId || '');
  const session = getSessionByChat(chatId);
  if (!session) {
    res.json({ active: false, members: [] });
    return;
  }
  if (!session.members.has(req.user!.id)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  res.json({
    active: true,
    callRoom: session.callRoom,
    callType: 'voice',
    isGroup: true,
    maxMembers: GROUP_CALL_MAX_MEMBERS,
    members: rosterOf(session),
  });
});

/** POST /calls/invite { chatId, callType, fromName? } */
router.post(
  '/invite',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const chatId = String((req.body ?? {}).chatId || '').trim();
      let callType: 'voice' | 'video' =
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
      const chat = await prisma.chat.findUnique({
        where: { id: chatId },
        select: { type: true },
      });
      if (!chat) {
        res.status(404).json({ error: 'Chat not found' });
        return;
      }
      const isGroup = chat.type === 'group';
      if (isGroup) callType = 'voice';

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

      const existing = getSessionByChat(chatId);
      const callRoom = existing?.callRoom || mintCallRoom();
      rememberCallRoom(chatId, callRoom);

      if (isGroup) {
        const session =
          existing ||
          createGroupSession({
            callRoom,
            chatId,
            createdBy: me,
            creatorName:
              fromName ||
              participants.find((p) => p.userId === me)?.user.name ||
              'Synap',
          });
        if (existing) {
          joinGroupSession(
            session,
            me,
            fromName ||
              participants.find((p) => p.userId === me)?.user.name ||
              'Synap',
          );
        }
      }

      const peers = participants.filter((p) => p.userId !== me);
      const peerOnline = peers.some((p) => isUserConnected(p.userId));
      const session = isGroup ? getSessionByChat(chatId) : null;

      for (const peer of peers) {
        putPendingCall({
          chatId,
          fromUserId: me,
          fromName,
          toUserId: peer.userId,
          callType,
          callRoom,
          isGroup,
        });
        if (session) {
          markRinging(session, peer.userId, peer.user.name || 'Synap');
        }
        sendToUser(peer.userId, {
          type: 'call_invite',
          chatId,
          fromUserId: me,
          fromName,
          callType,
          callRoom,
          isGroup,
        });
      }

      sendToUser(me, {
        type: 'call_room',
        chatId,
        callRoom,
        callType,
        isGroup,
      });
      sendToUser(me, {
        type: 'call_ringing',
        chatId,
        callRoom,
        callType,
        peerOnline,
        isGroup,
      });
      if (session) broadcastRoster(chatId);

      void pushToUserTokens(
        peers.map((p) => p.user.pushToken),
        fromName || 'Synap',
        isGroup
          ? 'Llamada de grupo entrante'
          : callType === 'video'
            ? 'Videollamada entrante'
            : 'Llamada entrante',
        { type: 'call_invite', chatId, callType, callRoom, fromName, isGroup },
      );

      res.json({
        ok: true,
        callRoom,
        peerOnline,
        isGroup,
        callType,
        maxMembers: isGroup ? GROUP_CALL_MAX_MEMBERS : 2,
        peers: peers.map((p) => ({
          userId: p.userId,
          name: p.user.name,
          online: isUserConnected(p.userId),
        })),
        members: session ? rosterOf(session) : undefined,
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
      const chat = await prisma.chat.findUnique({
        where: { id: chatId },
        select: { type: true },
      });
      if (!chat) {
        res.status(404).json({ error: 'Chat not found' });
        return;
      }
      const isGroup = chat.type === 'group';
      const participants = await prisma.chatParticipant.findMany({
        where: { chatId },
        include: { user: { select: { id: true, name: true } } },
      });
      if (!participants.some((p) => p.userId === me)) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      const callRoom = getRememberedCallRoom(chatId) || mintCallRoom();
      rememberCallRoom(chatId, callRoom);
      clearPendingForChat(chatId, me);

      if (isGroup) {
        let session = getSessionByChat(chatId);
        if (!session) {
          session = createGroupSession({
            callRoom,
            chatId,
            createdBy: me,
            creatorName:
              participants.find((p) => p.userId === me)?.user.name || 'Synap',
          });
        }
        const joined = joinGroupSession(
          session,
          me,
          participants.find((p) => p.userId === me)?.user.name || 'Synap',
        );
        if (!joined) {
          res.status(403).json({
            error: `La llamada de grupo está llena (máx. ${GROUP_CALL_MAX_MEMBERS}).`,
          });
          return;
        }
        for (const p of participants) {
          sendToUser(p.userId, {
            type: 'call_accept',
            chatId,
            fromUserId: me,
            callType: 'voice',
            callRoom,
            isGroup: true,
          });
        }
        sendToUser(me, {
          type: 'call_room',
          chatId,
          callRoom,
          callType: 'voice',
          isGroup: true,
        });
        broadcastRoster(chatId);
        res.json({
          ok: true,
          callRoom,
          isGroup: true,
          members: rosterOf(session),
        });
        return;
      }

      for (const p of participants) {
        sendToUser(p.userId, {
          type: 'call_accept',
          chatId,
          fromUserId: me,
          callType: 'voice',
          callRoom,
          isGroup: false,
        });
        if (p.userId === me) {
          sendToUser(me, {
            type: 'call_room',
            chatId,
            callRoom,
          });
        }
      }
      res.json({ ok: true, callRoom, isGroup: false });
    } catch (err) {
      next(err);
    }
  },
);

/** POST /calls/leave { chatId } — leave group call without ending for others */
router.post('/leave', (req: Request, res: Response) => {
  const chatId = String((req.body ?? {}).chatId || '').trim();
  const me = req.user!.id;
  if (!chatId) {
    res.status(400).json({ error: 'chatId required' });
    return;
  }
  const session = getSessionByChat(chatId);
  clearPendingForChat(chatId, me);
  if (!session) {
    res.json({ ok: true, ended: true });
    return;
  }
  const { ended } = leaveGroupSession(session, me);
  if (ended) {
    clearCallRoom(chatId);
    clearPendingForChat(chatId);
  } else {
    broadcastRoster(chatId);
  }
  res.json({ ok: true, ended, isGroup: true });
});

/** POST /calls/mute { chatId, muted } */
router.post('/mute', (req: Request, res: Response) => {
  const chatId = String((req.body ?? {}).chatId || '').trim();
  const muted = (req.body ?? {}).muted === true;
  const me = req.user!.id;
  const session = getSessionByChat(chatId);
  if (!session || !session.members.has(me)) {
    res.status(404).json({ error: 'No active group call' });
    return;
  }
  setMemberMuted(session, me, muted);
  broadcastRoster(chatId);
  for (const m of session.members.values()) {
    if (m.userId === me) continue;
    sendToUser(m.userId, {
      type: 'call_mute',
      chatId,
      fromUserId: me,
      muted,
      callRoom: session.callRoom,
      isGroup: true,
    });
  }
  res.json({ ok: true, muted });
});

/** POST /calls/end { chatId } — 1:1 hangup, or destroy empty group session */
router.post('/end', (req: Request, res: Response) => {
  const chatId = String((req.body ?? {}).chatId || '').trim();
  const me = req.user!.id;
  if (chatId) {
    const session = getSessionByChat(chatId);
    if (session) {
      const { ended } = leaveGroupSession(session, me);
      clearPendingForChat(chatId, me);
      if (ended) {
        clearCallRoom(chatId);
        clearPendingForChat(chatId);
        destroyGroupSessionByChat(chatId);
      } else {
        broadcastRoster(chatId);
      }
    } else {
      clearCallRoom(chatId);
      clearPendingForChat(chatId);
    }
  }
  res.json({ ok: true });
});

export default router;
