/**
 * Fase 5.3 — idleDays=1 + lastActiveAt backdated → scheduler fires notify (not wipe).
 * Prefers POST /security/dms/check; falls back to waiting for the 60s scheduler.
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const API = process.env.API_BASE || 'https://api.synapmsg.ai';
const PRIVATE = '4729679274';
const PASS = 'Fido2Prove_26';

async function login(deviceInstallId) {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: PRIVATE,
      password: PASS,
      deviceInstallId,
    }),
  });
  return r.json();
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

(async () => {
  const p = new PrismaClient();
  const user = await p.user.findUnique({ where: { privateNumber: PRIVATE } });
  if (!user) throw new Error('user missing');

  const known = `inst_dms_${Date.now()}`;
  await p.trustedLoginDevice.upsert({
    where: {
      userId_deviceInstallId: { userId: user.id, deviceInstallId: known },
    },
    create: { userId: user.id, deviceInstallId: known, label: 'dms-proof' },
    update: { lastSeenAt: new Date() },
  });

  const auth = await login(known);
  if (!auth.token) throw new Error(`login: ${JSON.stringify(auth)}`);
  const headers = {
    Authorization: `Bearer ${auth.token}`,
    'Content-Type': 'application/json',
  };

  // Only notify — never wipe in this proof
  const put = await fetch(`${API}/security/dms`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      enabled: true,
      idleDays: 1,
      action: 'notify',
      notifyContactIds: [],
    }),
  });
  const putBody = await put.json();
  if (!put.ok) throw new Error(`put dms: ${JSON.stringify(putBody)}`);

  const past = new Date(Date.now() - 26 * 60 * 60 * 1000);
  await p.user.update({
    where: { id: user.id },
    data: { lastActiveAt: past, lastSeenAt: past },
  });

  let checkBody = null;
  let via = 'scheduler';
  const check = await fetch(`${API}/security/dms/check`, {
    method: 'POST',
    headers,
  });
  if (check.status === 404) {
    // Wait for in-process scheduler (60s interval + buffer)
    for (let i = 0; i < 10; i++) {
      await sleep(15_000);
      const after = await fetch(`${API}/security/dms`, { headers });
      const cfg = (await after.json()).dms || {};
      if (cfg.enabled === false && cfg.lastFiredAt) {
        checkBody = { fired: true, reason: 'scheduler' };
        break;
      }
    }
  } else {
    via = 'dms/check';
    checkBody = await check.json();
  }

  const after = await fetch(`${API}/security/dms`, { headers });
  const cfg = (await after.json()).dms || {};

  const out = {
    ok:
      checkBody?.fired === true &&
      cfg.enabled === false &&
      Boolean(cfg.lastFiredAt) &&
      (cfg.lastFiredAction === 'notify' || !cfg.lastFiredAction) &&
      Number(cfg.idleDays) === 1,
    via,
    check: checkBody,
    dmsAfter: {
      enabled: cfg.enabled,
      idleDays: cfg.idleDays,
      action: cfg.action,
      lastFiredAt: cfg.lastFiredAt,
      lastFiredAction: cfg.lastFiredAction,
    },
    note: 'action=notify only (no wipe). Phone shows Alert if WS connected.',
    phone: 'Toscana SM-A356E / Samsung SM-A566E (WS if logged in)',
  };
  console.log(JSON.stringify(out, null, 2));
  await p.$disconnect();
  process.exit(out.ok ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
