/**
 * Enqueue inbound messages for bots that participate in a chat.
 */

import { prisma } from '../lib/prisma';

export async function enqueueBotUpdatesForMessage(opts: {
  chatId: string;
  messageId: string;
  senderId: string;
  text: string;
  isE2e: boolean;
}): Promise<void> {
  if (opts.isE2e) {
    // Bots never receive E2E plaintext — skip (security absolute).
    return;
  }

  const botsInChat = await prisma.bot.findMany({
    where: {
      botUser: {
        chatParticipants: { some: { chatId: opts.chatId } },
      },
    },
    select: { id: true, botUserId: true, webhookUrl: true },
  });

  for (const bot of botsInChat) {
    if (bot.botUserId === opts.senderId) continue;

    const last = await prisma.botUpdate.findFirst({
      where: { botId: bot.id },
      orderBy: { updateId: 'desc' },
      select: { updateId: true },
    });
    const updateId = (last?.updateId ?? 0) + 1;
    const payload = {
      update_id: updateId,
      message: {
        message_id: opts.messageId,
        chat: { id: opts.chatId },
        from: { id: opts.senderId },
        text: opts.text,
        date: Math.floor(Date.now() / 1000),
      },
    };

    await prisma.botUpdate.create({
      data: {
        botId: bot.id,
        updateId,
        payloadJson: JSON.stringify(payload),
      },
    });

    if (bot.webhookUrl) {
      void fetch(bot.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => undefined);
    }
  }

  // Official support bot: written FAQ reply (no AI). Best-effort; never throws.
  void import('./supportReply')
    .then((m) =>
      m.maybeAutoReplySupportBot({
        chatId: opts.chatId,
        senderId: opts.senderId,
        text: opts.text,
        isE2e: opts.isE2e,
      }),
    )
    .catch(() => undefined);
}
