/**
 * FIDO2 new-device gate — API proof (no physical key needed for the "deny" path).
 * Usage: node scripts/prove-fido2-new-device.js <email> <password>
 *
 * Expects: account WITH at least one WebAuthn credential enrolled.
 * Checks: unknown deviceInstallId → requiresWebAuthn; known id → token.
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const email = process.argv[2];
const password = process.argv[3];
const API = process.env.API_BASE || 'https://api.synapmsg.ai';

if (!email || !password) {
  console.error('Usage: node prove-fido2-new-device.js <email> <password>');
  process.exit(2);
}

async function login(deviceInstallId) {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, deviceInstallId }),
  });
  const body = await r.json();
  return { status: r.status, body };
}

(async () => {
  const prisma = new PrismaClient();
  const user = await prisma.user.findUnique({
    where: email.includes('@')
      ? { email: email.toLowerCase() }
      : { privateNumber: email.replace(/\D/g, '') },
  });
  if (!user) {
    console.log(JSON.stringify({ ok: false, error: 'user_not_found' }));
    process.exit(1);
  }
  const creds = await prisma.webAuthnCredential.count({
    where: { userId: user.id },
  });
  if (creds < 1) {
    console.log(
      JSON.stringify({
        ok: false,
        error: 'enroll_fido2_first',
        hint: 'Open Ajustes → FIDO2 → Abrir enrolamiento on a phone',
      }),
    );
    process.exit(1);
  }

  const unknown = `inst_proof_${Date.now()}`;
  const deny = await login(unknown);
  const denied =
    deny.body &&
    deny.body.requiresWebAuthn === true &&
    !deny.body.token;

  // Seed a trusted device then confirm skip
  const known = `inst_known_${Date.now()}`;
  await prisma.trustedLoginDevice.create({
    data: { userId: user.id, deviceInstallId: known, label: 'proof' },
  });
  const allow = await login(known);
  const allowed = Boolean(allow.body && allow.body.token);

  // No-key account path is covered elsewhere; here we assert gate.
  const out = {
    ok: denied && allowed,
    creds,
    newDeviceRequiresFido2: denied,
    knownDeviceGetsToken: allowed,
    denyReason: deny.body?.reason || null,
  };
  console.log(JSON.stringify(out, null, 2));
  await prisma.$disconnect();
  process.exit(out.ok ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
