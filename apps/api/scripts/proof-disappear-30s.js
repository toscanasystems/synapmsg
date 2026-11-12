/**
 * Fase 6.2 — message with 30s TTL disappears for both (deletedAt + opaque wipe).
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const API = process.env.API_BASE || 'https://api.synapmsg.ai';
const PRIVATE = '4729679274';
const PASS = 'Fido2Prove_26';

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

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

(async () => {
  const p = new PrismaClient();
  const user = await p.user.findUnique({ where: { privateNumber: PRIVATE } });
  if (!user) throw new Error('user missing');

  const known = `inst_dis_${Date.now()}`;
  await p.trustedLoginDevice.upsert({
    where: {
      userId_deviceInstallId: { userId: user.id, deviceInstallId: known },
    },
    create: { userId: user.id, deviceInstallId: known, label: 'disappear' },
    update: { lastSeenAt: new Date() },
  });
  const auth = await login(known);
  if (!auth.token) throw new Error(JSON.stringify(auth));
  const headers = {
    Authorization: `Bearer ${auth.token}`,
    'Content-Type': 'application/json',
  };

  // Find or create a 1:1 cloud chat with Samsung peer for bilateral proof
  const peer = await p.user.findFirst({
    where: { privateNumber: '7751806459' },
  });
  if (!peer) throw new Error('samsung peer missing');

  // Fresh cloud chat so we never flip a real Private conversation.
  const chat = await p.chat.create({
    data: {
      type: 'single',
      encryptionMode: 'cloud',
      name: `disappear-proof-${Date.now()}`,
      participants: {
        create: [
          { userId: user.id, role: 'admin' },
          { userId: peer.id, role: 'member' },
        ],
      },
    },
  });

  const patch = await fetch(`${API}/chats/${chat.id}/disappear`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ seconds: 30, text: true, image: true, audio: true }),
  });
  const patchBody = await patch.json();
  if (!patch.ok) throw new Error(JSON.stringify(patchBody));

  const send = await fetch(`${API}/chats/${chat.id}/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ text: `DISAPPEAR_30_${Date.now()}` }),
  });
  const sendBody = await send.json();
  if (!send.ok) throw new Error(JSON.stringify(sendBody));
  const messageId = sendBody.message?.id;
  if (!messageId) throw new Error('no message id');

  const before = await p.message.findUnique({ where: { id: messageId } });
  if (!before?.expiresAt) throw new Error('expiresAt missing');

  // Wait past TTL + scheduler tick
  await sleep(40_000);

  const after = await p.message.findUnique({ where: { id: messageId } });
  const out = {
    ok: Boolean(after?.deletedAt) && (after.originalText || '') === '',
    messageId,
    chatId: chat.id,
    expiresAt: before.expiresAt.toISOString(),
    deletedAt: after?.deletedAt?.toISOString() ?? null,
    originalTextEmpty: (after?.originalText || '') === '',
    disappearSeconds: patchBody.disappearSeconds,
  };
  console.log(JSON.stringify(out, null, 2));
  await p.$disconnect();
  process.exit(out.ok ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
