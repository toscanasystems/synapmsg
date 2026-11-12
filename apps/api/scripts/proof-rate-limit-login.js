/**
 * Fase 7.2 — 5 failed logins / min / IP → 6th is 429; other IP still OK.
 */
require('dotenv').config();

const API = process.env.API_BASE || 'https://api.synapmsg.ai';
const LOGIN_ID = process.env.PROOF_LOGIN || '4729679274';

async function attempt(ip, password) {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': ip,
    },
    body: JSON.stringify({
      email: LOGIN_ID,
      password,
      deviceInstallId: `proof_rl_${ip.replace(/\./g, '_')}`,
    }),
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
  const attacker = `203.0.113.${100 + (Date.now() % 50)}`;
  const friend = `198.51.100.${100 + (Date.now() % 50)}`;
  const statuses = [];

  for (let i = 1; i <= 6; i++) {
    const res = await attempt(attacker, `WrongPass_${i}_${Date.now()}`);
    statuses.push(res.status);
    console.log(`attacker #${i} → ${res.status} code=${res.body?.code || ''}`);
  }

  const sixth = statuses[5];
  if (sixth !== 429) {
    throw new Error(`expected 6th=429, got ${sixth}; statuses=${statuses.join(',')}`);
  }
  const firstFiveOk = statuses.slice(0, 5).every((s) => s === 401 || s === 400);
  if (!firstFiveOk) {
    throw new Error(`expected first five auth failures, got ${statuses.slice(0, 5)}`);
  }

  // Other IP must still reach the handler (401 wrong pass or 200/ok with good pass).
  const otherWrong = await attempt(friend, 'DefinitelyWrong_Friend');
  if (otherWrong.status === 429) {
    throw new Error('friend IP was rate-limited — buckets must be per-IP');
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        attackerIp: attacker,
        friendIp: friend,
        attackerStatuses: statuses,
        friendStatus: otherWrong.status,
        sixthIs429: sixth === 429,
      },
      null,
      2,
    ),
  );
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
