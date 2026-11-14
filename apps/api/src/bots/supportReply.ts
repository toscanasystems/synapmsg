/**
 * Auto-reply for the official support bot (written FAQ only).
 * Never reads other users' chats — only the message that triggered the update.
 * Escalation mail: ticket id + user private number + time — never chat body / secrets.
 */

import { randomBytes } from 'crypto';
import { prisma } from '../lib/prisma';
import { createAndBroadcastMessage } from '../messages/websocket';
import {
  buildForbiddenReply,
  buildUnknownReply,
  matchSupportFaq,
  SUPPORT_BOT_USERNAME,
} from './supportFaq';
import {
  formatNoticeWhen,
  sendNoticeEmail,
} from '../lib/outboundMail';

const SUPPORT_EMAIL = 'administrador@toscanasystems.com';

export async function findSupportBot(): Promise<{
  botId: string;
  botUserId: string;
  token: string;
} | null> {
  const bot = await prisma.bot.findFirst({
    where: { username: SUPPORT_BOT_USERNAME },
    select: { id: true, botUserId: true, token: true },
  });
  if (!bot) return null;
  return { botId: bot.id, botUserId: bot.botUserId, token: bot.token };
}

function newTicketId(): string {
  return `T-${Date.now().toString(36).toUpperCase()}-${randomBytes(2)
    .toString('hex')
    .toUpperCase()}`;
}

async function escalate(opts: {
  ticketId: string;
  userPrivateNumber: string | null;
}): Promise<void> {
  const when = formatNoticeWhen();
  const pn = opts.userPrivateNumber
    ? opts.userPrivateNumber.replace(/\D/g, '')
    : 'desconocido';
  await sendNoticeEmail({
    to: SUPPORT_EMAIL,
    subject: `[Synapmsg soporte] Ticket ${opts.ticketId}`,
    text:
      `Ticket: ${opts.ticketId}\n` +
      `Número privado del usuario: ${pn}\n` +
      `Hora: ${when}\n` +
      `\n(Sin contenido del chat, sin claves, sin códigos de recuperación.)\n`,
  });
  // Always log a redacted line for ops when mail is not wired.
  // eslint-disable-next-line no-console
  console.info(
    `[support-bot] escalate ticket=${opts.ticketId} pn=${pn.slice(0, 2)}****`,
  );
}

/**
 * If this chat includes the support bot and the sender is a human,
 * reply from the written FAQ (cloud chats only — E2E skipped upstream).
 */
export async function maybeAutoReplySupportBot(opts: {
  chatId: string;
  senderId: string;
  text: string;
  isE2e: boolean;
}): Promise<{ replied: boolean; reason?: string }> {
  if (opts.isE2e) return { replied: false, reason: 'e2e' };
  const text = (opts.text || '').trim();
  if (!text) return { replied: false, reason: 'empty' };

  const support = await findSupportBot();
  if (!support) return { replied: false, reason: 'no_bot' };
  if (opts.senderId === support.botUserId) {
    return { replied: false, reason: 'from_bot' };
  }

  const inChat = await prisma.chatParticipant.findFirst({
    where: { chatId: opts.chatId, userId: support.botUserId },
    select: { id: true },
  });
  if (!inChat) return { replied: false, reason: 'bot_not_in_chat' };

  const match = matchSupportFaq(text);
  let reply: string;
  if (match.kind === 'answer') {
    reply = match.text;
  } else if (match.kind === 'forbidden') {
    reply = buildForbiddenReply();
  } else {
    const ticketId = newTicketId();
    const sender = await prisma.user.findUnique({
      where: { id: opts.senderId },
      select: { privateNumber: true },
    });
    await escalate({
      ticketId,
      userPrivateNumber: sender?.privateNumber ?? null,
    });
    reply = buildUnknownReply(ticketId);
  }

  await createAndBroadcastMessage(opts.chatId, support.botUserId, reply, {
    mediaUrl: null,
    mediaType: null,
  });
  return { replied: true };
}
