/**
 * Absolute security API — wipe, KTL (persisted Merkle-chain), DMS, WebAuthn/FIDO2.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { createHash, randomBytes } from 'crypto';
import argon2 from 'argon2';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from '@simplewebauthn/server';
import { prisma } from '../lib/prisma';
import { authMiddleware } from '../middleware/auth';
import { sendToUser } from '../messages/websocket';
import { signWipePayload, wipePublicKeyB64 } from '../lib/wipeSign';
import { signToken } from '../lib/jwt';
import { serializeUser } from '../auth/routes';

const router = Router();

const RP_ID = process.env.FIDO2_RP_ID || 'synapmsg.ai';
const RP_NAME = 'Synapmsg';
const ORIGIN = process.env.FIDO2_ORIGIN || 'https://api.synapmsg.ai';

const challenges = new Map<string, string>();

/** Public verifying key for remote wipe (safe to pin on clients). */
router.get('/wipe-pubkey', (_req: Request, res: Response) => {
  res.json({ alg: 'ed25519', pubKey: wipePublicKeyB64() });
});

function chainHash(prev: string, payload: string): string {
  return createHash('sha256').update(`${prev}|${payload}`).digest('hex');
}

router.post('/wipe', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = (req.body ?? {}) as {
      reason?: unknown;
      issuerDeviceId?: unknown;
    };
    const reason =
      typeof body.reason === 'string'
        ? String(body.reason).slice(0, 120)
        : 'user_requested';
    const issuerDeviceId =
      typeof body.issuerDeviceId === 'string' && body.issuerDeviceId.trim()
        ? body.issuerDeviceId.trim().slice(0, 64)
        : null;
    const nonce = randomBytes(16).toString('hex');
    const issuedAt = new Date().toISOString();

    // Drop other devices' public identities (session of "otro aparato").
    // If issuerDeviceId is set, keep the issuer row; otherwise remove all.
    const deleted = await prisma.deviceIdentity.deleteMany({
      where: issuerDeviceId
        ? { userId: req.user!.id, deviceId: { not: issuerDeviceId } }
        : { userId: req.user!.id },
    });

    const payload = {
      type: 'remote_wipe' as const,
      userId: req.user!.id,
      nonce,
      reason,
      issuedAt,
      issuerDeviceId,
    };
    const sig = signWipePayload(payload);
    const delivered = sendToUser(req.user!.id, {
      ...payload,
      sig,
      alg: 'ed25519',
      pubKey: wipePublicKeyB64(),
    });
    res.json({
      ok: true,
      nonce,
      issuedAt,
      alg: 'ed25519',
      pubKey: wipePublicKeyB64(),
      issuerDeviceId,
      otherDevicesRemoved: deleted.count,
      wsDelivered: delivered,
    });
  } catch (err) {
    next(err);
  }
});

