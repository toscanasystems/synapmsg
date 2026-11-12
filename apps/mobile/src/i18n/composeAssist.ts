/**
 * On-device compose assist — tone / clarity / resumen. No cloud, no E2E upload.
 */

export type ComposeTone = 'formal' | 'corto' | 'claro' | 'resumen';

const FORMAL: Array<[RegExp, string]> = [
  [/\bhola\b/gi, 'Buenos días'],
  [/\bbye\b/gi, 'Saludos cordiales'],
  [/\bok\b/gi, 'De acuerdo'],
  [/\bgracias\b/gi, 'Muchas gracias'],
  [/\bporfa\b/gi, 'por favor'],
  [/\bxfa\b/gi, 'por favor'],
];

const CORTO: Array<[RegExp, string]> = [
  [/\bpor favor\b/gi, 'xfa'],
  [/\bmuchas gracias\b/gi, 'gracias'],
  [/\bde acuerdo\b/gi, 'ok'],
  [/\bbuenos días\b/gi, 'hola'],
  [/\bsaludos cordiales\b/gi, 'saludos'],
];

const CLARO: Array<[RegExp, string]> = [
  [/\basap\b/gi, 'lo antes posible'],
  [/\bbtw\b/gi, 'por cierto'],
  [/\bidk\b/gi, 'no sé'],
  [/\bimho\b/gi, 'en mi opinión'],
  [/\blol\b/gi, ''],
];

/** Heuristic local summary — first sentence + key lines, capped. */
export function summarizeCompose(text: string, maxChars = 160): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return clean;
  if (clean.length <= maxChars) return clean;

  const sentences = clean.split(/(?<=[.!?…])\s+/).filter(Boolean);
  if (sentences.length >= 2) {
    let out = sentences[0]!;
    for (let i = 1; i < sentences.length; i++) {
      const next = `${out} ${sentences[i]}`;
      if (next.length > maxChars) break;
      out = next;
    }
    return out.length < clean.length ? `${out}…` : out;
  }

  const cut = clean.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

export function assistCompose(text: string, tone: ComposeTone): string {
  let out = text.trim();
  if (!out) return out;
  if (tone === 'resumen') return summarizeCompose(out);
  const rules =
    tone === 'formal' ? FORMAL : tone === 'corto' ? CORTO : CLARO;
  for (const [re, rep] of rules) {
    out = out.replace(re, rep);
  }
  return out.replace(/\s{2,}/g, ' ').trim();
}

export const COMPOSE_TONES: Array<{ id: ComposeTone; label: string }> = [
  { id: 'formal', label: 'Formal' },
  { id: 'corto', label: 'Corto' },
  { id: 'claro', label: 'Claro' },
  { id: 'resumen', label: 'Resumen' },
];
