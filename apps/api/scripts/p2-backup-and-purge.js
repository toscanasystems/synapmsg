/**
 * Parte 2 — backup + purge test accounts.
 * KEEP only privateNumbers: 8953998750 (Toscana), 5329910588 (Samsung).
 * NEVER touches private_number_ledger.
 * Does not print secrets / recovery hashes / ciphertext.
 *
 * Usage (from apps/api, DATABASE_URL set):
 *   node scripts/p2-backup-and-purge.js backup
 *   node scripts/p2-backup-and-purge.js purge
 *   node scripts/p2-backup-and-purge.js verify
 */
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const KEEP_PN = new Set(['8953998750', '5329910588']);
const OUT_DIR = path.join(
  process.env.TEMP || process.env.TMP || '.',
  'synapmsg-p1-backup',
);

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function loadDropIds(p) {
  const users = await p.$queryRawUnsafe(`
    SELECT id::text AS id, "privateNumber" AS pn, username, name
    FROM users
    ORDER BY "createdAt"
  `);
  const keep = users.filter((u) => u.pn && KEEP_PN.has(u.pn));
  const drop = users.filter((u) => !(u.pn && KEEP_PN.has(u.pn)));
  return { users, keep, drop };
}

async function backup(p) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const { users, keep, drop } = await loadDropIds(p);
  const dropIds = drop.map((u) => u.id);

  const counts = await p.$queryRawUnsafe(`
    SELECT
      (SELECT count(*)::int FROM users) AS users,
      (SELECT count(*)::int FROM chats) AS chats,
      (SELECT count(*)::int FROM chat_participants) AS participants,
      (SELECT count(*)::int FROM messages) AS messages,
      (SELECT count(*)::int FROM device_identities) AS devices,
      (SELECT count(*)::int FROM private_number_ledger) AS ledger
  `);

  let mediaRows = [];
  if (dropIds.length) {
    mediaRows = await p.$queryRawUnsafe(
      `
      SELECT m.id::text AS id, m."senderId"::text AS "senderId",
             m."mediaUrl" AS "mediaUrl", m."mediaType" AS "mediaType"
      FROM messages m
      WHERE m."senderId" = ANY($1::uuid[])
        AND m."mediaUrl" IS NOT NULL
        AND length(m."mediaUrl") > 0
        AND m."mediaUrl" NOT LIKE 'poll:%'
      `,
      dropIds,
    );
  }

  const chatIds = dropIds.length
    ? await p.$queryRawUnsafe(
        `
        SELECT DISTINCT c.id::text AS id
        FROM chats c
        JOIN chat_participants cp ON cp."chatId" = c.id
        WHERE cp."userId" = ANY($1::uuid[])
          AND NOT EXISTS (
            SELECT 1 FROM chat_participants kp
            JOIN users ku ON ku.id = kp."userId"
            WHERE kp."chatId" = c.id
              AND ku."privateNumber" = ANY($2::text[])
          )
        `,
        dropIds,
        [...KEEP_PN],
      )
    : [];

  // Chats that ONLY involve drop users (safe to delete entirely).
  // Also chats where keep users participate with drop — we remove drop
  // participants / their messages but keep the chat if both keep users are in it.
  const file = path.join(OUT_DIR, `full-backup-${stamp()}.json`);
  const payload = {
    at: new Date().toISOString(),
    keepPn: [...KEEP_PN],
    counts: counts[0],
    keep: keep.map((u) => ({
      id: u.id,
      pn: u.pn,
      username: u.username,
      name: u.name,
    })),
    drop: drop.map((u) => ({
      id: u.id,
      pn: u.pn,
      username: u.username,
      name: u.name,
    })),
    dropMediaUrls: mediaRows.map((r) => ({
      id: r.id,
      senderId: r.senderId,
      mediaType: r.mediaType,
      mediaUrl: r.mediaUrl,
    })),
    candidateOrphanChats: chatIds.map((c) => c.id),
  };
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  console.log(
    JSON.stringify(
      {
        ok: true,
        backupFile: file,
        rows: {
          usersTotal: users.length,
          keep: keep.length,
          drop: drop.length,
          mediaUrls: mediaRows.length,
          ledger: counts[0].ledger,
          messages: counts[0].messages,
          chats: counts[0].chats,
          devices: counts[0].devices,
        },
      },
      null,
      2,
    ),
  );
  return file;
}

