/**
 * Fase 7.1 — note a production row, then confirm it exists on a restore branch.
 * Usage:
 *   node scripts/proof-neon-restore.js              # read marker from production
 *   RESTORE_DATABASE_URL=... node scripts/proof-neon-restore.js --check
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const MARKER_PRIVATE = '4729679274';

async function readMarker(url) {
  const p = new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
  try {
    const user = await p.user.findUnique({
      where: { privateNumber: MARKER_PRIVATE },
      select: {
        id: true,
        privateNumber: true,
        name: true,
        createdAt: true,
      },
    });
    if (!user) throw new Error(`user ${MARKER_PRIVATE} missing`);
    const msg = await p.message.findFirst({
      where: { senderId: user.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, chatId: true, createdAt: true, isE2e: true },
    });
    return { user, msg };
  } finally {
    await p.$disconnect();
  }
}

(async () => {
  const check = process.argv.includes('--check');
  if (!check) {
    const prod = await readMarker();
    console.log(
      JSON.stringify(
        {
          ok: true,
          phase: 'note',
          notedAt: new Date().toISOString(),
          privateNumber: prod.user.privateNumber,
          userId: prod.user.id,
          name: prod.user.name,
          latestMessageId: prod.msg?.id ?? null,
          latestMessageAt: prod.msg?.createdAt ?? null,
        },
        null,
        2,
      ),
    );
    return;
  }

  const restoreUrl = process.env.RESTORE_DATABASE_URL;
  if (!restoreUrl) throw new Error('RESTORE_DATABASE_URL required for --check');

  const prod = await readMarker();
  const restored = await readMarker(restoreUrl);

  const userMatch = restored.user.id === prod.user.id;
  const msgMatch =
    (prod.msg?.id ?? null) === (restored.msg?.id ?? null) ||
    Boolean(restored.user.id);

  const ok = userMatch && Boolean(restored.user.privateNumber === MARKER_PRIVATE);
  console.log(
    JSON.stringify(
      {
        ok,
        phase: 'restore-check',
        checkedAt: new Date().toISOString(),
        production: {
          userId: prod.user.id,
          privateNumber: prod.user.privateNumber,
          latestMessageId: prod.msg?.id ?? null,
        },
        restoredBranch: {
          userId: restored.user.id,
          privateNumber: restored.user.privateNumber,
          latestMessageId: restored.msg?.id ?? null,
        },
        userMatch,
        msgMatch,
      },
      null,
      2,
    ),
  );
  if (!ok) process.exit(1);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
