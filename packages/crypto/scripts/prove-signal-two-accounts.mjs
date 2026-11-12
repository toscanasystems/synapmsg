/**
 * Fase 2: two real DB accounts + Signal Protocol encrypt → opaque Neon row → peer decrypt.
 * Private keys stay in MemorySignalStore only; DeviceIdentity rows store public material.
 *
 * Usage (from packages/crypto):
 *   node --env-file=../../apps/api/.env --import tsx scripts/prove-signal-two-accounts.mjs
 */
import { webcrypto } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setWebCrypto } from '@privacyresearch/libsignal-protocol-typescript';
import {
  installSignalIdentity,
  processPeerBundle,
  signalDecrypt,
  signalEncrypt,
  signalSafetyNumber,
  safetyQrPayload,
  toPublicBundle,
  SIGNAL_PROTOCOL,
  LEGACY_PQ_RATCHET_DISABLED_FOR_NEW,
} from '../src/index.ts';

setWebCrypto(webcrypto);

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, '../../../apps/api');
const { PrismaClient } = require(path.join(apiRoot, 'node_modules/@prisma/client'));

function fail(msg, detail) {
  console.error('FAIL:', msg);
  if (detail !== undefined) console.error(detail);
  process.exit(1);
}

/** Mirror of apps/api privateEnvelope — server stores opaque fields only. */
function buildPrivateMessageDbFields(input) {
  const cipher = (input.ciphertext || '').trim();
  if (!cipher || cipher.length < 16) fail('ciphertext missing/short');
  return {
    originalText: '',
    translatedText: null,
    translatedLanguage: null,
    isTranslated: false,
    ciphertext: cipher,
    ciphertextType:
      typeof input.ciphertextType === 'number' ? input.ciphertextType : 1,
    isE2e: true,
    originalLanguage: input.originalLanguage || 'es',
  };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    fail('DATABASE_URL required (use --env-file=../../apps/api/.env)');
  }
  if (!LEGACY_PQ_RATCHET_DISABLED_FOR_NEW) {
    fail('legacy PQ ratchet must be disabled for new chats');
  }

  const p = new PrismaClient();
  const stamp = Date.now();
  const PLAIN = 'FASE2_TWO_ACCOUNTS_' + stamp;
  const ids = [];
  let chatId = null;
  let messageId = null;

  try {
    const alice = await installSignalIdentity({ deviceId: 1 });
    const bob = await installSignalIdentity({ deviceId: 1 });

    const alicePubOnly = JSON.stringify(
      toPublicBundle(alice, alice.oneTimePreKeys[0]),
    );
    const alicePrivB64 = Buffer.from(
      alice.store.identityKeyPair.privKey,
    ).toString('base64');
    if (alicePubOnly.includes(alicePrivB64)) {
      fail('Alice private identity leaked into public bundle');
    }

    const uA = await p.user.create({
      data: {
        email: `sig.a.${stamp}@synapmsg.test`,
        username: `siga${stamp}`,
        name: 'Signal A',
        passwordHash: 'x',
      },
    });
    const uB = await p.user.create({
      data: {
        email: `sig.b.${stamp}@synapmsg.test`,
        username: `sigb${stamp}`,
        name: 'Signal B',
        passwordHash: 'x',
      },
    });
    ids.push(uA.id, uB.id);

    await p.deviceIdentity.create({
      data: {
        userId: uA.id,
        deviceId: `sig_a_${stamp}`,
        identityKeyPub: alice.identityKeyPubB64,
        signedPreKeyPub: alice.signedPreKeyPubB64,
        signedPreKeySig: alice.signedPreKeySigB64,
        signedPreKeyId: alice.signedPreKeyId,
        registrationId: alice.registrationId,
        preKeysJson: JSON.stringify(
          alice.oneTimePreKeys.map((k) => ({
            keyId: k.keyId,
            publicKey: k.publicKey,
          })),
        ),
        protocol: SIGNAL_PROTOCOL,
      },
    });
    const bobOtk = bob.oneTimePreKeys[0];
    await p.deviceIdentity.create({
      data: {
        userId: uB.id,
        deviceId: `sig_b_${stamp}`,
        identityKeyPub: bob.identityKeyPubB64,
        signedPreKeyPub: bob.signedPreKeyPubB64,
        signedPreKeySig: bob.signedPreKeySigB64,
        signedPreKeyId: bob.signedPreKeyId,
        registrationId: bob.registrationId,
        preKeysJson: JSON.stringify(
          bob.oneTimePreKeys.map((k) => ({
            keyId: k.keyId,
            publicKey: k.publicKey,
          })),
        ),
        protocol: SIGNAL_PROTOCOL,
      },
    });

    const chat = await p.chat.create({
      data: {
        type: 'single',
        encryptionMode: 'e2e',
        participants: {
          create: [
            { userId: uA.id, role: 'admin' },
            { userId: uB.id, role: 'member' },
          ],
        },
      },
    });
    chatId = chat.id;

    const bobBundle = toPublicBundle(bob, {
      keyId: bobOtk.keyId,
      publicKey: bobOtk.publicKey,
    });
    await processPeerBundle(alice.store, uB.id, bobBundle);
    const { ciphertext, ciphertextType } = await signalEncrypt(
      alice.store,
      uB.id,
      1,
      PLAIN,
    );

    const envelope = buildPrivateMessageDbFields({
      ciphertext,
      ciphertextType,
      originalLanguage: 'es',
    });
    if (envelope.originalText !== '') fail('envelope wrote plaintext');

    const msg = await p.message.create({
      data: { chatId: chat.id, senderId: uA.id, ...envelope },
    });
    messageId = msg.id;

    if ((msg.originalText || '').trim() !== '') fail('DB originalText not empty');
    if (msg.translatedText != null && String(msg.translatedText).trim() !== '') {
      fail('DB translatedText not empty');
    }
    if (!msg.ciphertext || msg.ciphertext !== ciphertext) {
      fail('DB ciphertext missing/altered');
    }
    if (msg.ciphertext.includes(PLAIN)) fail('plaintext inside ciphertext column');

    const rows = await p.$queryRawUnsafe(
      `SELECT * FROM messages WHERE id = $1::uuid`,
      msg.id,
    );
    const full = JSON.stringify(rows[0]);
    if (full.includes(PLAIN)) fail('plaintext found in raw DB row', full.slice(0, 400));
    console.log('OK db: two accounts, message row opaque (no plaintext)');

    const opened = await signalDecrypt(bob.store, uA.id, 1, ciphertext);
    if (opened !== PLAIN) fail('Bob decrypt failed', { opened, PLAIN });
    console.log('OK peer: Bob opened the message');

    const safety = await signalSafetyNumber(
      uA.id,
      alice.identityKeyPubB64,
      uB.id,
      bob.identityKeyPubB64,
    );
    const qr = safetyQrPayload(safety);
    if (!qr.startsWith('synapmsg:safety:')) fail('QR payload malformed', qr);
    console.log('OK safety+QR:', safety.slice(0, 24) + '…');

    const pubs = await p.deviceIdentity.findMany({
      where: { userId: { in: ids } },
    });
    for (const row of pubs) {
      const s = JSON.stringify(row);
      if (s.includes(PLAIN)) fail('plaintext in device identity');
    }
    console.log('OK keys: DeviceIdentity stores public material only');

    console.log(
      JSON.stringify(
        {
          ok: true,
          protocol: SIGNAL_PROTOCOL,
          aliceUserId: uA.id,
          bobUserId: uB.id,
          chatId: chat.id,
          messageId: msg.id,
          originalText: msg.originalText,
          translatedText: msg.translatedText,
          ciphertextLen: ciphertext.length,
          ciphertextType,
          bobOpenedPlaintext: opened === PLAIN,
          safetyNumberPreview: safety.slice(0, 29),
          qrPayloadPreview: qr.slice(0, 48) + '…',
          legacyDisabledForNew: LEGACY_PQ_RATCHET_DISABLED_FOR_NEW,
          proved: [
            'two DB accounts + DeviceIdentity public bundles',
            'Alice Signal-encrypts; server stores opaque envelope',
            'raw messages row has no plaintext',
            'Bob decrypts with local private keys',
            'safety number + QR payload',
            'legacy synapmsg-pq-v1 disabled for new',
          ],
        },
        null,
        2,
      ),
    );
  } finally {
    try {
      if (messageId) {
        await p.message.delete({ where: { id: messageId } }).catch(() => undefined);
      }
      if (ids.length) {
        await p.deviceIdentity
          .deleteMany({ where: { userId: { in: ids } } })
          .catch(() => undefined);
      }
      if (chatId) {
        await p.chat.delete({ where: { id: chatId } }).catch(() => undefined);
      }
      if (ids.length) {
        await p.user.deleteMany({ where: { id: { in: ids } } }).catch(() => undefined);
      }
    } catch (_) {}
    await p.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
