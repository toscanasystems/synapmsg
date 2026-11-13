import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  RECOVERY_ALPHABET,
  RECOVERY_CODE_LENGTH,
  RECOVERY_COMBINATIONS,
  generateRecoveryCode,
  hashRecoveryCode,
  isValidRecoveryCodeFormat,
  normalizeRecoveryCode,
  verifyRecoveryCode,
} from '../lib/accountRecovery';

describe('accountRecovery', () => {
  it('alphabet excludes lookalikes and has 32 symbols', () => {
    assert.equal(RECOVERY_ALPHABET.length, 32);
    assert.ok(!RECOVERY_ALPHABET.includes('O'));
    assert.ok(!RECOVERY_ALPHABET.includes('0'));
    assert.ok(!RECOVERY_ALPHABET.includes('I'));
    assert.ok(!RECOVERY_ALPHABET.includes('l'));
    assert.ok(!RECOVERY_ALPHABET.includes('1'));
    assert.equal(RECOVERY_COMBINATIONS, 32n ** 12n);
  });

  it('generateRecoveryCode is 12 chars from alphabet', () => {
    const code = generateRecoveryCode();
    assert.equal(code.length, RECOVERY_CODE_LENGTH);
    for (const ch of code) {
      assert.ok(RECOVERY_ALPHABET.includes(ch));
    }
  });

  it('normalize strips dashes/spaces and uppercases', () => {
    assert.equal(normalizeRecoveryCode('ab2d-2345-efgh'), 'AB2D2345EFGH');
    assert.ok(isValidRecoveryCodeFormat('AB2D-2345-EFGH'));
    assert.equal(isValidRecoveryCodeFormat('OOOOOOOOOOOO'), false);
  });

  it('hash is argon2 and verifies; plaintext is not the hash', async () => {
    const code = generateRecoveryCode();
    const hash = await hashRecoveryCode(code);
    assert.ok(hash.startsWith('$argon2'));
    assert.notEqual(hash, code);
    assert.equal(await verifyRecoveryCode(code, hash), true);
    assert.equal(await verifyRecoveryCode('ZZZZZZZZZZZZ', hash), false);
  });
});
