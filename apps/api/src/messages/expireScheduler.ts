/**
 * Purge expired (autodestruct) messages for BOTH participants.
 */

import { prisma } from '../lib/prisma';
import { broadcastToChat } from './websocket';

let timer: NodeJS.Timeout | null = null;
let running = false;

async function flushExpired(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const now = new Date();
    const expired = await prisma.message.findMany({
      where: {
        expiresAt: { lte: now },
        deletedAt: null,
      },
      select: { id: true, chatId: true },
      take: 100,
    });
    for (const msg of expired) {
      await prisma.message.update({
        where: { id: msg.id },
        data: {
          deletedAt: now,
          originalText: '',
          translatedText: null,
          mediaUrl: null,
          ciphertext: null,
        },
      });
      await broadcastToChat(msg.chatId, {
        type: 'message_deleted',
        chatId: msg.chatId,
        reason: 'autodestruct',
        message: {
          id: msg.id,
          chatId: msg.chatId,
          deletedAt: now.toISOString(),
          originalText: 'Mensaje eliminado',
          translatedText: 'Mensaje eliminado',
        },
      });
    }
  } finally {
    running = false;
  }
}

export function startExpireScheduler(): void {
  if (timer) return;
  void flushExpired();
  timer = setInterval(() => {
    void flushExpired();
  }, 30_000);
  // eslint-disable-next-line no-console
  console.log('[expire] autodestruct worker started');
}

export function stopExpireScheduler(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
