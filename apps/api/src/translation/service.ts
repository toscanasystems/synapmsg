import axios, { AxiosError } from 'axios';

/**
 * DeepL + fallbacks (MyMemory) for LatAm languages DeepL no cubre.
 */

const DEEPL_API_KEY: string = process.env.DEEPL_API_KEY || '';
const DEEPL_API_URL: string =
  process.env.DEEPL_API_URL || 'https://api-free.deepl.com/v2/translate';

/** Native DeepL targets. */
export const DEEPL_LANGUAGES: readonly string[] = [
  'ES', 'EN', 'PT', 'FR', 'IT', 'DE', 'ZH', 'JA', 'KO', 'RU',
  'NL', 'PL', 'TR', 'UK', 'SV', 'DA', 'FI', 'EL', 'CS', 'RO', 'ID', 'BG', 'NB', 'HU',
];

/**
 * Synapmsg-supported codes (lowercase app codes).
 * qu / gn / quc → puente vía ES + MyMemory cuando exista.
 */
export const APP_LANGUAGES: readonly string[] = [
  'es', 'en', 'pt', 'fr', 'it', 'de', 'zh', 'ja', 'ko', 'ru',
  'nl', 'pl', 'tr', 'uk', 'sv', 'da', 'fi', 'el', 'cs', 'ro', 'id', 'bg', 'nb', 'hu',
  'qu', 'gn', 'quc',
];

const DEEPL_SET = new Set(DEEPL_LANGUAGES);

/** Map app/DeepL codes that need a bridge. */
const BRIDGE_TO_DEEPL: Record<string, string> = {
  QU: 'ES',
  GN: 'ES',
  QUC: 'ES',
};

export function normalizeLanguageCode(lang: string): string {
  return lang.trim().toUpperCase();
}

export function toAppLanguageCode(lang: string): string {
  return lang.trim().toLowerCase();
}

export function isAppLanguage(lang: string | undefined | null): boolean {
  return typeof lang === 'string' && APP_LANGUAGES.includes(lang.toLowerCase());
}

export function isDeepLLanguage(lang: string): boolean {
  return DEEPL_SET.has(normalizeLanguageCode(lang));
}

/** DeepL target for a Synapmsg language (may be a bridge). */
export function deeplTargetFor(lang: string): string {
  const code = normalizeLanguageCode(lang);
  return BRIDGE_TO_DEEPL[code] ?? code;
}

export interface TranslateResult {
  text: string;
  detectedSourceLanguage?: string;
}

export interface TranslateBatchResult {
  translations: TranslateResult[];
  failed: boolean;
}

export type GlossaryPair = { source: string; target: string };

/** Protect glossary terms before MT; restore preferred targets after. */
export function applyGlossaryProtect(
  text: string,
  entries: GlossaryPair[],
): { text: string; tokens: Array<{ token: string; target: string }> } {
  let out = text;
  const tokens: Array<{ token: string; target: string }> = [];
  const sorted = [...entries]
    .filter((e) => e.source.trim().length > 0)
    .sort((a, b) => b.source.length - a.source.length);
  sorted.forEach((e, i) => {
    const token = `__SMG${i}__`;
    const re = new RegExp(escapeRegExp(e.source.trim()), 'gi');
    if (re.test(out)) {
      out = out.replace(re, token);
      tokens.push({ token, target: e.target.trim() || e.source.trim() });
    }
  });
  return { text: out, tokens };
}

