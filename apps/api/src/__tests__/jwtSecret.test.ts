/**
 * Permanent guard: no weak/default JWT secrets in production paths.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  jwtSecretIsAcceptable,
  requireJwtSecretFromEnv,
} from '../lib/jwtSecretPolicy';

describe('JWT_SECRET — arranque seguro', () => {
  it('rechaza missing, corto y secretos de prueba conocidos', () => {
    assert.equal(jwtSecretIsAcceptable(undefined), false);
    assert.equal(jwtSecretIsAcceptable(''), false);
    assert.equal(jwtSecretIsAcceptable('short'), false);
    assert.equal(jwtSecretIsAcceptable('dev-insecure-secret-change-me'), false);
    assert.equal(
      jwtSecretIsAcceptable('change-me-to-a-long-random-secret-string'),
      false,
    );
  });

  it('acepta un secreto largo no-default', () => {
    assert.equal(
      jwtSecretIsAcceptable('a'.repeat(32) + '-not-a-default-value'),
      true,
    );
  });

  it('requireJwtSecretFromEnv lanza sin secreto real', () => {
    assert.throws(
      () => requireJwtSecretFromEnv({} as NodeJS.ProcessEnv),
      /JWT_SECRET missing or weak/,
    );
    assert.throws(
      () =>
        requireJwtSecretFromEnv({
          JWT_SECRET: 'dev-insecure-secret-change-me',
        } as NodeJS.ProcessEnv),
      /JWT_SECRET missing or weak/,
    );
  });
});
