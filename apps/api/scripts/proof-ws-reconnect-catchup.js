/**
 * Fase 7.3 — two WS clients reconnect after Railway restart; missed msg via REST.
 *
 * Run AFTER `railway restart -y` (or pass SKIP_RESTART=1 if already bounced).
 * Mobile uses the same catch-up: onStateChange → fetchMessages for open chat.
 */
require('dotenv').config();
const bcrypt = require('bcrypt');
const WebSocket = require('ws');
const { PrismaClient } = require('@prisma/client');
const { spawnSync } = require('child_process');

const API = process.env.API_BASE || 'https://api.synapmsg.ai';
const WS_URL = API.replace(/^http/, 'ws') + '/ws';
const PASS = 'Fido2Prove_26';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function login(email, deviceInstallId) {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASS, deviceInstallId }),
  });
  return r.json();
}

function connectWs(token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);
    const inbox = [];
    const timer = setTimeout(() => {
      try {
        ws.close();
      } catch {
        /* */
      }
      reject(new Error('ws connect timeout'));
    }, 15000);
    ws.on('message', (raw) => {
      try {
        inbox.push(JSON.parse(String(raw)));
      } catch {
        /* ignore */
      }
    });
    ws.on('open', () => {
      clearTimeout(timer);
      resolve({ ws, inbox });
    });
    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function waitConnected(token, timeoutMs = 120000) {
  const start = Date.now();
  let attempt = 0;
  const steps = [1000, 2000, 4000, 8000];
  while (Date.now() - start < timeoutMs) {
    try {
      return await connectWs(token);
    } catch {
      const delay = steps[Math.min(attempt, steps.length - 1)];
      attempt += 1;
      await sleep(delay);
    }
  }
  throw new Error('did not reconnect in time');
}

async function waitHttpOk(timeoutMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${API}/health`);
      if (r.ok) return true;
    } catch {
      /* down */
    }
    await sleep(2000);
  }
  throw new Error('API health never came back');
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
    [a, 'ra'],
    [b, 'rb'],
  ]) {
    const id = `inst_ws_${tag}_${Date.now()}`;
    await p.trustedLoginDevice.upsert({
      where: {
        userId_deviceInstallId: { userId: u.id, deviceInstallId: id },
      },
      create: { userId: u.id, deviceInstallId: id, label: 'ws-reconnect' },
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
      name: `ws-reconnect-${Date.now()}`,
      participants: {
        create: [
          { userId: a.id, role: 'admin' },
          { userId: b.id, role: 'member' },
        ],
      },
    },
  });

  let clientA = await connectWs(authA.token);
  let clientB = await connectWs(authB.token);
  console.log('both WS connected before restart');

  const marker = `f7-reconnect-${Date.now()}`;

  if (process.env.SKIP_RESTART !== '1') {
    console.log('railway restart -y…');
    const rr = spawnSync('railway', ['restart', '-y', '--json'], {
      cwd: __dirname + '/..',
      encoding: 'utf8',
      timeout: 60000,
      env: process.env,
      shell: true,
    });
    if (rr.error) throw rr.error;
    console.log('restart issued:', (rr.stdout || '').trim() || rr.status);
  }

  try {
    clientA.ws.close();
  } catch {
    /* */
  }
  try {
    clientB.ws.close();
  } catch {
    /* */
  }

  await waitHttpOk();

  let sent = null;
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(`${API}/chats/${chat.id}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authA.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: marker }),
      });
      if (r.ok) {
        sent = await r.json();
        break;
      }
    } catch {
      /* */
    }
    await sleep(2000);
  }
  if (!sent) throw new Error('could not send message after restart');

  clientA = await waitConnected(authA.token);
  clientB = await waitConnected(authB.token);

  const listB = await fetch(
    `${API}/chats/${chat.id}/messages?page=1&limit=50`,
    { headers: { Authorization: `Bearer ${authB.token}` } },
  ).then((r) => r.json());

  const found = (listB.messages || []).some(
    (m) => m.originalText === marker || m.text === marker,
  );

  clientA.ws.close();
  clientB.ws.close();
  await p.$disconnect();

  console.log(
    JSON.stringify(
      {
        ok: found,
        chatId: chat.id,
        marker,
        messageId: sent.message?.id || sent.id || null,
        bSawViaRest: found,
        aReconnected: true,
        bReconnected: true,
        backoffStepsMs: [1000, 2000, 4000, 8000],
      },
      null,
      2,
    ),
  );
  if (!found) process.exit(1);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