export function restoreGlossary(
  text: string,
  tokens: Array<{ token: string; target: string }>,
): string {
  let out = text;
  for (const t of tokens) {
    out = out.split(t.token).join(t.target);
  }
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function translateViaMyMemory(
  text: string,
  source: string,
  target: string,
): Promise<string | null> {
  try {
    const pair = `${source.toLowerCase()}|${target.toLowerCase()}`;
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
      text.slice(0, 450),
    )}&langpair=${encodeURIComponent(pair)}`;
    const resp = await axios.get(url, { timeout: 7000 });
    const translated = resp.data?.responseData?.translatedText;
    if (typeof translated === 'string' && translated.trim()) {
      return translated.trim();
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Translate texts to one target. Auto-detects source when sourceLang omitted.
 */
export async function translateTexts(
  texts: string[],
  targetLang: string,
  sourceLang?: string,
): Promise<TranslateBatchResult> {
  if (!texts.length) {
    return { translations: [], failed: false };
  }

  const appTarget = normalizeLanguageCode(targetLang);
  const deeplTarget = deeplTargetFor(appTarget);
  const needsBridge = Boolean(BRIDGE_TO_DEEPL[appTarget]);

  if (!isDeepLLanguage(deeplTarget) && !needsBridge) {
    return {
      translations: texts.map((t) => ({ text: t })),
      failed: true,
    };
  }

  if (!DEEPL_API_KEY) {
    // Try MyMemory directly for LatAm bridge langs.
    if (needsBridge || !isDeepLLanguage(appTarget)) {
      const src = sourceLang ? normalizeLanguageCode(sourceLang).slice(0, 2) : 'es';
      const results = await Promise.all(
        texts.map(async (t) => {
          const hit = await translateViaMyMemory(t, src, appTarget.slice(0, 2).toLowerCase());
          return { text: hit ?? t };
        }),
      );
      return { translations: results, failed: results.every((r, i) => r.text === texts[i]) };
    }
    return {
      translations: texts.map((t) => ({ text: t })),
      failed: true,
    };
  }

  try {
    const body: Record<string, unknown> = {
      text: texts,
      target_lang: deeplTarget === 'EN' ? 'EN' : deeplTarget,
    };
    // Prefer auto-detect unless caller forces a DeepL-native source.
    if (sourceLang) {
      const src = normalizeLanguageCode(sourceLang);
      const deeplSrc = deeplTargetFor(src);
      if (isDeepLLanguage(deeplSrc)) {
        body.source_lang = deeplSrc === 'EN' ? 'EN' : deeplSrc;
      }
    }

    const params = new URLSearchParams();
    for (const t of texts) params.append('text', t);
    params.set('target_lang', String(body.target_lang));
    if (body.source_lang) params.set('source_lang', String(body.source_lang));

    const resp = await axios.post(DEEPL_API_URL, params.toString(), {
      headers: {
        Authorization: `DeepL-Auth-Key ${DEEPL_API_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      timeout: 8000,
    });

    const translations = (resp.data?.translations ?? []) as Array<{
      text: string;
      detected_source_language?: string;
    }>;

    let mapped = translations.map((t) => ({
      text: t.text,
      detectedSourceLanguage: t.detected_source_language,
    }));

    // Bridge: DeepL → ES, then MyMemory ES → indigenous when requested.
    if (needsBridge) {
      mapped = await Promise.all(
        mapped.map(async (t, i) => {
          const native = await translateViaMyMemory(
            t.text,
            'es',
            appTarget.toLowerCase(),
          );
          return {
            text: native ?? t.text,
            detectedSourceLanguage: t.detectedSourceLanguage,
          };
        }),
      );
    }

    return { translations: mapped, failed: false };
  } catch (err) {
    const axiosErr = err as AxiosError;
    // eslint-disable-next-line no-console
    console.error(
      `[translation] DeepL failed (status=${axiosErr.response?.status}):`,
      axiosErr.message,
    );
    return {
      translations: texts.map((t) => ({ text: t })),
      failed: true,
    };
  }
}

export async function translateText(
  text: string,
  targetLang: string,
  sourceLang?: string,
): Promise<{ text: string; translated: boolean; detectedSourceLanguage?: string }> {
  const { translations, failed } = await translateTexts([text], targetLang, sourceLang);
  return {
    text: translations[0]?.text ?? text,
    translated: !failed && (translations[0]?.text ?? text) !== text,
    detectedSourceLanguage: translations[0]?.detectedSourceLanguage,
  };
}

/**
 * Translate one text to many recipients. Auto-detects source language.
 * Applies optional glossary (protect → MT → restore).
 */
export async function translateForRecipients(
  text: string,
  targetLanguages: string[],
  sourceLangHint?: string,
  glossary: GlossaryPair[] = [],
): Promise<{ map: Map<string, string>; detectedSource: string }> {
  const out = new Map<string, string>();
  const { text: protectedText, tokens } = applyGlossaryProtect(text, glossary);
  const uniqueTargets = Array.from(
    new Set(targetLanguages.map(normalizeLanguageCode)),
  );

  let detectedSource = sourceLangHint
    ? normalizeLanguageCode(sourceLangHint)
    : '';

  // First pass: pick a DeepL-native target to get detection.
  const probeTarget =
    uniqueTargets.map(deeplTargetFor).find((t) => isDeepLLanguage(t)) || 'EN';

  if (!detectedSource) {
    const probe = await translateTexts([protectedText], probeTarget);
    const d = probe.translations[0]?.detectedSourceLanguage;
    if (d) detectedSource = normalizeLanguageCode(d);
  }
  if (!detectedSource && sourceLangHint) {
    detectedSource = normalizeLanguageCode(sourceLangHint);
  }
  if (!detectedSource) detectedSource = 'ES';

  const results = await Promise.all(
    uniqueTargets.map(async (target) => {
      // Skip same-language
      if (normalizeLanguageCode(target) === detectedSource) {
        return { target, text: restoreGlossary(protectedText, tokens) };
      }
      const { translations } = await translateTexts(
        [protectedText],
        target,
        detectedSource,
      );
      const raw = translations[0]?.text ?? protectedText;
      return { target, text: restoreGlossary(raw, tokens) };
    }),
  );

  for (const r of results) {
    out.set(r.target, r.text);
  }
  return { map: out, detectedSource };
}

/** @deprecated Use translateForRecipients().map — kept for call sites during migrate */
export async function translateForRecipientsLegacy(
  text: string,
  targetLanguages: string[],
  sourceLang?: string,
): Promise<Map<string, string>> {
  const { map } = await translateForRecipients(text, targetLanguages, sourceLang);
  return map;
}