async function tryDeleteR2(urls) {
  // Best-effort: if S3/R2 env is present, delete objects. Never log keys.
  const accountId = process.env.R2_ACCOUNT_ID || process.env.CF_ACCOUNT_ID;
  const accessKey =
    process.env.R2_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const secretKey =
    process.env.R2_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
  const bucket =
    process.env.R2_BUCKET ||
    process.env.R2_BUCKET_NAME ||
    process.env.MEDIA_BUCKET;
  if (!accountId || !accessKey || !secretKey || !bucket) {
    return {
      skipped: true,
      reason: 'no_r2_env',
      attempted: 0,
      deleted: 0,
      note: 'Need R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY nonempty',
    };
  }
  let deleted = 0;
  let attempted = 0;
  try {
    const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
    const client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    });
    for (const raw of urls) {
      if (!raw || typeof raw !== 'string') continue;
      // Expect …/bucket/key or https://media…/key
      let key = null;
      try {
        const u = new URL(raw);
        key = decodeURIComponent(u.pathname.replace(/^\//, ''));
        if (key.startsWith(bucket + '/')) key = key.slice(bucket.length + 1);
      } catch {
        key = raw;
      }
      if (!key) continue;
      attempted += 1;
      try {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
        deleted += 1;
      } catch {
        /* continue */
      }
    }
  } catch (e) {
    return {
      skipped: true,
      reason: 'r2_client_error',
      attempted,
      deleted,
      err: String(e.message || e).slice(0, 80),
    };
  }
  return { skipped: false, attempted, deleted };
}

