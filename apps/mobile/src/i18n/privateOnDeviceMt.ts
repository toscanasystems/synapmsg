/**
 * Private-chat on-device MT via ML Kit (Android) / Apple+ML Kit (iOS).
 * Dictionary path is DISABLED for new Private translates — never pretend it is a model.
 * Never calls DeepL. Never uploads plaintext to a translation server.
 */

import {
  isMlkitModelMissing,
  mlkitAvailable,
  mlkitIdentifyLanguage,
  mlkitIsModelDownloaded,
  mlkitTranslate,
  MlkitModelMissingError,
} from 'synap-mlkit-translate';
import { getGlossaryCache, GlossaryEntry } from './glossaryCache';

/** Product rule: at most 20 do-not-translate terms for Private on-device. */
export const PRIVATE_GLOSSARY_MAX = 20;

export type PrivateMtStatus =
  | { ok: true; engine: 'mlkit' }
  | { ok: false; reason: 'native_missing' | 'model_missing'; message: string; languageCode?: string };

function glossarySlice(entries: GlossaryEntry[] = getGlossaryCache()): GlossaryEntry[] {
  return entries
    .filter((e) => e.source.trim().length > 0)
    .slice(0, PRIVATE_GLOSSARY_MAX);
}

/** Protect glossary sources so the engine leaves them unchanged. */
export function protectGlossaryTerms(
  text: string,
  entries: GlossaryEntry[] = glossarySlice(),
): { text: string; tokens: Array<{ token: string; restore: string }> } {
  let out = text;
  const tokens: Array<{ token: string; restore: string }> = [];
  const sorted = [...entries].sort((a, b) => b.source.length - a.source.length);
  sorted.forEach((e, i) => {
    const source = e.source.trim();
    if (!source) return;
    // Keep the original spelling (do not translate these words).
    // PUA markers — ML Kit leaves them alone (ASCII __GLOSSARY_n__ gets mangled).
    const restore = source;
    const token = `\uE000${i}\uE001`;
    const escaped = source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const next = out.replace(new RegExp(escaped, 'gi'), token);
    if (next !== out) {
      tokens.push({ token, restore });
      out = next;
    }
  });
  return { text: out, tokens };
}

export function restoreGlossaryTerms(
  text: string,
  tokens: Array<{ token: string; restore: string }>,
): string {
  let out = text;
  for (const { token, restore } of tokens) {
    out = out.split(token).join(restore);
  }
  return out;
}

export async function ensurePrivateMtReady(
  sourceLang: string,
  targetLang: string,
): Promise<PrivateMtStatus> {
  if (!mlkitAvailable()) {
    return {
      ok: false,
      reason: 'native_missing',
      message:
        'Traducción en el teléfono requiere un development build con ML Kit (no Expo Go).',
    };
  }
  const src = sourceLang.slice(0, 2).toLowerCase();
  const tgt = targetLang.slice(0, 2).toLowerCase();
  if (!(await mlkitIsModelDownloaded(src))) {
    return {
      ok: false,
      reason: 'model_missing',
      languageCode: src,
      message: `Falta el paquete de idioma "${src}". Se baja una vez. Después no sale del teléfono.`,
    };
  }
  if (!(await mlkitIsModelDownloaded(tgt))) {
    return {
      ok: false,
      reason: 'model_missing',
      languageCode: tgt,
      message: `Falta el paquete de idioma "${tgt}". Se baja una vez. Después no sale del teléfono.`,
    };
  }
  return { ok: true, engine: 'mlkit' };
}

/**
 * Translate for a Private (E2E) message after local decrypt.
 * Throws MlkitModelMissingError if packs are not on device — never invents text.
 */
export async function translatePrivateOnDevice(
  plainText: string,
  preferredLang: string,
  sourceHint?: string | null,
): Promise<{
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
  via: 'mlkit';
} | null> {
  const trimmed = plainText.trim();
  if (!trimmed) return null;
  if (!mlkitAvailable()) {
    throw new Error(
      'Traducción en el teléfono requiere development build con ML Kit.',
    );
  }

  const target = (preferredLang || 'es').slice(0, 2).toLowerCase();
  let source =
    (sourceHint || '').slice(0, 2).toLowerCase() ||
    (await mlkitIdentifyLanguage(trimmed)) ||
    '';
  if (!source || source === 'und') {
    // Refuse to guess with the old dictionary — ask for packs / hint.
    source = target === 'en' ? 'es' : 'en';
  }
  if (source === target) return null;

  const ready = await ensurePrivateMtReady(source, target);
  if (!ready.ok) {
    throw new MlkitModelMissingError(ready.message, ready.languageCode || '');
  }

  const { text: protectedText, tokens } = protectGlossaryTerms(trimmed);
  const result = await mlkitTranslate(protectedText, source, target);
  const restored = restoreGlossaryTerms(result.text, tokens);
  if (!restored || restored === trimmed) return null;
  return {
    text: restored,
    sourceLanguage: result.sourceLanguage || source,
    targetLanguage: result.targetLanguage || target,
    via: 'mlkit',
  };
}

/**
 * Apply ML Kit MT to an inbound Private message. Cloud messages are untouched here.
 */
export async function applyPrivateOnDeviceMt<
  T extends {
    originalText: string;
    translatedText: string;
    translatedLanguage: string | null;
    originalLanguage?: string;
    isTranslated?: boolean;
    isE2e?: boolean;
    senderId: string;
  },
>(
  msg: T,
  preferredLang: string,
  myUserId: string | undefined,
): Promise<T & { mtError?: string }> {
  if (!myUserId || msg.senderId === myUserId) return msg;
  if (!msg.isE2e) return msg;
  if (!(msg.originalText || '').trim()) return msg;

  try {
    const hit = await translatePrivateOnDevice(
      msg.originalText,
      preferredLang,
      msg.originalLanguage,
    );
    if (!hit) return msg;
    return {
      ...msg,
      translatedText: hit.text,
      translatedLanguage: hit.targetLanguage,
      originalLanguage: hit.sourceLanguage,
      isTranslated: true,
    };
  } catch (err) {
    if (isMlkitModelMissing(err)) {
      return {
        ...msg,
        mtError:
          err instanceof Error
            ? err.message
            : 'Falta bajar el idioma. Se baja una vez. Después no sale del teléfono.',
      };
    }
    return {
      ...msg,
      mtError: err instanceof Error ? err.message : 'No se pudo traducir en el teléfono',
    };
  }
}
