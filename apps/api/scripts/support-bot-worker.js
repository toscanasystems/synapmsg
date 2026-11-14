/**
 * Local support-bot worker (written FAQ). Polls prod getUpdates and replies.
 * Use until the API auto-reply hook is deployed. Token from temp file only.
 */
const fs = require('fs');
const path = require('path');

const API = process.env.API_BASE || 'https://api.synapmsg.ai';
const TOKEN_FILE = path.join(
  process.env.TEMP || '.',
  'synapmsg-support-bot-token.txt',
);

// Inline FAQ matcher (mirrors supportFaq.ts) so worker runs without build.
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
    let score = 0;
    for (const kw of e.keywords) if (kw && n.includes(kw)) score += kw.length;
    if (score > 0 && (!best || score > best.score))
      best = { id: e.id, text: e.answer, score };
  }
  return best ? { kind: 'answer', ...best } : { kind: 'unknown' };
}

async function main() {
  if (!fs.existsSync(TOKEN_FILE)) {
    console.error('missing_token_file');
    process.exit(2);
  }
  const token = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
  const faq = loadFaq();
  let offset = 0;
  const seen = new Set();
  const results = [];

  for (let round = 0; round < 40; round++) {
    const url = `${API}/bots/${encodeURIComponent(token)}/getUpdates?offset=${offset}&limit=50`;
    const res = await fetch(url);
    const body = await res.json().catch(() => ({}));
    const updates = body.updates || body.result || [];
    if (!Array.isArray(updates) || !updates.length) {
      await new Promise((r) => setTimeout(r, 1500));
      continue;
    }
    for (const u of updates) {
      const updateId = u.update_id ?? u.updateId;
      if (typeof updateId === 'number') offset = Math.max(offset, updateId + 1);
      const msg = u.message || {};
      const text = String(msg.text || '').trim();
      const chatId = msg.chat?.id;
      const key = `${chatId}:${msg.message_id || updateId}`;
      if (!text || !chatId || seen.has(key)) continue;
      seen.add(key);
      const m = match(text, faq);
      let reply;
      if (m.kind === 'answer') reply = m.text;
      else if (m.kind === 'forbidden')
        reply =
          'Eso no está demostrado en nuestra documentación (docs/HECHO.md) y no lo afirmo.';
      else
        reply =
          `No tengo una respuesta escrita para eso.\n` +
          `Abrí un ticket. Un humano responderá a administrador@toscanasystems.com.\n` +
          `No envíes códigos de recuperación ni claves.`;
      const send = await fetch(
        `${API}/bots/${encodeURIComponent(token)}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: reply }),
        },
      );
      results.push({
        q: text.slice(0, 80),
        kind: m.kind,
        id: m.id || null,
        status: send.status,
      });
      console.log(JSON.stringify(results[results.length - 1]));
    }
    if (results.length >= 5) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.log(JSON.stringify({ done: true, replied: results.length, results }));
}

main().catch((e) => {
  console.error(e.message || String(e));
  process.exit(1);
});