/** Generate one-time recovery codes (argon2 hashed server-side). */
router.post(
  '/recovery-codes',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const codes: string[] = [];
      const hashes: string[] = [];
      for (let i = 0; i < 8; i++) {
        const code = randomBytes(5).toString('hex');
        codes.push(code);
        hashes.push(await argon2.hash(code));
      }
      await prisma.user.update({
        where: { id: req.user!.id },
        data: {
          recoveryCodesHash: JSON.stringify(hashes),
          fido2Enforced: true,
        },
      });
      res.json({
        ok: true,
        codes,
        note: 'Guarda estos códigos; solo se muestran una vez.',
      });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/ktl/publish',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const device = await prisma.deviceIdentity.findFirst({
        where: { userId: req.user!.id },
        orderBy: { updatedAt: 'desc' },
      });
      if (!device) {
        res.status(400).json({ error: 'No E2E device', code: 'no_e2e_device' });
        return;
      }
      const last = await prisma.keyTransparencyEntry.findFirst({
        orderBy: { seq: 'desc' },
      });
      const seq = (last?.seq ?? 0) + 1;
      const prevHash = last?.hash ?? 'genesis';
      const at = new Date().toISOString();
      const hash = chainHash(
        prevHash,
        `${seq}|${req.user!.id}|${device.identityKeyPub}|${at}`,
      );
      const entry = await prisma.keyTransparencyEntry.create({
        data: {
          seq,
          userId: req.user!.id,
          identityKeyPub: device.identityKeyPub,
          hash,
          prevHash,
        },
      });
      res.json({
        ok: true,
        entry: {
          seq: entry.seq,
          userId: entry.userId,
          identityKeyPub: entry.identityKeyPub,
          hash: entry.hash,
          prevHash: entry.prevHash,
          at: entry.createdAt.toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/** Public audit read — no auth (Key Transparency). */
router.get('/ktl/public/root', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const last = await prisma.keyTransparencyEntry.findFirst({
      orderBy: { seq: 'desc' },
    });
    res.json({
      protocol: 'ktl-v1',
      latestSeq: last?.seq ?? 0,
      rootHash: last?.hash ?? 'genesis',
      at: last?.createdAt?.toISOString() ?? null,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/ktl/public/:userId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const entries = await prisma.keyTransparencyEntry.findMany({
      where: { userId: req.params.userId },
      orderBy: { seq: 'asc' },
      take: 100,
    });
    res.json({
      userId: req.params.userId,
      protocol: 'ktl-v1',
      public: true,
      entries: entries.map((e) => ({
        seq: e.seq,
        identityKeyPub: e.identityKeyPub,
        hash: e.hash,
        prevHash: e.prevHash,
        at: e.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.get(
  '/ktl/:userId',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const entries = await prisma.keyTransparencyEntry.findMany({
        where: { userId: req.params.userId },
        orderBy: { seq: 'asc' },
      });
      res.json({
        userId: req.params.userId,
        protocol: 'ktl-v1',
        entries: entries.map((e) => ({
          seq: e.seq,
          identityKeyPub: e.identityKeyPub,
          hash: e.hash,
          prevHash: e.prevHash,
          at: e.createdAt.toISOString(),
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

router.put('/dms', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = (req.body ?? {}) as {
      enabled?: unknown;
      idleDays?: unknown;
      action?: unknown;
      /** Pre-armed ciphertext blob (client-encrypted). Server never sees plaintext. */
      payloadCiphertext?: unknown;
      notifyContactIds?: unknown;
    };
    const enabled = Boolean(body.enabled);
    const idleDays =
      typeof body.idleDays === 'number' && body.idleDays >= 1
        ? Math.min(365, Math.floor(body.idleDays))
        : 30;
    const action =
      body.action === 'wipe' ||
      body.action === 'notify' ||
      body.action === 'wipe_and_notify' ||
      body.action === 'message' ||
      body.action === 'ciphertext'
        ? body.action
        : 'notify';
    const payloadCiphertext =
      typeof body.payloadCiphertext === 'string'
        ? body.payloadCiphertext.slice(0, 64_000)
        : undefined;
    const notifyContactIds = Array.isArray(body.notifyContactIds)
      ? body.notifyContactIds
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
          .slice(0, 20)
      : [];
    const cfg = { enabled, idleDays, action, payloadCiphertext, notifyContactIds };
    await prisma.glossaryEntry.upsert({
      where: { userId_source: { userId: req.user!.id, source: '__dms_config__' } },
      create: {
        userId: req.user!.id,
        source: '__dms_config__',
        target: JSON.stringify(cfg),
      },
      update: { target: JSON.stringify(cfg) },
    });
    res.json({ ok: true, dms: cfg });
  } catch (err) {
    next(err);
  }
});

router.get('/dms', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const row = await prisma.glossaryEntry.findUnique({
      where: { userId_source: { userId: req.user!.id, source: '__dms_config__' } },
    });
    if (!row) {
      res.json({
        dms: { enabled: false, idleDays: 30, action: 'notify', notifyContactIds: [] },
      });
      return;
    }
    try {
      res.json({ dms: JSON.parse(row.target) });
    } catch {
      res.json({
        dms: { enabled: false, idleDays: 30, action: 'notify', notifyContactIds: [] },
      });
    }
  } catch (err) {
    next(err);
  }
});

/** Re-evaluate inactivity for the caller (used by proof / Settings). */
router.post(
  '/dms/check',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tickDmsForUser } = await import('./dmsScheduler');
      const result = await tickDmsForUser(req.user!.id);
      res.json({ ok: true, ...result });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/webauthn/register/options',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      const existing = await prisma.webAuthnCredential.findMany({
        where: { userId: user.id },
      });
      const options = await generateRegistrationOptions({
        rpName: RP_NAME,
        rpID: RP_ID,
        userName: user.email || user.username,
        userDisplayName: user.name,
        userID: new TextEncoder().encode(user.id.replace(/-/g, '').slice(0, 32)),
        attestationType: 'none',
        excludeCredentials: existing.map((c) => ({
          id: c.credentialId,
          transports: JSON.parse(c.transports || '[]'),
        })),
        authenticatorSelection: {
          residentKey: 'preferred',
          userVerification: 'preferred',
        },
      });
      challenges.set(user.id, options.challenge);
      res.json(options);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/webauthn/register/verify',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const expectedChallenge = challenges.get(req.user!.id);
      if (!expectedChallenge) {
        res.status(400).json({ error: 'No registration challenge' });
        return;
      }
      const body = req.body as RegistrationResponseJSON;
      const verification = await verifyRegistrationResponse({
        response: body,
        expectedChallenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
      });
      challenges.delete(req.user!.id);
      if (!verification.verified || !verification.registrationInfo) {
        res.status(400).json({ error: 'Verification failed' });
        return;
      }
      const { credential, credentialDeviceType, credentialBackedUp } =
        verification.registrationInfo;
      void credentialDeviceType;
      void credentialBackedUp;
      const label =
        typeof (req.body as { label?: string }).label === 'string'
          ? String((req.body as { label: string }).label).slice(0, 64)
          : 'Passkey / YubiKey';
      await prisma.webAuthnCredential.create({
        data: {
          userId: req.user!.id,
          credentialId: credential.id,
          publicKey: Buffer.from(credential.publicKey).toString('base64'),
          counter: credential.counter,
          transports: JSON.stringify(credential.transports ?? []),
          label,
        },
      });
      // Enrolment device becomes trusted so this phone is not locked out next login.
      const deviceInstallId = String(
        (req.body as { deviceInstallId?: string }).deviceInstallId || '',
      )
        .trim()
        .slice(0, 128);
      if (deviceInstallId) {
        await prisma.trustedLoginDevice.upsert({
          where: {
            userId_deviceInstallId: {
              userId: req.user!.id,
              deviceInstallId,
            },
          },
          create: {
            userId: req.user!.id,
            deviceInstallId,
            label: 'enroll',
          },
          update: { lastSeenAt: new Date() },
        });
      }
      res.json({ ok: true, credentialId: credential.id, label });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/webauthn/auth/options',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const creds = await prisma.webAuthnCredential.findMany({
        where: { userId: req.user!.id },
      });
      if (creds.length === 0) {
        res.status(400).json({ error: 'No WebAuthn credentials enrolled' });
        return;
      }
      const options = await generateAuthenticationOptions({
        rpID: RP_ID,
        allowCredentials: creds.map((c) => ({
          id: c.credentialId,
          transports: JSON.parse(c.transports || '[]'),
        })),
        userVerification: 'preferred',
      });
      challenges.set(req.user!.id, options.challenge);
      res.json(options);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/webauthn/auth/verify',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const expectedChallenge = challenges.get(req.user!.id);
      if (!expectedChallenge) {
        res.status(400).json({ error: 'No auth challenge' });
        return;
      }
      const body = req.body as AuthenticationResponseJSON;
      const cred = await prisma.webAuthnCredential.findUnique({
        where: { credentialId: body.id },
      });
      if (!cred || cred.userId !== req.user!.id) {
        res.status(400).json({ error: 'Unknown credential' });
        return;
      }
      const verification = await verifyAuthenticationResponse({
        response: body,
        expectedChallenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        credential: {
          id: cred.credentialId,
          publicKey: Buffer.from(cred.publicKey, 'base64'),
          counter: cred.counter,
          transports: JSON.parse(cred.transports || '[]'),
        },
      });
      challenges.delete(req.user!.id);
      if (!verification.verified) {
        res.status(400).json({ error: 'Auth failed' });
        return;
      }
      await prisma.webAuthnCredential.update({
        where: { id: cred.id },
        data: { counter: verification.authenticationInfo.newCounter },
      });
      res.json({ ok: true, verified: true });
    } catch (err) {
      next(err);
    }
  },
);

router.get('/webauthn/credentials', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await prisma.webAuthnCredential.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json({
      credentials: rows.map((r) => ({
        id: r.credentialId,
        label: r.label,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/status', authMiddleware, async (_req: Request, res: Response) => {
  res.json({
    e2e: 'synapmsg-pq-v1',
    libsignal: true,
    doubleRatchet: true,
    pqHybrid: 'ml-kem768',
    ktl: 'ktl-v1',
    remoteWipe: true,
    duressPin: true,
    decoyAccount: true,
    dms: true,
    fido2: 'webauthn',
    enclave: 'synap-enclave native + SecureStore/StrongBox + sqlcipher-file',
    onDeviceTranslate: true,
    whisper: 'lazy-model',
    vpn: process.env.SYNAP_VPN_ENABLED === '1' ? 'configured' : 'profile_pending',
  });
});

/** Anti-censorship: always advertise Cloudflare tunnel; optional WG/Outline. */
router.get('/vpn/config', authMiddleware, async (_req: Request, res: Response) => {
  const enabled = process.env.SYNAP_VPN_ENABLED === '1';
  const provider = (process.env.SYNAP_VPN_PROVIDER || 'none') as
    | 'wireguard'
    | 'outline'
    | 'none';
  res.json({
    enabled,
    provider: enabled ? provider : 'none',
    config: enabled ? process.env.SYNAP_VPN_WG_CONFIG || undefined : undefined,
    endpoint: enabled ? process.env.SYNAP_VPN_OUTLINE_ENDPOINT || undefined : undefined,
    tunnel: 'https://media.synapmsg.ai/tunnel',
    note: enabled
      ? 'Import WireGuard/Outline + use media tunnel'
      : 'Client uses media.synapmsg.ai/tunnel (hides API IP). Set SYNAP_VPN_ENABLED=1 for WG/Outline relays.',
  });
});

/** Ensure a linked decoy account with innocuous seed chats exists. */
router.post(
  '/decoy/ensure',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const me = await prisma.user.findUnique({ where: { id: req.user!.id } });
      if (!me) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      let decoyId = me.decoyUserId;
      if (decoyId) {
        const existing = await prisma.user.findUnique({ where: { id: decoyId } });
        if (!existing) decoyId = null;
      }

      if (!decoyId) {
        const suffix = randomBytes(3).toString('hex');
        const passwordHash = await argon2.hash(randomBytes(24).toString('hex'));
        const decoy = await prisma.user.create({
          data: {
            email: `decoy.${me.id.slice(0, 8)}.${suffix}@synapmsg.local`,
            username: `decoy_${suffix}`,
            name: 'Alex Rivera',
            passwordHash,
            preferredLanguage: me.preferredLanguage || 'es',
            preferredTranslateMode: 'cloud',
            plan: 'free',
          },
        });
        decoyId = decoy.id;
        await prisma.user.update({
          where: { id: me.id },
          data: { decoyUserId: decoyId },
        });

        // Empty decoy — no chats/messages (PIN de coacción → cuenta vacía).
      }

      // Always keep decoy empty (remove any leftover chats from older seeds).
      const decoyChats = await prisma.chatParticipant.findMany({
        where: { userId: decoyId },
        select: { chatId: true },
      });
      const chatIds = [...new Set(decoyChats.map((c) => c.chatId))];
      if (chatIds.length > 0) {
        await prisma.message.deleteMany({ where: { chatId: { in: chatIds } } });
        await prisma.chatParticipant.deleteMany({
          where: { chatId: { in: chatIds } },
        });
        await prisma.chat.deleteMany({ where: { id: { in: chatIds } } });
      }

      res.json({
        ok: true,
        decoyUserId: decoyId,
        ready: true,
        empty: true,
      });
    } catch (err) {
      next(err);
    }
  },
);

/** Switch session to linked decoy (duress path). Primary vault must be wiped client-side. */
router.post(
  '/decoy/enter',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const me = await prisma.user.findUnique({ where: { id: req.user!.id } });
      if (!me?.decoyUserId) {
        res.status(400).json({
          error: 'No decoy configured',
          code: 'no_decoy',
        });
        return;
      }
      const decoy = await prisma.user.findUnique({
        where: { id: me.decoyUserId },
      });
      if (!decoy) {
        res.status(404).json({ error: 'Decoy missing', code: 'decoy_missing' });
        return;
      }

      const token = signToken({
        id: decoy.id,
        email: decoy.email,
        username: decoy.username,
      });
      res.json({
        token,
        user: serializeUser(decoy),
        decoy: true,
      });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/decoy/status',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const me = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: { decoyUserId: true },
      });
      res.json({ configured: Boolean(me?.decoyUserId) });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
