/**
 * Fase 6.5 — two users vote; counts match.
 */
require('dotenv').config();
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');

const API = process.env.API_BASE || 'https://api.synapmsg.ai';
const PASS = 'Fido2Prove_26';

async function login(email, deviceInstallId) {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASS, deviceInstallId }),
  });
  return r.json();
}

(async () => {
  const p = new PrismaClient();
  const a = await p.user.findUnique({ where: { privateNumber: '4729679274' } });
  const b = await p.user.findUnique({ where: { privateNumber: '7751806459' } });
  if (!a || !b) throw new Error('users missing');

  await p.user.update({
    where: { id: b.id },
    data: { passwordHash: await bcrypt.hash(PASS, 10) },
  });

  for (const [u, tag] of [
    [a, 'pa'],
    [b, 'pb'],
  ]) {
    const id = `inst_poll_${tag}_${Date.now()}`;
    await p.trustedLoginDevice.upsert({
      where: {
        userId_deviceInstallId: { userId: u.id, deviceInstallId: id },
      },
      create: { userId: u.id, deviceInstallId: id, label: 'poll' },
      update: { lastSeenAt: new Date() },
    });
    u._did = id;
  }

  const authA = await login('4729679274', a._did);
  const authB = await login('7751806459', b._did);
  if (!authA.token || !authB.token) {
    throw new Error(JSON.stringify({ authA, authB }));
  }

  const chat = await p.chat.create({
    data: {
      type: 'single',
      encryptionMode: 'cloud',
      name: `poll-${Date.now()}`,
      participants: {
        create: [
          { userId: a.id, role: 'admin' },
          { userId: b.id, role: 'member' },
        ],
      },
    },
  });

  const create = await fetch(`${API}/chats/${chat.id}/polls`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authA.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      question: '¿Café o té?',
      options: ['Café', 'Té'],
      anonymous: false,
    }),
  });
  const createBody = await create.json();
  if (!create.ok) throw new Error(JSON.stringify(createBody));
  const pollId = createBody.poll.id;
  const optCafe = createBody.poll.options.find((o) => o.text === 'Café').id;
  const optTe = createBody.poll.options.find((o) => o.text === 'Té').id;

  const voteA = await fetch(`${API}/chats/${chat.id}/polls/${pollId}/vote`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authA.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ optionId: optCafe }),
  });
  const voteB = await fetch(`${API}/chats/${chat.id}/polls/${pollId}/vote`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authB.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ optionId: optTe }),
  });
  const bodyA = await voteA.json();
  const bodyB = await voteB.json();
  if (!voteA.ok || !voteB.ok) throw new Error(JSON.stringify({ bodyA, bodyB }));

  const cafeVotes = bodyB.poll.options.find((o) => o.id === optCafe).votes;
  const teVotes = bodyB.poll.options.find((o) => o.id === optTe).votes;
  const out = {
    ok:
      bodyB.poll.totalVotes === 2 &&
      cafeVotes === 1 &&
      teVotes === 1 &&
      bodyA.poll.myVote === optCafe &&
      bodyB.poll.myVote === optTe,
    totalVotes: bodyB.poll.totalVotes,
    cafeVotes,
    teVotes,
    pollId,
    chatId: chat.id,
  };
  console.log(JSON.stringify(out, null, 2));

  await p.chatPollVote.deleteMany({ where: { pollId } });
  await p.chatPollOption.deleteMany({ where: { pollId } });
  await p.chatPoll.delete({ where: { id: pollId } }).catch(() => undefined);
  if (createBody.poll.messageId) {
    await p.message
      .delete({ where: { id: createBody.poll.messageId } })
      .catch(() => undefined);
  }
  await p.chatParticipant.deleteMany({ where: { chatId: chat.id } });
  await p.chat.delete({ where: { id: chat.id } });
  await p.$disconnect();
  process.exit(out.ok ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
