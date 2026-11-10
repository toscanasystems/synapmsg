import axios, { AxiosError } from 'axios';

/**
 * DeepL API v2 (free tier) translation service.
 *
 * Docs: https://developers.deepl.com/docs/api-reference/translate/openapi-spec-for-translation-endpoint
 *
 * Free keys end in ":fx" and use https://api-free.deepl.com/v2/translate
 * Pro keys use https://api.deepl.com/v2/translate
 */

const DEEPL_API_KEY: string = process.env.DEEPL_API_KEY || '';
const DEEPL_API_URL: string =
  process.env.DEEPL_API_URL || 'https://api-free.deepl.com/v2/translate';

// DeepL uses uppercase ISO-639-1 codes (e.g. "ES", "EN").
export const SUPPORTED_LANGUAGES: readonly string[] = [
  'ES', 'EN', 'PT', 'FR', 'IT', 'DE', 'ZH', 'JA', 'KO', 'AR', 'RU', 'HI',
];

const SUPPORTED_SET = new Set(SUPPORTED_LANGUAGES);

export function isSupportedLanguage(lang: string | undefined | null): lang is string {
  return typeof lang === 'string' && SUPPORTED_SET.has(lang.toUpperCase());
}

/**
 * Normalize a lowercase ISO code ("es") to DeepL's uppercase format ("ES").
 */
export function normalizeLanguageCode(lang: string): string {
  return lang.trim().toUpperCase();
}

export interface TranslateResult {
  text: string;
  detectedSourceLanguage?: string;
}

export interface TranslateBatchResult {
  translations: TranslateResult[];
  failed: boolean;
}

/**
 * Translate an array of texts to a single target language.
 * Returns the original texts on failure so callers can degrade gracefully.
 */
export async function translateTexts(
  texts: string[],
  targetLang: string,
  sourceLang?: string
): Promise<TranslateBatchResult> {
  if (!texts.length) {
    return { translations: [], failed: false };
  }

  const target = normalizeLanguageCode(targetLang);
  if (!isSupportedLanguage(target)) {
    // Unsupported target language: return originals untouched.
    return {
      translations: texts.map((t) => ({ text: t })),
      failed: true,
    };
  }

  if (!DEEPL_API_KEY) {
    // No key configured — degrade gracefully.
    return {
      translations: texts.map((t) => ({ text: t })),
      failed: true,
    };
  }

  try {
    const body: Record<string, unknown> = {
      text: texts,
      target_lang: target,
    };
    if (sourceLang) {
      const src = normalizeLanguageCode(sourceLang);
      if (isSupportedLanguage(src)) {
        body.source_lang = src;
      }
    }

    const resp = await axios.post(
      DEEPL_API_URL,
      new URLSearchParams(
        // DeepL's free tier accepts both JSON and form-urlencoded; URLSearchParams
        // is the most widely-compatible and avoids content-type edge cases.
        texts.flatMap((t) => [['text', t] as [string, string]]).concat(
          Object.entries(body).map(([k, v]) => [k, String(v)] as [string, string])
        )
      ).toString(),
      {
        headers: {
          Authorization: `DeepL-Auth-Key ${DEEPL_API_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        timeout: 8000,
      }
    );

    const translations = (resp.data?.translations ?? []) as Array<{
      text: string;
      detected_source_language?: string;
    }>;

    return {
      translations: translations.map((t) => ({
        text: t.text,
        detectedSourceLanguage: t.detected_source_language,
      })),
      failed: false,
    };
  } catch (err) {
    const axiosErr = err as AxiosError;
    const status = axiosErr.response?.status;
    // eslint-disable-next-line no-console
    console.error(
      `[translation] DeepL request failed (status=${status}):`,
      axiosErr.message
    );
    // Graceful degradation — return originals.
    return {
      translations: texts.map((t) => ({ text: t })),
      failed: true,
    };
  }
}

/**
 * Translate a single text. Returns the translated string or the
 * original if translation failed / was unsupported.
 */
export async function translateText(
  text: string,
  targetLang: string,
  sourceLang?: string
): Promise<{ text: string; translated: boolean }> {
  const { translations, failed } = await translateTexts([text], targetLang, sourceLang);
  return {
    text: translations[0]?.text ?? text,
    translated: !failed,
  };
}

/**
 * Batch-translate one source text into many target languages.
 * Returns a map of uppercase language code -> translated text.
 * Missing or failed entries fall back to the original text.
 */
export async function translateForRecipients(
  text: string,
  targetLanguages: string[],
  sourceLang?: string
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (targetLanguages.length === 0) return out;

  // Deduplicate target languages to minimize DeepL calls.
  const uniqueTargets = Array.from(new Set(targetLanguages.map(normalizeLanguageCode)));

  // DeepL supports passing multiple `target_lang` is NOT possible in a single
  // request, so we issue one request per distinct target language in parallel.
  const results = await Promise.all(
    uniqueTargets.map(async (target) => {
      const { translations, failed } = await translateTexts([text], target, sourceLang);
      return { target, text: translations[0]?.text ?? text, failed };
    })
  );

  for (const r of results) {
    out.set(r.target, r.text);
  }
  return out;
}
