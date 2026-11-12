/**
 * Fase 6.3 — seal file before upload; R2/local store is opaque; key opens it.
 */
require('dotenv').config();
const path = require('path');
const nacl = require(path.join(__dirname, '../../../node_modules/tweetnacl'));
const { PrismaClient } = require('@prisma/client');

const API = process.env.API_BASE || 'https://api.synapmsg.ai';
const PRIVATE = '4729679274';
const PASS = 'Fido2Prove_26';

function b64(buf) {
  return Buffer.from(buf).toString('base64');
}
function unb64(s) {
  return new Uint8Array(Buffer.from(s, 'base64'));
}

(async () => {
  const p = new PrismaClient();
  const user = await p.user.findUnique({ where: { privateNumber: PRIVATE } });
  if (!user) throw new Error('user missing');
  const known = `inst_media_${Date.now()}`;
  await p.trustedLoginDevice.upsert({
    where: {
      userId_deviceInstallId: { userId: user.id, deviceInstallId: known },
    },
    create: { userId: user.id, deviceInstallId: known, label: 'media' },
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

  // Tiny PNG (89 bytes) — magic 89 50 4E 47
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  const plain = new Uint8Array(png);
  const key = nacl.randomBytes(nacl.secretbox.keyLength);
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const sealed = nacl.secretbox(plain, nonce, key);
  if (!sealed) throw new Error('seal failed');

  // Sealed must NOT start with PNG magic
  const sealedLooksPng =
    sealed[0] === 0x89 && sealed[1] === 0x50 && sealed[2] === 0x4e && sealed[3] === 0x47;

  const up = await fetch(`${API}/media/upload`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      contentType: 'application/octet-stream',
      dataBase64: b64(sealed),
    }),
  });
  const upBody = await up.json();
  if (!up.ok || !upBody.url) throw new Error(JSON.stringify(upBody));

  const remote = await fetch(upBody.url);
  const remoteBuf = new Uint8Array(await remote.arrayBuffer());
  const storeLooksPng =
    remoteBuf[0] === 0x89 &&
    remoteBuf[1] === 0x50 &&
    remoteBuf[2] === 0x4e &&
    remoteBuf[3] === 0x47;

  const opened = nacl.secretbox.open(remoteBuf, nonce, key);
  const openedOk =
    opened &&
    Buffer.from(opened).equals(png) &&
    opened[0] === 0x89 &&
    opened[1] === 0x50;

  const meta = {
    v: 1,
    k: b64(key),
    n: b64(nonce),
    ct: 'image/png',
  };
  const caption = `foto\n\n@@synapmedia:${JSON.stringify(meta)}@@`;

  const out = {
    ok: !sealedLooksPng && !storeLooksPng && Boolean(openedOk) && upBody.url.includes('http'),
    storeOpaque: !storeLooksPng,
    openedWithKey: Boolean(openedOk),
    url: upBody.url,
    bytes: remoteBuf.length,
    maxFreeMb: 25,
    keyTravelsInMessage: caption.includes('@@synapmedia:'),
  };
  console.log(JSON.stringify(out, null, 2));
  await p.$disconnect();
  process.exit(out.ok ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
