/**
 * Private (E2E) message storage rules.
 *
 * The server must never persist readable plaintext for private chats.
 * It stores an opaque ciphertext envelope only. The decryption key
 * stays on client devices — this module does not encrypt or decrypt.
 */

export const PRIVATE_PLAINTEXT_FORBIDDEN =
  'Este chat está en modo Privado: el servidor solo acepta un sobre cifrado (ciphertext). No se guarda texto legible.';

export type PrivateEnvelopeInput = {
  ciphertext: string;
  ciphertextType?: number | null;
  mediaUrl?: string | null;
  mediaType?: string | null;
  replyToId?: string | null;
  expiresAt?: Date | null;
  viewOnce?: boolean;
  /** Language tag for client UX only — never message body. */
  originalLanguage: string;
};

export type PrivateMessageDbFields = {
  originalText: string;
  translatedText: null;
  translatedLanguage: null;
  isTranslated: false;
  ciphertext: string;
  ciphertextType: number;
  isE2e: true;
  mediaUrl: string | null;
  mediaType: string | null;
  replyToId: string | null;
  expiresAt: Date | null;
  viewOnce: boolean;
  originalLanguage: string;
};

/**
 * Build Prisma `data` for a private message create.
 * Throws if ciphertext is missing/empty.
 * Any plaintextAttempt is ignored — never written to originalText/translatedText.
 */
export function buildPrivateMessageDbFields(
  input: PrivateEnvelopeInput,
  _plaintextAttempt?: string | null,
): PrivateMessageDbFields {
  const cipher = (input.ciphertext || '').trim();
  if (!cipher) {
    throw new Error(PRIVATE_PLAINTEXT_FORBIDDEN);
  }
  // Ciphertext must look like an envelope, not a short chat string.
  if (cipher.length < 16) {
    throw new Error('ciphertext demasiado corto para un sobre privado');
  }

  return {
    originalText: '', // schema requires String; empty = no readable body
    translatedText: null,
    translatedLanguage: null,
    isTranslated: false,
    ciphertext: cipher,
    ciphertextType:
      typeof input.ciphertextType === 'number' && Number.isFinite(input.ciphertextType)
        ? input.ciphertextType
        : 1,
    isE2e: true,
    mediaUrl: input.mediaUrl ?? null,
    mediaType: input.mediaType ?? null,
    replyToId: input.replyToId ?? null,
    expiresAt: input.expiresAt ?? null,
    viewOnce: Boolean(input.viewOnce),
    originalLanguage: input.originalLanguage || 'und',
  };
}

/** True if a DB row leaks readable private content. */
export function privateRowLeaksPlaintext(row: {
  isE2e?: boolean | null;
  originalText?: string | null;
  translatedText?: string | null;
  ciphertext?: string | null;
}): boolean {
  if (!row.isE2e) return false;
  const body = (row.originalText || '').trim();
  const translated = (row.translatedText || '').trim();
  if (body.length > 0) return true;
  if (translated.length > 0) return true;
  if (!(row.ciphertext || '').trim()) return true;
  return false;
}

/** Assert a freshly written private row is opaque. Throws if not. */
export function assertPrivateRowOpaque(
  row: {
    isE2e?: boolean | null;
    originalText?: string | null;
    translatedText?: string | null;
    ciphertext?: string | null;
  },
  forbiddenPlaintext?: string,
): void {
  if (!row.isE2e) {
    throw new Error('expected isE2e=true');
  }
  if (privateRowLeaksPlaintext(row)) {
    throw new Error('private message row leaks plaintext or lacks ciphertext');
  }
  if (forbiddenPlaintext && forbiddenPlaintext.trim()) {
    const needle = forbiddenPlaintext.trim();
    const hay = `${row.originalText || ''}\n${row.translatedText || ''}\n${row.ciphertext || ''}`;
    // Ciphertext is base64-ish; still fail if the exact plaintext appears.
    if (hay.includes(needle)) {
      throw new Error('forbidden plaintext found inside private message row');
    }
  }
}
