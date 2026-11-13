/**
 * Permanent guard: Private chats never persist readable plaintext.
 * Do not weaken these when adding calls/groups.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertPrivateRowOpaque,
  buildPrivateMessageDbFields,
  privateRowLeaksPlaintext,
  PRIVATE_PLAINTEXT_FORBIDDEN,
} from '../messages/privateEnvelope';

describe('privateEnvelope — mensajes Privados', () => {
  it('guarda originalText vacío aunque se intente pasar plaintext', () => {
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

  it('rechaza ciphertext vacío', () => {
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

  it('rechaza ciphertext demasiado corto (no es un sobre)', () => {
    assert.throws(
      () =>
        buildPrivateMessageDbFields({
          ciphertext: 'corto',
          originalLanguage: 'es',
        }),
      /ciphertext demasiado corto/,
    );
  });

  it('detecta filas Privadas con fuga de plaintext', () => {
    assert.equal(
      privateRowLeaksPlaintext({
        isE2e: true,
        originalText: 'hola',
        ciphertext: 'abc123456789012345',
      }),
      true,
    );
    assert.equal(
      privateRowLeaksPlaintext({
        isE2e: true,
        originalText: '',
        translatedText: 'traduccion',
        ciphertext: 'abc123456789012345',
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

  it('assertPrivateRowOpaque falla si originalText no está vacío', () => {
    assert.throws(() =>
      assertPrivateRowOpaque({
        isE2e: true,
        originalText: 'leak',
        ciphertext: 'long-enough-cipher-xx',
      }),
    );
  });

  it('no marca fuga en mensajes Nube (isE2e=false)', () => {
    assert.equal(
      privateRowLeaksPlaintext({
        isE2e: false,
        originalText: 'texto nube ok',
        ciphertext: null,
      }),
      false,
    );
  });
});
