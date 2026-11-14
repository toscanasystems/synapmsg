/**
 * Seed official soporte_bot with a new Private Number (owner = Toscana 89).
 * Uses raw SQL to avoid Prisma schema drift on unused columns.
 * Token → %TEMP%\synapmsg-support-bot-token.txt only (never printed).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { randomInt } = require('crypto');
const argon2 = require('argon2');
const { PrismaClient } = require('@prisma/client');

const USERNAME = 'soporte_bot';
const NAME = 'Soporte Synapmsg';
const OWNER_PN = '8953998750';

function format(d) {
  return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6, 10)}`;
}

async function main() {
  const prisma = new PrismaClient();
  const tokenFile = path.join(
    process.env.TEMP || '.',
    'synapmsg-support-bot-token.txt',
  );

  const existing = await prisma.$queryRawUnsafe(
    `SELECT b.id::text AS id, b.token, b."botUserId"::text AS "botUserId",
            u."privateNumber" AS pn
     FROM bots b
     JOIN users u ON u.id = b."botUserId"
     WHERE b.username = $1
     LIMIT 1`,
    USERNAME,
  );
  if (existing[0]) {
    fs.writeFileSync(tokenFile, existing[0].token, { encoding: 'utf8' });
    console.log(
      JSON.stringify({
        ok: true,
        existed: true,
        username: USERNAME,
        pn: existing[0].pn,
        pnFormatted: existing[0].pn ? format(existing[0].pn) : null,
        tokenFile,
      }),
    );
    await prisma.$disconnect();
    return;
  }

  const owners = await prisma.$queryRawUnsafe(
    `SELECT id::text AS id FROM users WHERE "privateNumber" = $1 LIMIT 1`,
    OWNER_PN,
  );
  if (!owners[0]) {
    console.error('owner_missing');
    process.exit(2);
  }
  const ownerId = owners[0].id;

  let privateNumber = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    let n = String(randomInt(1, 10));
    for (let i = 1; i < 10; i++) n += String(randomInt(0, 10));
    const clash = await prisma.$queryRawUnsafe(
      `SELECT 1 AS x FROM users WHERE "privateNumber" = $1
       UNION ALL
       SELECT 1 FROM private_number_ledger WHERE "privateNumber" = $1
       LIMIT 1`,
      n,
    );
    if (clash.length) continue;
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO private_number_ledger ("privateNumber", "firstUserId", "createdAt")
         VALUES ($1, $2::uuid, NOW())`,
        n,
        ownerId,
      );
      privateNumber = n;
      break;
    } catch {
      /* race */
    }
  }
  if (!privateNumber) {
    console.error('alloc_fail');
    process.exit(3);
  }

  const token = `synbot_${crypto.randomBytes(24).toString('hex')}`;
  const passwordHash = await argon2.hash(crypto.randomBytes(32).toString('hex'));
  const email = `bot+${crypto.randomBytes(8).toString('hex')}@bots.synapmsg.internal`;
  const botUserId = crypto.randomUUID();
  const botId = crypto.randomUUID();

  await prisma.$executeRawUnsafe(
    `INSERT INTO users (
       id, email, username, name, "passwordHash", "privateNumber",
       "privateNumberShared", "preferredLanguage", "preferredTranslateMode",
       plan, "mediaBytesUsed", "translationsToday", "translationsDayKey",
       "fido2Enforced", "accountRecoveryConfirmed", "createdAt", "updatedAt"
     ) VALUES (
       $1::uuid, $2, $3, $4, $5, $6,
       true, 'es', 'cloud',
       'free', 0, 0, '',
       false, false, NOW(), NOW()
     )`,
    botUserId,
    email,
    USERNAME,
    NAME,
    passwordHash,
    privateNumber,
  );

  await prisma.$executeRawUnsafe(
    `UPDATE private_number_ledger SET "firstUserId" = $1::uuid
     WHERE "privateNumber" = $2 AND ("firstUserId" IS NULL OR "firstUserId" = $3::uuid)`,
    botUserId,
    privateNumber,
    ownerId,
  );

  await prisma.$executeRawUnsafe(
    `INSERT INTO bots (id, "ownerId", "botUserId", token, username, name, "createdAt", "updatedAt")
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, NOW(), NOW())`,
    botId,
    ownerId,
    botUserId,
    token,
    USERNAME,
    NAME,
  );

  fs.writeFileSync(tokenFile, token, { encoding: 'utf8' });
  console.log(
    JSON.stringify({
      ok: true,
      existed: false,
      username: USERNAME,
      pn: privateNumber,
      pnFormatted: format(privateNumber),
      tokenFile,
    }),
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e.message || String(e));
  process.exit(1);
});
