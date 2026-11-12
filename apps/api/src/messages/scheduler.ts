/**
 * Flush due scheduled messages every 20s.
 */

import { prisma } from '../lib/prisma';
import { createAndBroadcastMessage } from './websocket';

let timer: NodeJS.Timeout | null = null;
let running = false;

async function flushDue(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const due = await prisma.scheduledMessage.findMany({
      where: { sendAt: { lte: new Date() } },
      orderBy: { sendAt: 'asc' },
      take: 25,
    });
    for (const item of due) {
      try {
        const chat = await prisma.chat.findUnique({
          where: { id: item.chatId },
          select: { encryptionMode: true },
        });
        // Defense in depth: never flush plaintext into an E2E chat.
        if (chat?.encryptionMode === 'e2e') {
          await prisma.scheduledMessage.delete({ where: { id: item.id } });
          // eslint-disable-next-line no-console
          console.warn('[scheduler] dropped E2E scheduled plaintext', item.id);
          continue;
        }
        await createAndBroadcastMessage(item.chatId, item.senderId, item.text, {
          mediaUrl: item.mediaUrl,
          mediaType: item.mediaType,
        });
        await prisma.scheduledMessage.delete({ where: { id: item.id } });
      } catch (err) {
        // Drop orphaned rows (left chat, etc.) so they don't clog the queue.
        // eslint-disable-next-line no-console
        console.error('[scheduler] failed', item.id, err);
        await prisma.scheduledMessage.delete({ where: { id: item.id } }).catch(() => undefined);
      }
    }
  } finally {
    running = false;
  }
}

export function startMessageScheduler(): void {
  if (timer) return;
  void flushDue();
  timer = setInterval(() => {
    void flushDue();
  }, 20_000);
  // eslint-disable-next-line no-console
  console.log('[scheduler] scheduled messages worker started');
}

export function stopMessageScheduler(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
