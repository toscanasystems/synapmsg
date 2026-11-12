/**
 * Reinicia el servicio API en Railway y espera /health ok.
 * Uso (desde apps/api, con railway link a production):
 *   node scripts/restart-and-wait-health.js
 *
 * No hace falta mirar el otro teléfono: si este script imprime HEALTH_OK,
 * el servidor ya acepta tráfico otra vez.
 */
const { spawnSync } = require('child_process');

const HEALTH = process.env.API_HEALTH || 'https://api.synapmsg.ai/health';
const MAX_MS = Number(process.env.RESTART_WAIT_MS || 180000);
const POLL_MS = 3000;

async function waitHealth(timeoutMs) {
  const start = Date.now();
  let last = '';
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(HEALTH);
      const t = await r.text();
      last = `${r.status} ${t.slice(0, 120)}`;
      if (r.ok && (t.includes('"status":"ok"') || t.includes('"ok"'))) {
        return { ok: true, ms: Date.now() - start, last };
      }
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  return { ok: false, ms: timeoutMs, last };
}

(async () => {
  console.log('RESTART_BEGIN', new Date().toISOString());
  const restart = spawnSync(
    'railway',
    ['restart', '-y', '-s', 'api'],
    { encoding: 'utf8', shell: true },
  );
  console.log(restart.stdout || '');
  if (restart.stderr) console.error(restart.stderr);
  if (restart.status !== 0) {
    console.error('RESTART_FAILED', restart.status);
    process.exit(1);
  }
  console.log('RESTART_ISSUED — polling', HEALTH);
  const result = await waitHealth(MAX_MS);
  if (!result.ok) {
    console.error('HEALTH_TIMEOUT', result);
    process.exit(2);
  }
  console.log(
    JSON.stringify(
      {
        HEALTH_OK: true,
        secondsUntilHealthy: Math.round(result.ms / 1000),
        body: result.last,
      },
      null,
      2,
    ),
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
