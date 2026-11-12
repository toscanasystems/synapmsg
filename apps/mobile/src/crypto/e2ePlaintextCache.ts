/**
 * Persist opened Private plaintext on-device so catch-up / app restart
 * never SessionCipher-opens a spent Signal envelope again.
 */
import { sqlQuery, sqlUpsert } from '../security/sqlcipherStore';

const TABLE = 'e2e_plain_v1';

type Row = {
  id: string;
  chatId: string;
  ciphertext: string;
  originalText: string;
  translatedText: string;
  updatedAt: string;
};

export async function loadCachedPlaintext(
  messageId: string,
  ciphertext: string | null | undefined,
): Promise<{ originalText: string; translatedText: string } | null> {
  if (!messageId || !ciphertext) return null;
  try {
    const rows = await sqlQuery(TABLE, (r) => String(r.id) === messageId);
    const row = rows[0] as Row | undefined;
    if (!row?.originalText) return null;
    if (row.ciphertext !== ciphertext) return null;
    if (row.originalText.startsWith('🔒')) return null;
    return {
      originalText: row.originalText,
      translatedText: row.translatedText || row.originalText,
    };
  } catch {
    return null;
  }
}

export async function saveCachedPlaintext(input: {
  id: string;
  chatId: string;
  ciphertext: string;
  originalText: string;
  translatedText?: string;
}): Promise<void> {
  if (!input.id || !input.ciphertext) return;
  if (!input.originalText || input.originalText.startsWith('🔒')) return;
  try {
    const row: Row = {
      id: input.id,
      chatId: input.chatId,
      ciphertext: input.ciphertext,
      originalText: input.originalText,
      translatedText: input.translatedText || input.originalText,
      updatedAt: new Date().toISOString(),
    };
    await sqlUpsert(TABLE, row, 'id');
  } catch (err) {
    console.warn(
      '[signal] plaintext cache save failed',
      err instanceof Error ? err.message : err,
    );
  }
}

/** Spent ratchet / already-opened PreKey — retrying burns nothing useful. */
export function isSpentSignalEnvelopeError(cause: string): boolean {
  const c = cause.toLowerCase();
  return (
    c.includes('message key not found') ||
    c.includes('counter was repeated') ||
    c.includes('key was not filled') ||
    c.includes('no valid sessions') ||
    c.includes('session closed')
  );
}
