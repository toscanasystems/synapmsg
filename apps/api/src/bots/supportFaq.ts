/**
 * Written FAQ for the support bot — no generative AI.
 * Source of truth: supportFaq.md (parsed at module load).
 */

import fs from 'fs';
import path from 'path';

export type FaqEntry = {
  id: string;
  keywords: string[];
  answer: string;
};

export type FaqBundle = {
  forbidden: string[];
  entries: FaqEntry[];
};

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseFaqMarkdown(raw: string): FaqBundle {
  const forbidden: string[] = [];
  const entries: FaqEntry[] = [];

  const forbiddenBlock = raw.match(
    /## Prohibido[\s\S]*?(?=## FAQ|$)/i,
  )?.[0];
  if (forbiddenBlock) {
    for (const line of forbiddenBlock.split('\n')) {
      const m = line.match(/^\s*-\s+(.+)/);
      if (m?.[1]) forbidden.push(normalize(m[1]));
    }
  }

  const faqPart = raw.split(/## FAQ/i)[1] ?? '';
  const sections = faqPart.split(/\n###\s+/).slice(1);
  for (const section of sections) {
    const lines = section.split('\n');
    const id = (lines[0] || '').trim();
    if (!id) continue;
    let keywords: string[] = [];
    let answerLines: string[] = [];
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
      if (/^answer:\s*/i.test(line)) {
        answerLines.push(line.replace(/^answer:\s*/i, '').trim());
        inAnswer = true;
        continue;
      }
      if (inAnswer) {
        if (line.startsWith('###')) break;
        answerLines.push(line.replace(/^\s{2}/, ''));
      }
    }
    const answer = answerLines.join('\n').trim();
    if (keywords.length && answer) {
      entries.push({ id, keywords, answer });
    }
  }

  return { forbidden, entries };
}

let cached: FaqBundle | null = null;

export function loadSupportFaq(): FaqBundle {
  if (cached) return cached;
  const mdPath = path.join(__dirname, 'supportFaq.md');
  const raw = fs.readFileSync(mdPath, 'utf8');
  cached = parseFaqMarkdown(raw);
  return cached;
}

/** Test helper / scripts: reload from disk. */
export function reloadSupportFaqForTests(): FaqBundle {
  cached = null;
  return loadSupportFaq();
}

export type MatchResult =
  | { kind: 'answer'; id: string; text: string }
  | { kind: 'forbidden'; claim: string }
  | { kind: 'unknown' };

/**
 * Match user text to a written FAQ answer.
 * Forbidden claims → refusal pointing at HECHO.md.
 */
export function matchSupportFaq(userText: string): MatchResult {
  const faq = loadSupportFaq();
  const n = normalize(userText);
  if (!n) return { kind: 'unknown' };

  for (const claim of faq.forbidden) {
    if (claim && n.includes(claim)) {
      return { kind: 'forbidden', claim };
    }
  }

  let best: { id: string; answer: string; hits: number; score: number } | null =
    null;
  for (const entry of faq.entries) {
    let hits = 0;
    let score = 0;
    for (const kw of entry.keywords) {
      if (kw && n.includes(kw)) {
        hits += 1;
        score += kw.length;
      }
    }
    if (
      hits > 0 &&
      (!best || hits > best.hits || (hits === best.hits && score > best.score))
    ) {
      best = { id: entry.id, answer: entry.answer, hits, score };
    }
  }

  if (!best) return { kind: 'unknown' };
  return { kind: 'answer', id: best.id, text: best.answer };
}

export const SUPPORT_BOT_USERNAME = 'soporte_bot';

export function buildUnknownReply(ticketId: string): string {
  return (
    `No tengo una respuesta escrita para eso.\n` +
    `Abrí el ticket ${ticketId}. Un humano de Toscana Systems responderá ` +
    `a administrador@toscanasystems.com.\n` +
    `No envíes códigos de recuperación ni claves en el chat.`
  );
}

export function buildForbiddenReply(): string {
  return (
    `Eso no está demostrado en nuestra documentación (docs/HECHO.md) y no lo afirmo.\n` +
    `Si necesitás una persona: pedí hablar con un humano y abriré un ticket.`
  );
}
