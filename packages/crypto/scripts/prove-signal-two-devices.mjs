/**
 * Fase 2 proof: two devices, Signal Protocol (libsignal) encrypt → opaque DB → decrypt.
 * Private keys never leave each device's MemorySignalStore.
 */
import { webcrypto } from 'node:crypto';
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

const PLAIN = 'FASE2_SIGNAL_SECRET_' + Date.now();

function fail(msg, detail) {
  console.error('FAIL:', msg);
  if (detail !== undefined) console.error(detail);
  process.exit(1);
}

async function main() {
  if (!LEGACY_PQ_RATCHET_DISABLED_FOR_NEW) {
    fail('legacy PQ ratchet must be disabled for new chats');
  }

  const alice = await installSignalIdentity({ deviceId: 1 });
  const bob = await installSignalIdentity({ deviceId: 1 });

  // What the server stores / returns (public only).
  const bobOtkPublic = {
    keyId: bob.oneTimePreKeys[0].keyId,
    publicKey: bob.oneTimePreKeys[0].publicKey,
  };
  const bobBundle = toPublicBundle(bob, bobOtkPublic);
  // Server would drop that OTK from the public list; Bob keeps the private locally.

  if (JSON.stringify(bobBundle).includes(bob.store.identityKeyPair.privKey)) {
    fail('private key must never appear in public bundle');
  }

  await processPeerBundle(alice.store, 'user-bob', bobBundle);
  const { ciphertext, ciphertextType } = await signalEncrypt(
    alice.store,
    'user-bob',
    bobBundle.deviceId,
    PLAIN,
  );

  const dbRow = {
    originalText: '',
    translatedText: null,
    isE2e: true,
    ciphertext,
    ciphertextType,
    protocol: SIGNAL_PROTOCOL,
  };
  const dbJson = JSON.stringify(dbRow);
  if (dbJson.includes(PLAIN)) fail('plaintext leaked into DB row', dbJson.slice(0, 300));
  if ((dbRow.originalText || '').length > 0) fail('originalText not empty');
  console.log('OK db: opaque ciphertext only');

  const opened = await signalDecrypt(
    bob.store,
    'user-alice',
    alice.deviceId,
    ciphertext,
  );
  if (opened !== PLAIN) fail('Bob failed to decrypt', { opened, PLAIN });
  console.log('OK peer: Bob opened the message');

  // Reply Bob → Alice (session already established both ways after PreKey msg)
  const reply = 'FASE2_REPLY_' + Date.now();
  const enc2 = await signalEncrypt(bob.store, 'user-alice', alice.deviceId, reply);
  if (JSON.stringify(enc2).includes(reply)) {
    // ciphertext blob is base64 JSON — reply must not appear as plaintext field
    const wireStr = Buffer.from(enc2.ciphertext, 'base64').toString('utf8');
    if (wireStr.includes(reply)) fail('reply plaintext inside wire JSON');
  }
  const opened2 = await signalDecrypt(
    alice.store,
    'user-bob',
    bob.deviceId,
    enc2.ciphertext,
  );
  if (opened2 !== reply) fail('Alice failed to decrypt reply', opened2);
  console.log('OK peer: Alice opened the reply');

  const safety = await signalSafetyNumber(
    'user-alice',
    alice.identityKeyPubB64,
    'user-bob',
    bob.identityKeyPubB64,
  );
  const qr = safetyQrPayload(safety);
  if (!safety || safety.length < 10) fail('safety number too short', safety);
  if (!qr.startsWith('synapmsg:safety:')) fail('QR payload malformed', qr);
  console.log('OK safety+QR:', safety.slice(0, 24) + '…');

  console.log(
    JSON.stringify(
      {
        ok: true,
        protocol: SIGNAL_PROTOCOL,
        legacyDisabledForNew: LEGACY_PQ_RATCHET_DISABLED_FOR_NEW,
        aliceDevice: alice.deviceId,
        bobDevice: bob.deviceId,
        ciphertextType,
        ciphertextLen: ciphertext.length,
        safetyNumberPreview: safety.slice(0, 29),
        qrPayloadPreview: qr.slice(0, 40) + '…',
        proved: [
          'Signal encrypt Alice→Bob',
          'DB row has empty originalText and no plaintext',
          'Bob decrypts',
          'Bob→Alice reply works',
          'safety number + QR payload',
          'private keys never in public bundle',
        ],
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
