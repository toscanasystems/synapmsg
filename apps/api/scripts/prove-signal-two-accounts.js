/**
 * Thin wrapper → packages/crypto two-accounts Signal + Neon proof.
 * Requires DATABASE_URL (loaded from apps/api/.env via Node --env-file).
 */
const { spawnSync } = require('child_process');
const path = require('path');

const cryptoScript = path.resolve(
  __dirname,
  '../../../packages/crypto/scripts/prove-signal-two-accounts.mjs',
);
const envFile = path.resolve(__dirname, '../.env');

const r = spawnSync(
  process.execPath,
  ['--env-file', envFile, '--import', 'tsx', cryptoScript],
  {
    cwd: path.resolve(__dirname, '../../../packages/crypto'),
    stdio: 'inherit',
    env: process.env,
  },
);

process.exit(r.status == null ? 1 : r.status);
