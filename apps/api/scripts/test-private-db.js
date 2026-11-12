/**
 * Integration proof (Fase 1): a Private chat message is not readable in DB.
 *
 * Requires DATABASE_URL (and JWT_SECRET if the API helpers import jwt elsewhere).
 * Run: node scripts/test-private-db.js
 */
const { PrismaClient } = require('@prisma/client');
const {
  buildPrivateMessageDbFields,
  assertPrivateRowOpaque,
} = require('../dist/messages/privateEnvelope');

const PLAIN = 'FASE1_PLAINTEXT_MUST_NOT_APPEAR_IN_DB_' + Date.now();
const CIPHER = Buffer.from('envelope-' + PLAIN).toString('base64');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('SKIP: DATABASE_URL not set');
    process.exit(0);
  }

  const p = new PrismaClient();
  const stamp = Date.now();
  const emailA = `fase1.a.${stamp}@synapmsg.test`;
  const emailB = `fase1.b.${stamp}@synapmsg.test`;

  try {
    const a = await p.user.create({
      data: {
        email: emailA,
        username: `fase1a${stamp}`,
        name: 'Fase1 A',
        passwordHash: 'x',
      },
    });
    const b = await p.user.create({
      data: {
        email: emailB,
        username: `fase1b${stamp}`,
        name: 'Fase1 B',
        passwordHash: 'x',
      },
    });
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

    const envelope = buildPrivateMessageDbFields(
      {
        ciphertext: CIPHER,
        ciphertextType: 1,
        originalLanguage: 'es',
      },
      PLAIN,
    );

    const created = await p.message.create({
      data: {
        chatId: chat.id,
        senderId: a.id,
        ...envelope,
      },
    });

    const row = await p.message.findUnique({ where: { id: created.id } });
    if (!row) throw new Error('message missing after create');

    assertPrivateRowOpaque(row, PLAIN);

    if ((row.originalText || '').includes(PLAIN)) {
      throw new Error('FAIL: originalText contains plaintext');
    }
    if ((row.translatedText || '').includes(PLAIN)) {
      throw new Error('FAIL: translatedText contains plaintext');
    }
    if (row.ciphertext !== CIPHER) {
      throw new Error('FAIL: ciphertext not stored');
    }
    if (!row.isE2e) throw new Error('FAIL: isE2e false');

    console.log(
      JSON.stringify({
        ok: true,
        messageId: row.id,
        originalText: row.originalText,
        translatedText: row.translatedText,
        ciphertextLen: (row.ciphertext || '').length,
        proved: 'Private message row has empty originalText; plaintext not in DB',
      }),
    );

    // Cleanup test rows
    await p.message.delete({ where: { id: row.id } });
    await p.chat.delete({ where: { id: chat.id } });
    await p.user.deleteMany({ where: { id: { in: [a.id, b.id] } } });
  } finally {
    await p.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
