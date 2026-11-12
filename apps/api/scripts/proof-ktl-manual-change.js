/**
 * Fase 5.2 — change identity key by hand; public KTL must show the rotation.
 */
require('dotenv').config();
const crypto = require('crypto');
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
  return { status: r.status, body: await r.json() };
}

(async () => {
  const p = new PrismaClient();
  const user = await p.user.findUnique({ where: { privateNumber: PRIVATE } });
  if (!user) throw new Error('user missing');

  const device = await p.deviceIdentity.findFirst({
    where: { userId: user.id },
    orderBy: { updatedAt: 'desc' },
  });
  if (!device) throw new Error('no E2E device');

  const originalKey = device.identityKeyPub;
  const known = `inst_ktl_${Date.now()}`;
  await p.trustedLoginDevice.upsert({
    where: {
      userId_deviceInstallId: { userId: user.id, deviceInstallId: known },
    },
    create: { userId: user.id, deviceInstallId: known, label: 'ktl-proof' },
    update: { lastSeenAt: new Date() },
  });

  const auth = await login(known);
  if (!auth.body?.token) {
    throw new Error(`login failed: ${JSON.stringify(auth.body)}`);
  }
  const token = auth.body.token;
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  // Ensure current key is in the log
  const pub1 = await fetch(`${API}/security/ktl/publish`, {
    method: 'POST',
    headers,
  });
  const pub1Body = await pub1.json();
  if (!pub1.ok) throw new Error(`publish1: ${JSON.stringify(pub1Body)}`);

  // Manual key change (simulates rotated device identity)
  const fakeKey = crypto.randomBytes(33).toString('base64');
  await p.deviceIdentity.update({
    where: { id: device.id },
    data: { identityKeyPub: fakeKey },
  });

  const pub2 = await fetch(`${API}/security/ktl/publish`, {
    method: 'POST',
    headers,
  });
  const pub2Body = await pub2.json();
  if (!pub2.ok) throw new Error(`publish2: ${JSON.stringify(pub2Body)}`);

  const pub = await fetch(`${API}/security/ktl/public/${user.id}`);
  const pubBody = await pub.json();
  const entries = pubBody.entries || [];
  const last = entries[entries.length - 1];
  const prev = entries.length > 1 ? entries[entries.length - 2] : null;
  const showsChange =
    Boolean(prev) &&
    prev.identityKeyPub !== last.identityKeyPub &&
    last.identityKeyPub === fakeKey;

  // Bundle flag: device key ≠ last KTL would be false after publish; before restore
  // check history has a rotation marker for UI copy.
  const rotations = [];
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].identityKeyPub !== entries[i - 1].identityKeyPub) {
      rotations.push({
        fromSeq: entries[i - 1].seq,
        toSeq: entries[i].seq,
        from: entries[i - 1].identityKeyPub.slice(0, 16),
        to: entries[i].identityKeyPub.slice(0, 16),
        at: entries[i].at,
      });
    }
  }

  // Restore real identity so phones keep working
  await p.deviceIdentity.update({
    where: { id: device.id },
    data: { identityKeyPub: originalKey },
  });
  await fetch(`${API}/security/ktl/publish`, { method: 'POST', headers });

  const out = {
    ok: showsChange && rotations.length > 0,
    userId: user.id,
    publish1Seq: pub1Body.entry?.seq,
    publish2Seq: pub2Body.entry?.seq,
    entryCount: entries.length,
    lastKeyPrefix: last?.identityKeyPub?.slice(0, 20),
    prevKeyPrefix: prev?.identityKeyPub?.slice(0, 20),
    showsManualChange: showsChange,
    rotations,
    publicUrl: `${API}/security/ktl/public/${user.id}`,
    restoredOriginal: true,
  };
  console.log(JSON.stringify(out, null, 2));
  await p.$disconnect();
  process.exit(out.ok ? 0 : 1);
})().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
