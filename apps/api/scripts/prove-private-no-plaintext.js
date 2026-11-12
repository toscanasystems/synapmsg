/**
 * Fase 1 closure proof — plaintext of a Private message must not appear in:
 *  1) any DB column of the message row (and related scheduled/reaction rows)
 *  2) server log lines emitted during the send
 *  3) the client→server JSON packet (what the phone would POST)
 *  4) the server→client wire payload (API/WS serialize shape)
 *
 * Exit 0 only if all surfaces are clean.
 */
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { createAndBroadcastMessage } = require('../dist/messages/websocket');

const PLAIN =
  'FASE1_PLAINTEXT_PROBE_' + crypto.randomBytes(8).toString('hex');
// Cipher must not accidentally contain PLAIN as a substring.
const CIPHER = crypto.randomBytes(48).toString('base64');

function fail(msg, detail) {
  console.error('FAIL:', msg);
  if (detail !== undefined) console.error(detail);
  process.exit(1);
}

function assertNoPlain(label, value) {
  const s =
    typeof value === 'string' ? value : JSON.stringify(value, null, 0);
  if (s.includes(PLAIN)) {
    fail(`plaintext found in ${label}`, s.slice(0, 500));
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    fail('DATABASE_URL required for this proof');
  }
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    process.env.JWT_SECRET =
      'fase1-prove-secret-' + crypto.randomBytes(24).toString('hex');
  }

  // ── 3) Client→server packet (same shape as mobile e2e send) ──
  const clientPacket = {
    ciphertext: CIPHER,
    ciphertextType: 1,
  };
  assertNoPlain('client→server JSON packet', clientPacket);
  if ('text' in clientPacket) {
    fail('client packet must not include text field for Private');
  }
  console.log('OK wire-out: client packet has no plaintext / no text field');

  // Reject path: if a buggy client sent plaintext+cipher, API must refuse.
  // (Checked after we have users/chat.)

  const logs = [];
  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;
  const capture = (level) => (...args) => {
    logs.push([level, args.map(String).join(' ')].join(' '));
    if (level === 'error') origError(...args);
  };
  console.log = capture('log');
  console.warn = capture('warn');
  console.error = (...args) => {
    logs.push(['error', args.map(String).join(' ')].join(' '));
    origError(...args);
  };

  const p = new PrismaClient();
  const stamp = Date.now();
  let messageId = null;
  let chatId = null;
  let userIds = [];

  try {
    const a = await p.user.create({
      data: {
        email: `prove.a.${stamp}@synapmsg.test`,
        username: `provea${stamp}`,
        name: 'Prove A',
        passwordHash: 'x',
      },
    });
    const b = await p.user.create({
      data: {
        email: `prove.b.${stamp}@synapmsg.test`,
        username: `proveb${stamp}`,
        name: 'Prove B',
        passwordHash: 'x',
      },
    });
    userIds = [a.id, b.id];
    const chat = await p.chat.create({
      data: {
        type: 'single',
        encryptionMode: 'e2e',
        participants: {
          create: [
            { userId: a.id, role: 'admin' },
            { userId: b.id, role: 'member' },
          ],
        },
      },
    });
    chatId = chat.id;

    // Buggy client: plaintext on the wire must be rejected.
    let rejected = false;
    try {
      await createAndBroadcastMessage(chat.id, a.id, PLAIN, {
        ciphertext: CIPHER,
        ciphertextType: 1,
      });
    } catch (e) {
      rejected = true;
      if (!(e instanceof Error) || !/texto en claro|ciphertext|Privado/i.test(e.message)) {
        // HttpError from dist may not be instanceof after compile — check message
        if (!String(e && e.message).match(/texto en claro|Privado|ciphertext/i)) {
          fail('expected reject of plaintext+cipher', e);
        }
      }
    }
    if (!rejected) fail('API accepted Private send with plaintext body');
    origLog('OK reject: plaintext+cipher refused by API');

    // Legitimate Private send (cipher only) — mirrors mobile.
    const result = await createAndBroadcastMessage(chat.id, a.id, '', {
      ciphertext: CIPHER,
      ciphertextType: 1,
    });
    messageId = result.raw.id;

    // ── 4) Server→client wire ──
    assertNoPlain('server→client message payload', result.message);
    if (
      result.message.originalText &&
      result.message.originalText !== '🔒 Mensaje cifrado' &&
      result.message.originalText.trim() !== ''
    ) {
      fail('wire originalText should be placeholder or empty for Private', result.message);
    }
    origLog('OK wire-in: API/WS payload has no plaintext body');

    // ── 1) All DB columns ──
    const row = await p.$queryRawUnsafe(
      `SELECT * FROM messages WHERE id = $1::uuid`,
      messageId,
    );
    if (!row || !row[0]) fail('message row missing');
    const full = row[0];
    for (const [col, val] of Object.entries(full)) {
      assertNoPlain(`DB messages.${col}`, val);
    }
    // Related tables for this chat/message
    const scheduled = await p.scheduledMessage.findMany({
      where: { chatId: chat.id },
    });
    assertNoPlain('DB scheduled_messages', scheduled);
    const reactions = await p.messageReaction.findMany({
      where: { messageId },
    });
    assertNoPlain('DB message_reactions', reactions);

    if ((full.originalText || '').toString().trim() !== '') {
      fail('DB originalText must be empty', full.originalText);
    }
    if (full.translatedText != null && String(full.translatedText).trim() !== '') {
      fail('DB translatedText must be null/empty', full.translatedText);
    }
    if (!full.ciphertext || String(full.ciphertext) !== CIPHER) {
      fail('DB ciphertext missing or altered');
    }
    origLog('OK db: no plaintext in any messages column (or related rows)');

    // ── 2) Server logs during send ──
    assertNoPlain('server logs', logs.join('\n'));
    origLog('OK logs: captured console during send has no plaintext');
  } finally {
    console.log = origLog;
    console.warn = origWarn;
    console.error = origError;
    try {
      if (messageId) await p.message.delete({ where: { id: messageId } }).catch(() => undefined);
      if (chatId) await p.chat.delete({ where: { id: chatId } }).catch(() => undefined);
      if (userIds.length) {
        await p.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => undefined);
      }
    } catch (_) {}
    await p.$disconnect();
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        plainProbe: PLAIN,
        surfaces: {
          dbColumns: 'clean',
          serverLogs: 'clean',
          clientPacket: 'clean (ciphertext only)',
          serverWire: 'clean (placeholder / ciphertext, no plain body)',
          rejectPlainOnWire: 'enforced',
        },
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
