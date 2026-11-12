import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  jwtSecretIsAcceptable,
  requireJwtSecretFromEnv,
} from './jwtSecretPolicy';

describe('JWT_SECRET — Fase 1', () => {
  it('rejects missing, short, and known test secrets', () => {
    assert.equal(jwtSecretIsAcceptable(undefined), false);
    assert.equal(jwtSecretIsAcceptable(''), false);
    assert.equal(jwtSecretIsAcceptable('short'), false);
    assert.equal(jwtSecretIsAcceptable('dev-insecure-secret-change-me'), false);
    assert.equal(
      jwtSecretIsAcceptable('change-me-to-a-long-random-secret-string'),
      false,
    );
  });

  it('accepts a long random secret', () => {
    assert.equal(
      jwtSecretIsAcceptable('a'.repeat(32) + '-not-a-default-value'),
      true,
    );
  });

  it('requireJwtSecretFromEnv throws without a real secret', () => {
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
