/**
 * JWT_SECRET acceptance rules (no side effects — safe to import in tests).
 */

const FORBIDDEN_SECRETS = new Set([
  '',
  'dev-insecure-secret-change-me',
  'change-me',
  'change-me-to-a-long-random-secret-string',
  'secret',
  'jwt_secret',
]);

export function jwtSecretIsAcceptable(raw: string | undefined): boolean {
  const v = (raw || '').trim();
  if (!v || v.length < 32) return false;
  if (FORBIDDEN_SECRETS.has(v.toLowerCase())) return false;
  return true;
}

export function requireJwtSecretFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const raw = (env.JWT_SECRET || '').trim();
  if (!jwtSecretIsAcceptable(raw)) {
    throw new Error(
      '[fatal] JWT_SECRET missing or weak (min 32 chars). Set JWT_SECRET in the environment. Server will not start.',
    );
  }
  return raw;
}
