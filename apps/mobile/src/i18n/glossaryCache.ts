/**
 * User glossary cache for on-device translation (no cloud MT).
 */

import { usersApi } from '../api/messages';

export type GlossaryEntry = { source: string; target: string };

let cache: GlossaryEntry[] = [];
let loadedAt = 0;

export function getGlossaryCache(): GlossaryEntry[] {
  return cache;
}

export async function hydrateGlossary(force = false): Promise<GlossaryEntry[]> {
  if (!force && cache.length && Date.now() - loadedAt < 60_000) {
    return cache;
  }
  try {
    const entries = await usersApi.listGlossary();
    cache = entries.map((e) => ({
      source: e.source.trim(),
      target: e.target.trim(),
    })).filter((e) => e.source && e.target);
    loadedAt = Date.now();
  } catch {
    /* keep previous */
  }
  return cache;
}

export function setGlossaryLocal(entries: GlossaryEntry[]): void {
  cache = entries
    .map((e) => ({ source: e.source.trim(), target: e.target.trim() }))
    .filter((e) => e.source && e.target);
  loadedAt = Date.now();
}

/** Apply longer sources first to avoid partial clobber. */
export function applyGlossary(
  text: string,
  entries: GlossaryEntry[] = cache,
): string {
  if (!text || !entries.length) return text;
  const sorted = [...entries].sort(
    (a, b) => b.source.length - a.source.length,
  );
  let out = text;
  for (const { source, target } of sorted) {
    if (!source) continue;
    const escaped = source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(escaped, 'gi'), target);
  }
  return out;
}
