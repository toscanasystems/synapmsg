/**
 * Fase 7.2 — 5 register/bootstrap attempts / min / IP → 6th is 429.
 */
require('dotenv').config();

const API = process.env.API_BASE || 'https://api.synapmsg.ai';

async function bootstrap(ip) {
  const r = await fetch(`${API}/auth/bootstrap`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': ip,
    },
    body: JSON.stringify({ preferredLanguage: 'es' }),
  });
  let body = null;
  try {
    body = await r.json();
  } catch {
    body = null;
  }
  return { status: r.status, body };
}

(async () => {
  const attacker = `203.0.113.${150 + (Date.now() % 40)}`;
  const statuses = [];
  for (let i = 1; i <= 6; i++) {
    const res = await bootstrap(attacker);
    statuses.push(res.status);
    console.log(`bootstrap #${i} → ${res.status} code=${res.body?.code || ''}`);
  }
  if (statuses[5] !== 429) {
    throw new Error(`expected 6th=429, got ${statuses[5]}; ${statuses.join(',')}`);
  }
  // First five should succeed (200) or fail for other reasons — not 429.
  if (statuses.slice(0, 5).some((s) => s === 429)) {
    throw new Error(`unexpected early 429: ${statuses.join(',')}`);
  }
  console.log(
    JSON.stringify(
      { ok: true, attackerIp: attacker, statuses, sixthIs429: true },
      null,
      2,
    ),
  );
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
