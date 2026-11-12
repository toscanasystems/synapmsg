import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertPrivateRowOpaque,
  buildPrivateMessageDbFields,
  privateRowLeaksPlaintext,
  PRIVATE_PLAINTEXT_FORBIDDEN,
} from './privateEnvelope';

describe('privateEnvelope — Fase 1', () => {
  it('stores empty originalText even if plaintext was attempted', () => {
    const secret = 'SECRETO_QUE_NO_DEBE_APARECER_EN_DB';
    const cipher = Buffer.from('opaque-envelope-bytes-here').toString('base64');
    const row = buildPrivateMessageDbFields(
      {
        ciphertext: cipher,
        ciphertextType: 1,
        originalLanguage: 'es',
      },
      secret,
    );
    assert.equal(row.originalText, '');
    assert.equal(row.translatedText, null);
    assert.equal(row.isE2e, true);
    assert.equal(row.ciphertext, cipher);
    assert.ok(!row.originalText.includes(secret));
    assert.ok(!String(row.translatedText || '').includes(secret));
    assertPrivateRowOpaque(row, secret);
  });

  it('rejects missing ciphertext', () => {
    assert.throws(
      () =>
        buildPrivateMessageDbFields({
          ciphertext: '',
          originalLanguage: 'es',
        }),
      (err: unknown) =>
        err instanceof Error && err.message === PRIVATE_PLAINTEXT_FORBIDDEN,
    );
  });

  it('detects leaky private rows', () => {
    assert.equal(
      privateRowLeaksPlaintext({
        isE2e: true,
        originalText: 'hola',
        ciphertext: 'abc',
      }),
      true,
    );
    assert.equal(
      privateRowLeaksPlaintext({
        isE2e: true,
        originalText: '',
        translatedText: null,
        ciphertext: 'long-enough-cipher',
      }),
      false,
    );
  });
});
