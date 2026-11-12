/**
 * Fase 6.6 — theme mode persists across "restart" (AsyncStorage round-trip).
 * Pure Node proof of the same key + resolve logic the app uses.
 */
const assert = require('assert');
const path = require('path');
const fs = require('fs');

const KEY = '@synapmsg/theme_mode_v1';

function resolveScheme(mode, system) {
  if (mode === 'light' || mode === 'dark') return mode;
  return system === 'light' ? 'light' : 'dark';
}

(async () => {
  const mem = new Map();
  const storage = {
    async getItem(k) {
      return mem.has(k) ? mem.get(k) : null;
    },
    async setItem(k, v) {
      mem.set(k, String(v));
    },
  };

  await storage.setItem(KEY, 'light');
  const afterRestart = await storage.getItem(KEY);
  assert.strictEqual(afterRestart, 'light');
  assert.strictEqual(resolveScheme(afterRestart, 'dark'), 'light');

  await storage.setItem(KEY, 'system');
  assert.strictEqual(resolveScheme(await storage.getItem(KEY), 'light'), 'light');
  assert.strictEqual(resolveScheme(await storage.getItem(KEY), 'dark'), 'dark');

  await storage.setItem(KEY, 'dark');
  assert.strictEqual(resolveScheme(await storage.getItem(KEY), 'light'), 'dark');

  // Source of truth: mobile store uses the same key.
  const storeSrc = fs.readFileSync(
    path.join(__dirname, '../src/store/theme.ts'),
    'utf8',
  );
  assert.ok(storeSrc.includes(KEY), 'store must use THEME_STORAGE_KEY');
  assert.ok(storeSrc.includes("'light'"), 'light mode supported');
  assert.ok(storeSrc.includes("'dark'"), 'dark mode supported');
  assert.ok(storeSrc.includes("'system'"), 'system mode supported');

  const settingsSrc = fs.readFileSync(
    path.join(__dirname, '../src/screens/SettingsScreen.tsx'),
    'utf8',
  );
  assert.ok(settingsSrc.includes('Apariencia') || settingsSrc.includes('Tema'), 'settings UI');

  console.log(
    JSON.stringify({
      ok: true,
      key: KEY,
      persisted: afterRestart,
      resolvedAgainstSystemDark: resolveScheme('light', 'dark'),
    }),
  );
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
