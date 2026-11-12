/**
 * In-memory pending call invites — HTTP fallback when peer WS is down.
 * Same process as WS registry (single Railway instance).
 */

import { randomBytes } from 'crypto';

export type PendingCall = {
  id: string;
  chatId: string;
  fromUserId: string;
  fromName?: string;
  toUserId: string;
  callType: 'voice' | 'video';
  callRoom: string;
  createdAt: number;
  expiresAt: number;
};

const pendingByUser = new Map<string, PendingCall[]>();

function prune(userId: string): void {
  const now = Date.now();
  const list = pendingByUser.get(userId);
  if (!list) return;
  const next = list.filter((c) => c.expiresAt > now);
  if (next.length) pendingByUser.set(userId, next);
  else pendingByUser.delete(userId);
}

export function putPendingCall(
  call: Omit<PendingCall, 'id' | 'createdAt' | 'expiresAt'> & {
    ttlMs?: number;
  },
): PendingCall {
  const row: PendingCall = {
    id: randomBytes(8).toString('hex'),
    chatId: call.chatId,
    fromUserId: call.fromUserId,
    fromName: call.fromName,
    toUserId: call.toUserId,
    callType: call.callType,
    callRoom: call.callRoom,
    createdAt: Date.now(),
    expiresAt: Date.now() + (call.ttlMs ?? 90_000),
  };
  prune(call.toUserId);
  const list = pendingByUser.get(call.toUserId) ?? [];
  // One active invite per chat for this callee.
  const filtered = list.filter((c) => c.chatId !== call.chatId);
  filtered.push(row);
  pendingByUser.set(call.toUserId, filtered);
  return row;
}

export function listPendingForUser(userId: string): PendingCall[] {
  prune(userId);
  return [...(pendingByUser.get(userId) ?? [])];
}

export function clearPendingForChat(chatId: string, userId?: string): void {
  if (userId) {
    const list = pendingByUser.get(userId);
    if (!list) return;
    const next = list.filter((c) => c.chatId !== chatId);
    if (next.length) pendingByUser.set(userId, next);
    else pendingByUser.delete(userId);
    return;
  }
  for (const [uid, list] of pendingByUser) {
    const next = list.filter((c) => c.chatId !== chatId);
    if (next.length) pendingByUser.set(uid, next);
    else pendingByUser.delete(uid);
  }
}
