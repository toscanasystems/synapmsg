/**
 * Fase 6.4 — edit within 48h; both sides see editedAt + new text (cloud chat).
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const API = process.env.API_BASE || 'https://api.synapmsg.ai';
const PRIVATE = '4729679274';
const PASS = 'Fido2Prove_26';

(async () => {
  const p = new PrismaClient();
  const user = await p.user.findUnique({ where: { privateNumber: PRIVATE } });
  const peer = await p.user.findFirst({
    where: { privateNumber: '7751806459' },
  });
  if (!user || !peer) throw new Error('users missing');

  const known = `inst_edit_${Date.now()}`;
  await p.trustedLoginDevice.upsert({
    where: {
      userId_deviceInstallId: { userId: user.id, deviceInstallId: known },
    },
    create: { userId: user.id, deviceInstallId: known, label: 'edit' },
    update: { lastSeenAt: new Date() },
  });
  const auth = await (
    await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: PRIVATE,
        password: PASS,
        deviceInstallId: known,
      }),
    })
  ).json();
  if (!auth.token) throw new Error(JSON.stringify(auth));
  const headers = {
    Authorization: `Bearer ${auth.token}`,
    'Content-Type': 'application/json',
  };

  const chat = await p.chat.create({
    data: {
      type: 'single',
      encryptionMode: 'cloud',
      name: `edit-proof-${Date.now()}`,
      participants: {
        create: [
          { userId: user.id, role: 'admin' },
          { userId: peer.id, role: 'member' },
        ],
      },
    },
  });

  const send = await fetch(`${API}/chats/${chat.id}/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ text: 'ORIGINAL_EDIT_PROOF' }),
  });
  const sendBody = await send.json();
  if (!send.ok) throw new Error(JSON.stringify(sendBody));
  const messageId = sendBody.message.id;

  const edited = await fetch(
    `${API}/chats/${chat.id}/messages/${messageId}`,
    {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ text: 'EDITADO_EN_48H' }),
    },
  );
  const editedBody = await edited.json();
  if (!edited.ok) throw new Error(JSON.stringify(editedBody));

  const row = await p.message.findUnique({ where: { id: messageId } });
  const out = {
    ok:
      row?.originalText === 'EDITADO_EN_48H' &&
      Boolean(row?.editedAt) &&
      Boolean(editedBody.message?.editedAt),
    messageId,
    chatId: chat.id,
    originalText: row?.originalText,
    editedAt: row?.editedAt?.toISOString() ?? null,
    within48h: true,
  };
  console.log(JSON.stringify(out, null, 2));

  await p.message.delete({ where: { id: messageId } }).catch(() => undefined);
  await p.chatParticipant.deleteMany({ where: { chatId: chat.id } });
  await p.chat.delete({ where: { id: chat.id } });
  await p.$disconnect();
  process.exit(out.ok ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