async function purge(p) {
  const { keep, drop } = await loadDropIds(p);
  if (keep.length !== 2) {
    console.error(
      JSON.stringify({
        error: 'keep_count_unexpected',
        keep: keep.map((k) => k.pn),
      }),
    );
    process.exit(2);
  }
  const dropIds = drop.map((u) => u.id);
  if (!dropIds.length) {
    console.log(JSON.stringify({ ok: true, deletedUsers: 0 }));
    return;
  }

  const mediaRows = await p.$queryRawUnsafe(
    `
    SELECT m."mediaUrl" AS "mediaUrl"
    FROM messages m
    WHERE m."senderId" = ANY($1::uuid[])
      AND m."mediaUrl" IS NOT NULL
      AND length(m."mediaUrl") > 0
      AND m."mediaUrl" NOT LIKE 'poll:%'
    `,
    dropIds,
  );
  const r2 = await tryDeleteR2(mediaRows.map((r) => r.mediaUrl));

  // Delete in FK-safe order inside a transaction via raw SQL.
  const result = await p.$transaction(async (tx) => {
    const stats = {};

    // Message reactions by drop users
    stats.reactions = Number(
      (
        await tx.$queryRawUnsafe(
          `WITH d AS (DELETE FROM message_reactions WHERE "userId" = ANY($1::uuid[]) RETURNING 1)
           SELECT count(*)::int AS n FROM d`,
          dropIds,
        )
      )[0].n,
    );

    // Recipient ciphers for messages sent by drop users
    stats.recipientCiphers = Number(
      (
        await tx.$queryRawUnsafe(
          `WITH d AS (
             DELETE FROM message_recipient_ciphers mrc
             USING messages m
             WHERE mrc."messageId" = m.id AND m."senderId" = ANY($1::uuid[])
             RETURNING 1
           ) SELECT count(*)::int AS n FROM d`,
          dropIds,
        )
      )[0].n,
    );

    // Also ciphers addressed to drop users
    stats.recipientCiphersTo = Number(
      (
        await tx.$queryRawUnsafe(
          `WITH d AS (
             DELETE FROM message_recipient_ciphers
             WHERE "recipientUserId" = ANY($1::uuid[])
             RETURNING 1
           ) SELECT count(*)::int AS n FROM d`,
          dropIds,
        )
      )[0].n,
    );

    stats.messages = Number(
      (
        await tx.$queryRawUnsafe(
          `WITH d AS (DELETE FROM messages WHERE "senderId" = ANY($1::uuid[]) RETURNING 1)
           SELECT count(*)::int AS n FROM d`,
          dropIds,
        )
      )[0].n,
    );

    stats.scheduled = Number(
      (
        await tx.$queryRawUnsafe(
          `WITH d AS (DELETE FROM scheduled_messages WHERE "senderId" = ANY($1::uuid[]) RETURNING 1)
           SELECT count(*)::int AS n FROM d`,
          dropIds,
        )
      )[0].n,
    );

    // Poll votes / options / polls created by drop
    stats.pollVotes = Number(
      (
        await tx.$queryRawUnsafe(
          `WITH d AS (DELETE FROM chat_poll_votes WHERE "userId" = ANY($1::uuid[]) RETURNING 1)
           SELECT count(*)::int AS n FROM d`,
          dropIds,
        )
      )[0].n,
    );

    // Remove drop participants
    stats.participants = Number(
      (
        await tx.$queryRawUnsafe(
          `WITH d AS (DELETE FROM chat_participants WHERE "userId" = ANY($1::uuid[]) RETURNING 1)
           SELECT count(*)::int AS n FROM d`,
          dropIds,
        )
      )[0].n,
    );

    // Orphan chats (0 participants) and their leftover messages/polls
    stats.orphanMessages = Number(
      (
        await tx.$queryRawUnsafe(`
          WITH orphan AS (
            SELECT c.id FROM chats c
            WHERE NOT EXISTS (SELECT 1 FROM chat_participants cp WHERE cp."chatId" = c.id)
          ),
          d AS (DELETE FROM messages m USING orphan o WHERE m."chatId" = o.id RETURNING 1)
          SELECT count(*)::int AS n FROM d
        `)
      )[0].n,
    );

    stats.orphanPollVotes = Number(
      (
        await tx.$queryRawUnsafe(`
          WITH orphan AS (
            SELECT c.id FROM chats c
            WHERE NOT EXISTS (SELECT 1 FROM chat_participants cp WHERE cp."chatId" = c.id)
          ),
          polls AS (SELECT p.id FROM chat_polls p JOIN orphan o ON o.id = p."chatId"),
          d AS (DELETE FROM chat_poll_votes v USING polls x WHERE v."pollId" = x.id RETURNING 1)
          SELECT count(*)::int AS n FROM d
        `)
      )[0].n,
    );
    stats.orphanPollOptions = Number(
      (
        await tx.$queryRawUnsafe(`
          WITH orphan AS (
            SELECT c.id FROM chats c
            WHERE NOT EXISTS (SELECT 1 FROM chat_participants cp WHERE cp."chatId" = c.id)
          ),
          polls AS (SELECT p.id FROM chat_polls p JOIN orphan o ON o.id = p."chatId"),
          d AS (DELETE FROM chat_poll_options o USING polls x WHERE o."pollId" = x.id RETURNING 1)
          SELECT count(*)::int AS n FROM d
        `)
      )[0].n,
    );
    stats.orphanPolls = Number(
      (
        await tx.$queryRawUnsafe(`
          WITH orphan AS (
            SELECT c.id FROM chats c
            WHERE NOT EXISTS (SELECT 1 FROM chat_participants cp WHERE cp."chatId" = c.id)
          ),
          d AS (DELETE FROM chat_polls p USING orphan o WHERE p."chatId" = o.id RETURNING 1)
          SELECT count(*)::int AS n FROM d
        `)
      )[0].n,
    );

    stats.orphanChats = Number(
      (
        await tx.$queryRawUnsafe(`
          WITH d AS (
            DELETE FROM chats c
            WHERE NOT EXISTS (SELECT 1 FROM chat_participants cp WHERE cp."chatId" = c.id)
            RETURNING 1
          ) SELECT count(*)::int AS n FROM d
        `)
      )[0].n,
    );

    stats.devices = Number(
      (
        await tx.$queryRawUnsafe(
          `WITH d AS (DELETE FROM device_identities WHERE "userId" = ANY($1::uuid[]) RETURNING 1)
           SELECT count(*)::int AS n FROM d`,
          dropIds,
        )
      )[0].n,
    );

    stats.trusted = Number(
      (
        await tx.$queryRawUnsafe(
          `WITH d AS (DELETE FROM trusted_login_devices WHERE "userId" = ANY($1::uuid[]) RETURNING 1)
           SELECT count(*)::int AS n FROM d`,
          dropIds,
        )
      )[0].n,
    );

    stats.ktl = Number(
      (
        await tx.$queryRawUnsafe(
          `WITH d AS (DELETE FROM key_transparency_log WHERE "userId" = ANY($1::uuid[]) RETURNING 1)
           SELECT count(*)::int AS n FROM d`,
          dropIds,
        )
      )[0].n,
    );

    stats.webauthn = Number(
      (
        await tx.$queryRawUnsafe(
          `WITH d AS (DELETE FROM webauthn_credentials WHERE "userId" = ANY($1::uuid[]) RETURNING 1)
           SELECT count(*)::int AS n FROM d`,
          dropIds,
        )
      )[0].n,
    );

    stats.glossary = Number(
      (
        await tx.$queryRawUnsafe(
          `WITH d AS (DELETE FROM glossary_entries WHERE "userId" = ANY($1::uuid[]) RETURNING 1)
           SELECT count(*)::int AS n FROM d`,
          dropIds,
        )
      )[0].n,
    );

    // Bots owned by / identity of drop users (cascade bot_updates)
    stats.botUpdates = Number(
      (
        await tx.$queryRawUnsafe(
          `WITH bots AS (
             SELECT id FROM bots WHERE "ownerId" = ANY($1::uuid[]) OR "botUserId" = ANY($1::uuid[])
           ),
           d AS (DELETE FROM bot_updates u USING bots b WHERE u."botId" = b.id RETURNING 1)
           SELECT count(*)::int AS n FROM d`,
          dropIds,
        )
      )[0].n,
    );
    stats.bots = Number(
      (
        await tx.$queryRawUnsafe(
          `WITH d AS (
             DELETE FROM bots
             WHERE "ownerId" = ANY($1::uuid[]) OR "botUserId" = ANY($1::uuid[])
             RETURNING 1
           ) SELECT count(*)::int AS n FROM d`,
          dropIds,
        )
      )[0].n,
    );

    // Clear decoy refs pointing at drop users
    await tx.$queryRawUnsafe(
      `UPDATE users SET "decoyUserId" = NULL WHERE "decoyUserId" = ANY($1::uuid[])`,
      dropIds,
    );

    stats.users = Number(
      (
        await tx.$queryRawUnsafe(
          `WITH d AS (DELETE FROM users WHERE id = ANY($1::uuid[]) RETURNING 1)
           SELECT count(*)::int AS n FROM d`,
          dropIds,
        )
      )[0].n,
    );

    // Assert ledger untouched count is readable
    const ledger = await tx.$queryRawUnsafe(
      `SELECT count(*)::int AS n FROM private_number_ledger`,
    );
    stats.ledgerAfter = Number(ledger[0].n);

    return stats;
  }, { timeout: 120000 });

  console.log(JSON.stringify({ ok: true, r2, deleted: result }, null, 2));
}

