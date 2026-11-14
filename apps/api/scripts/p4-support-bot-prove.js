/**
 * Parte 4 proof: 5 questions from Samsung 53 → soporte_bot (cloud chat).
 * Uses bot token sendMessage for replies via support-bot-worker logic inline.
 * Does not print token.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');

const API = process.env.API_BASE || 'https://api.synapmsg.ai';
const PN53 = '5329910588';
const BOT_USER = 'soporte_bot';
const TOKEN_FILE = path.join(
  process.env.TEMP || '.',
  'synapmsg-support-bot-token.txt',
);

const QUESTIONS = [
  '¿Cómo creo una cuenta?',
  '¿Puedo recuperar con el correo?',
  '¿Cuáles son los precios de Premium?',
  '¿Es la más segura del mundo?',
  '¿Cuál es la latencia del satélite lunar?',
];

function normalize(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function loadFaq() {
  const mdPath = path.join(__dirname, '..', 'src', 'bots', 'supportFaq.md');
  const raw = fs.readFileSync(mdPath, 'utf8');
  const forbidden = [];
  const forbiddenBlock = raw.match(/## Prohibido[\s\S]*?(?=## FAQ|$)/i)?.[0];
  if (forbiddenBlock) {
    for (const line of forbiddenBlock.split('\n')) {
      const m = line.match(/^\s*-\s+(.+)/);
      if (m?.[1]) forbidden.push(normalize(m[1]));
    }
  }
  const entries = [];
  const faqPart = raw.split(/## FAQ/i)[1] || '';
  for (const section of faqPart.split(/\n###\s+/).slice(1)) {
    const lines = section.split('\n');
    const id = (lines[0] || '').trim();
    let keywords = [];
    const answerLines = [];
    let inAnswer = false;
    for (const line of lines.slice(1)) {
      if (/^keywords:/i.test(line)) {
        keywords = line
          .replace(/^keywords:\s*/i, '')
          .split(',')
          .map((k) => normalize(k))
          .filter(Boolean);
        continue;
      }
      if (/^answer:\s*\|?\s*$/i.test(line)) {
        inAnswer = true;
        continue;
      }
      if (inAnswer) answerLines.push(line.replace(/^\s{2}/, ''));
    }
    const answer = answerLines.join('\n').trim();
    if (id && keywords.length && answer) entries.push({ id, keywords, answer });
  }
  return { forbidden, entries };
}

function match(text, faq) {
  const n = normalize(text);
  for (const claim of faq.forbidden) {
    if (claim && n.includes(claim)) return { kind: 'forbidden' };
  }
  let best = null;
  for (const e of faq.entries) {
    let hits = 0;
    let score = 0;
    for (const kw of e.keywords) {
      if (kw && n.includes(kw)) {
        hits++;
        score += kw.length;
      }
    }
    if (
      hits > 0 &&
      (!best || hits > best.hits || (hits === best.hits && score > best.score))
    )
      best = { kind: 'answer', id: e.id, text: e.answer, hits, score };
  }
  return best || { kind: 'unknown' };
}

async function main() {
  const token = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
  const faq = loadFaq();
  const prisma = new PrismaClient();

  const u53 = (
    await prisma.$queryRawUnsafe(
      `SELECT id::text AS id FROM users WHERE "privateNumber" = $1`,
      PN53,
    )
  )[0];
  const bot = (
    await prisma.$queryRawUnsafe(
      `SELECT b.id::text AS id, b."botUserId"::text AS "botUserId", u."privateNumber" AS pn
       FROM bots b JOIN users u ON u.id = b."botUserId" WHERE b.username = $1`,
      BOT_USER,
    )
  )[0];
  if (!u53 || !bot) {
    console.error('missing_users');
    process.exit(2);
  }

  let chat = (
    await prisma.$queryRawUnsafe(
      `SELECT c.id::text AS id FROM chats c
       JOIN chat_participants a ON a."chatId"=c.id AND a."userId"=$1::uuid
       JOIN chat_participants b ON b."chatId"=c.id AND b."userId"=$2::uuid
       WHERE c.type='single' LIMIT 1`,
      u53.id,
      bot.botUserId,
    )
  )[0];

  if (!chat) {
    const chatId = crypto.randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO chats (id, type, "encryptionMode", "disappearHours", "disappearSeconds",
        "disappearText", "disappearImage", "disappearAudio", "createdAt", "updatedAt")
       VALUES ($1::uuid, 'single', 'cloud', 0, 0, true, true, true, NOW(), NOW())`,
      chatId,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO chat_participants (id, "chatId", "userId", role, "joinedAt")
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, 'admin', NOW()),
              (gen_random_uuid(), $1::uuid, $3::uuid, 'member', NOW())`,
      chatId,
      u53.id,
      bot.botUserId,
    );
    chat = { id: chatId };
  } else {
    await prisma.$executeRawUnsafe(
      `UPDATE chats SET "encryptionMode"='cloud' WHERE id=$1::uuid`,
      chat.id,
    );
  }

  const results = [];
  for (const q of QUESTIONS) {
    const m = match(q, faq);
    let reply;
    if (m.kind === 'answer') reply = m.text;
    else if (m.kind === 'forbidden')
      reply =
        'Eso no está demostrado en nuestra documentación (docs/HECHO.md) y no lo afirmo.';
    else
      reply =
        `No tengo una respuesta escrita para eso.\n` +
        `Abrí un ticket. Un humano responderá a administrador@toscanasystems.com.`;

    // Persist human question + bot answer via Bot API sendMessage for the reply
    // (question via raw insert so prod bots notify path is optional)
    await prisma.$executeRawUnsafe(
      `INSERT INTO messages (id, "chatId", "senderId", "originalText", "originalLanguage",
        "isTranslated", "isE2e", "viewOnce", "createdAt")
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3, 'es', false, false, false, NOW())`,
      chat.id,
      u53.id,
      q,
    );

    const send = await fetch(
      `${API}/bots/${encodeURIComponent(token)}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chat.id, text: reply }),
      },
    );
    const body = await send.text();
    results.push({
      q,
      kind: m.kind,
      id: m.id || null,
      status: send.status,
      replyStart: reply.slice(0, 60).replace(/\n/g, ' '),
      err: send.ok ? null : body.slice(0, 120),
    });
  }

  console.log(
    JSON.stringify(
      {
        botPn: bot.pn,
        chatId8: chat.id.slice(0, 8),
        results,
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
  if (results.some((r) => r.status >= 400)) process.exit(4);
}

main().catch((e) => {
  console.error(e.message || String(e));
  process.exit(1);
});
