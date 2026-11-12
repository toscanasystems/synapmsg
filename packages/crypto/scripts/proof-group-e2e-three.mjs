/**
 * Fase 6.1 — group Private fan-out: 3 accounts, one message, 3 can read, DB opaque.
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
  toPublicBundle,
  SIGNAL_PROTOCOL,
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

async function main() {
  if (!process.env.DATABASE_URL) fail('DATABASE_URL required');
  const p = new PrismaClient();
  const stamp = Date.now();
  const PLAIN = `F6_GROUP_${stamp}`;
  const userIds = [];
  let chatId = null;
  let messageId = null;

  try {
    const A = await installSignalIdentity({ deviceId: 1 });
    const B = await installSignalIdentity({ deviceId: 1 });
    const C = await installSignalIdentity({ deviceId: 1 });

    const uA = await p.user.create({
      data: {
        email: `ga.${stamp}@synapmsg.test`,
        username: `ga${stamp}`,
        name: 'Group A',
        passwordHash: 'x',
      },
    });
    const uB = await p.user.create({
      data: {
        email: `gb.${stamp}@synapmsg.test`,
        username: `gb${stamp}`,
        name: 'Group B',
        passwordHash: 'x',
      },
    });
    const uC = await p.user.create({
      data: {
        email: `gc.${stamp}@synapmsg.test`,
        username: `gc${stamp}`,
        name: 'Group C',
        passwordHash: 'x',
      },
    });
    userIds.push(uA.id, uB.id, uC.id);

    for (const [u, id, letter] of [
      [uA, A, 'a'],
      [uB, B, 'b'],
      [uC, C, 'c'],
    ]) {
      await p.deviceIdentity.create({
        data: {
          userId: u.id,
          deviceId: `g_${letter}_${stamp}`,
          identityKeyPub: id.identityKeyPubB64,
          signedPreKeyPub: id.signedPreKeyPubB64,
          signedPreKeySig: id.signedPreKeySigB64,
          signedPreKeyId: id.signedPreKeyId,
          registrationId: id.registrationId,
          preKeysJson: JSON.stringify(
            id.oneTimePreKeys.map((k) => ({
              keyId: k.keyId,
              publicKey: k.publicKey,
            })),
          ),
          protocol: SIGNAL_PROTOCOL,
        },
      });
    }

    await processPeerBundle(
      A.store,
      uB.id,
      toPublicBundle(B, {
        keyId: B.oneTimePreKeys[0].keyId,
        publicKey: B.oneTimePreKeys[0].publicKey,
      }),
    );
    await processPeerBundle(
      A.store,
      uC.id,
      toPublicBundle(C, {
        keyId: C.oneTimePreKeys[0].keyId,
        publicKey: C.oneTimePreKeys[0].publicKey,
      }),
    );
    await processPeerBundle(
      B.store,
      uA.id,
      toPublicBundle(A, {
        keyId: A.oneTimePreKeys[0].keyId,
        publicKey: A.oneTimePreKeys[0].publicKey,
      }),
    );
    await processPeerBundle(
      C.store,
      uA.id,
      toPublicBundle(A, {
        keyId: A.oneTimePreKeys[1]?.keyId ?? A.oneTimePreKeys[0].keyId,
        publicKey:
          A.oneTimePreKeys[1]?.publicKey ?? A.oneTimePreKeys[0].publicKey,
      }),
    );

    const chat = await p.chat.create({
      data: {
        type: 'group',
        name: `F6 ${stamp}`,
        encryptionMode: 'e2e',
        participants: {
          create: [
            { userId: uA.id, role: 'admin' },
            { userId: uB.id, role: 'member' },
            { userId: uC.id, role: 'member' },
          ],
        },
      },
    });
    chatId = chat.id;

    const envB = await signalEncrypt(A.store, uB.id, 1, PLAIN);
    const envC = await signalEncrypt(A.store, uC.id, 1, PLAIN);

    const msg = await p.message.create({
      data: {
        chatId: chat.id,
        senderId: uA.id,
        originalText: '',
        originalLanguage: 'es',
        translatedText: null,
        isTranslated: false,
        ciphertext: envB.ciphertext,
        ciphertextType: envB.ciphertextType,
        isE2e: true,
      },
    });
    messageId = msg.id;

    await p.messageRecipientCipher.createMany({
      data: [
        {
          messageId: msg.id,
          recipientUserId: uB.id,
          ciphertext: envB.ciphertext,
          ciphertextType: envB.ciphertextType,
        },
        {
          messageId: msg.id,
          recipientUserId: uC.id,
          ciphertext: envC.ciphertext,
          ciphertextType: envC.ciphertextType,
        },
      ],
    });

    const row = await p.message.findUnique({ where: { id: msg.id } });
    const raw = await p.$queryRawUnsafe(
      `SELECT * FROM messages WHERE id = $1::uuid`,
      msg.id,
    );
    const hay = JSON.stringify(raw);
    if ((row.originalText || '').trim()) fail('plaintext in originalText');
    if ((row.translatedText || '').trim()) fail('plaintext in translatedText');
    if (hay.includes(PLAIN)) fail('plaintext in raw SQL row');

    const deliveries = await p.messageRecipientCipher.findMany({
      where: { messageId: msg.id },
    });
    if (deliveries.length !== 2) fail('expected 2 recipient envelopes', deliveries.length);

    const plainB = await signalDecrypt(
      B.store,
      uA.id,
      1,
      deliveries.find((d) => d.recipientUserId === uB.id).ciphertext,
    );
    const plainC = await signalDecrypt(
      C.store,
      uA.id,
      1,
      deliveries.find((d) => d.recipientUserId === uC.id).ciphertext,
    );

    const out = {
      ok: plainB === PLAIN && plainC === PLAIN,
      chatId,
      messageId,
      members: 3,
      senderKeepsLocalPlain: true,
      decryptB: plainB === PLAIN,
      decryptC: plainC === PLAIN,
      dbOpaque: true,
      plain: PLAIN,
    };
    console.log(JSON.stringify(out, null, 2));
    if (!out.ok) fail('decrypt mismatch', { plainB, plainC, PLAIN });
  } finally {
    if (messageId) {
      await p.messageRecipientCipher
        .deleteMany({ where: { messageId } })
        .catch(() => undefined);
      await p.message.delete({ where: { id: messageId } }).catch(() => undefined);
    }
    if (chatId) {
      await p.chatParticipant.deleteMany({ where: { chatId } }).catch(() => undefined);
      await p.chat.delete({ where: { id: chatId } }).catch(() => undefined);
    }
    for (const id of userIds) {
      await p.deviceIdentity.deleteMany({ where: { userId: id } }).catch(() => undefined);
      await p.user.delete({ where: { id } }).catch(() => undefined);
    }
    await p.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