async function verify(p) {
  const users = await p.$queryRawUnsafe(`
    SELECT "privateNumber" AS pn, username, name
    FROM users ORDER BY "privateNumber"
  `);
  const ledger = await p.$queryRawUnsafe(
    `SELECT count(*)::int AS n FROM private_number_ledger`,
  );
  const counts = await p.$queryRawUnsafe(`
    SELECT
      (SELECT count(*)::int FROM users) AS users,
      (SELECT count(*)::int FROM chats) AS chats,
      (SELECT count(*)::int FROM messages) AS messages
  `);
  const pns = users.map((u) => u.pn).filter(Boolean);
  const ok =
    users.length === 2 &&
    KEEP_PN.has(pns[0]) &&
    KEEP_PN.has(pns[1]);
  console.log(
    JSON.stringify(
      {
        ok,
        users: users.map((u) => ({ pn: u.pn, username: u.username, name: u.name })),
        counts: counts[0],
        ledger: ledger[0].n,
      },
      null,
      2,
    ),
  );
  if (!ok) process.exit(3);
}

async function main() {
  const cmd = process.argv[2] || 'backup';
  const p = new PrismaClient();
  try {
    if (cmd === 'backup') await backup(p);
    else if (cmd === 'purge') await purge(p);
    else if (cmd === 'verify') await verify(p);
    else {
      console.error('usage: backup|purge|verify');
      process.exit(1);
    }
  } finally {
    await p.$disconnect();
  }
}

main().catch((e) => {
  console.error(e.message || String(e));
  process.exit(1);
});
