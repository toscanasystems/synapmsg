/**
 * Repair broken accents (U+FFFD / mojibake) in users + messages.
 * Usage from apps/api: node scripts/fix-utf8.js
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const REPL = /\uFFFD|\uFFFD/g;

function repairText(input) {
  if (!input || typeof input !== 'string') return input;
  let s = input;

  // Targeted Spanish repairs around replacement characters
  const pairs = [
    [/ingl.s/gi, 'inglés'],
    [/autom.ticamente/gi, 'automáticamente'],
    [/Espa.ol/gi, 'Español'],
    [/espa.ol/gi, 'español'],
    [/[Cc].mo\b/g, (m) => (m[0] === 'C' ? 'Cómo' : 'cómo')],
    [/est.s\b/gi, 'estás'],
    [/d.a\b/gi, 'día'],
    [/ma.ana/gi, 'mañana'],
    [/reuni.n/gi, 'reunión'],
    [/tambi.n/gi, 'también'],
    [/r.pido/gi, 'rápido'],
    [/informaci.n/gi, 'información'],
  ];

  for (const [re, rep] of pairs) {
    s = s.replace(re, rep);
  }

  // If still has replacement chars in known full phrases, rewrite wholesale
  if (/\uFFFD/.test(s) && /traducirse/i.test(s)) {
    s =
      'Hola, este mensaje debe traducirse al inglés automáticamente.';
  }

  return s;
}

async function main() {
  let usersFixed = 0;
  const users = await prisma.user.findMany({ select: { id: true, name: true, username: true } });
  for (const u of users) {
    let next = repairText(u.name);
    if (u.username === 'demo_es') next = 'Demo Español';
    if (next !== u.name) {
      await prisma.user.update({ where: { id: u.id }, data: { name: next } });
      usersFixed += 1;
      console.log('user', u.username, JSON.stringify(u.name), '->', JSON.stringify(next));
    }
  }

  let msgFixed = 0;
  const messages = await prisma.message.findMany({
    select: { id: true, originalText: true, translatedText: true },
  });
  for (const m of messages) {
    const o = repairText(m.originalText);
    const t = m.translatedText == null ? null : repairText(m.translatedText);
    if (o !== m.originalText || t !== m.translatedText) {
      await prisma.message.update({
        where: { id: m.id },
        data: { originalText: o, translatedText: t },
      });
      msgFixed += 1;
      console.log('msg', m.id.slice(0, 8), JSON.stringify(m.originalText), '->', JSON.stringify(o));
    }
  }

  console.log(JSON.stringify({ ok: true, usersFixed, msgFixed }));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
