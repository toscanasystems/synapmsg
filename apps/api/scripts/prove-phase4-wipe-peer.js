/**
 * Fase 4 wipe peer: second "device" over WS + drop other DeviceIdentity rows.
 * Reads DATABASE_URL / JWT_SECRET from apps/api/.env
 *
 * Usage: node --env-file=.env scripts/prove-phase4-wipe-peer.js
 */
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const WebSocket = require('ws');
const { spawn } = require('child_process');

const EMAIL = 'fase4.prove@synapmsg.local';
const WS_URL = process.env.PROVE_WS_URL || 'wss://api.synapmsg.ai/ws';
const SERIAL = process.env.ANDROID_SERIAL || 'R5CYA03YERH';

function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      username: user.username,
      iat: Math.floor(Date.now() / 1000),
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
      issuer: 'synapmsg',
      audience: 'synapmsg-client',
    },
  );
}

async function main() {
  const prisma = new PrismaClient();
  const user = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (!user) throw new Error('fase4 user missing — run ensure-fase4-prove-user.js');

  // Keep decoy empty before duress.
  if (user.decoyUserId) {
    const parts = await prisma.chatParticipant.findMany({
      where: { userId: user.decoyUserId },
      select: { chatId: true },
    });
    const chatIds = [...new Set(parts.map((p) => p.chatId))];
    if (chatIds.length) {
      await prisma.message.deleteMany({ where: { chatId: { in: chatIds } } });
      await prisma.chatParticipant.deleteMany({
        where: { chatId: { in: chatIds } },
      });
      await prisma.chat.deleteMany({ where: { id: { in: chatIds } } });
      console.log(JSON.stringify({ decoyCleared: true, chats: chatIds.length }));
    }
  }

  const token = signToken(user);
  const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);
  let wipeReceived = false;

  ws.on('open', () => {
    console.log(JSON.stringify({ peer: 'ws_open', userId: user.id }));
  });
  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (msg.type !== 'remote_wipe') return;
    wipeReceived = true;
    console.log(
      JSON.stringify({
        peer: 'remote_wipe_received',
        nonce: msg.nonce,
        reason: msg.reason,
      }),
    );
  });

  // Watch phone logcat for wipeRequest → delete other DeviceIdentity.
  const adb = spawn(
    'adb',
    ['-s', SERIAL, 'logcat', '-v', 'brief', 'ReactNativeJS:I', '*:S'],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let buf = '';
  adb.stdout.on('data', async (chunk) => {
    buf += String(chunk);
    const lines = buf.split(/\r?\n/);
    buf = lines.pop() || '';
    for (const line of lines) {
      if (!line.includes('wipeRequest')) continue;
      const m = line.match(/\{.*\}/);
      if (!m) continue;
      let req;
      try {
        req = JSON.parse(m[0]);
      } catch {
        continue;
      }
      if (!req.wipeRequest || !req.otherId || !req.userId) continue;
      const del = await prisma.deviceIdentity.deleteMany({
        where: {
          userId: req.userId,
          deviceId: { not: req.issuerId || '' },
        },
      });
      console.log(
        JSON.stringify({
          peer: 'other_devices_deleted',
          count: del.count,
          otherId: req.otherId,
          wipeReceived,
        }),
      );
    }
  });

  console.log(JSON.stringify({ peer: 'ready', email: EMAIL }));
  // Keep alive ~10 minutes (prove + rebuild races).
  await new Promise((r) => setTimeout(r, 600000));
  adb.kill();
  ws.close();
  await prisma.$disconnect();
  console.log(JSON.stringify({ peer: 'done', wipeReceived }));
  process.exit(wipeReceived ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
