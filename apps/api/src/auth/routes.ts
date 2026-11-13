import { Router, Request, Response, NextFunction } from 'express';
import { randomBytes } from 'crypto';
import bcrypt from 'bcrypt';
import argon2 from 'argon2';
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import { prisma } from '../lib/prisma';
import { signToken, signLoginTicket, verifyLoginTicket } from '../lib/jwt';
import { authMiddleware } from '../middleware/auth';
import {
  allocatePrivateNumber,
  digitsOnly,
  ensurePrivateNumber,
  formatPrivateNumber,
  looksLikePrivateNumber,
} from '../lib/privateNumber';
import {
  generateRecoveryCode,
  hashRecoveryCode,
  isValidRecoveryCodeFormat,
  verifyRecoveryCode,
} from '../lib/accountRecovery';
import { ipRateLimit, shortIpHash } from '../middleware/ipRateLimit';

const FIDO2_RP_ID = process.env.FIDO2_RP_ID || 'synapmsg.ai';
const FIDO2_ORIGIN = process.env.FIDO2_ORIGIN || 'https://api.synapmsg.ai';
const loginChallenges = new Map<string, string>();

const router = Router();

/** 5 attempts / minute / IP — window rolls forward (not a permanent ban). */
const loginIpLimit = ipRateLimit({ name: 'auth-login', max: 5, windowMs: 60_000 });
const registerIpLimit = ipRateLimit({
  name: 'auth-register',
  max: 5,
  windowMs: 60_000,
});
/** Account recover: 5/min/IP + growing Retry-After. */
const recoverIpLimit = ipRateLimit({
  name: 'auth-recover',
  max: 5,
  windowMs: 60_000,
  growingWait: true,
});

const RECOVER_GENERIC_ERROR =
  'No se pudo recuperar con ese código. Revisá el papel e intentá de nuevo.';

function clientIpForLog(req: Request): string {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.trim()) {
    return xf.split(',')[0]!.trim();
  }
  if (Array.isArray(xf) && xf[0]) return String(xf[0]).split(',')[0]!.trim();
  return req.ip || req.socket.remoteAddress || 'unknown';
}

// ───────────────────────────────────────────────────────────
// Validation helpers
// ───────────────────────────────────────────────────────────
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SUPPORTED_LANGUAGES = new Set([
  'es', 'en', 'pt', 'fr', 'it', 'de', 'zh', 'ja', 'ko', 'ar', 'ru', 'hi',
]);

interface RegisterBody {
  email?: unknown;
  password?: unknown;
  name?: unknown;
  username?: unknown;
  preferredLanguage?: unknown;
}

interface LoginBody {
  email?: unknown;
  password?: unknown;
  /** Stable per-install id — FIDO2 only when unknown and keys are enrolled. */
  deviceInstallId?: unknown;
}

async function trustLoginDevice(
  userId: string,
  deviceInstallId: string,
  label = '',
): Promise<void> {
  const id = deviceInstallId.trim().slice(0, 128);
  if (!id) return;
  await prisma.trustedLoginDevice.upsert({
    where: {
      userId_deviceInstallId: { userId, deviceInstallId: id },
    },
    create: { userId, deviceInstallId: id, label: label.slice(0, 64) },
    update: { lastSeenAt: new Date() },
  });
}

/**
 * Strip sensitive fields before sending a user object to the client.
 */
function serializeUser(user: {
  id: string;
  email?: string | null;
  username: string;
  name: string;
  preferredLanguage: string;
  preferredTranslateMode: string;
  privateNumber?: string | null;
  privateNumberShared?: boolean | null;
  accountRecoveryConfirmed?: boolean | null;
  accountRecoveryHash?: string | null;
  plan?: string | null;
  planExpiresAt?: Date | null;
  mediaBytesUsed?: bigint | number | null;
  translationsToday?: number | null;
  translationsDayKey?: string | null;
  lastSeenAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  const plan =
    user.plan === 'premium' &&
    (!user.planExpiresAt || user.planExpiresAt.getTime() > Date.now())
      ? 'premium'
      : 'free';
  const pn = user.privateNumber || null;
  return {
    id: user.id,
    email: user.email || null,
    username: user.username,
    name: user.name,
    privateNumber: pn,
    privateNumberFormatted: pn ? formatPrivateNumber(pn) : null,
    privateNumberShared: Boolean(user.privateNumberShared),
    accountRecoveryConfirmed: Boolean(user.accountRecoveryConfirmed),
    /** True if a recovery hash exists (never expose the hash itself). */
    hasAccountRecovery: Boolean(user.accountRecoveryHash),
    preferredLanguage: user.preferredLanguage,
    preferredTranslateMode: user.preferredTranslateMode,
    plan,
    planExpiresAt: user.planExpiresAt
      ? user.planExpiresAt.toISOString()
      : null,
    mediaBytesUsed: Number(user.mediaBytesUsed ?? 0),
    translationsToday: user.translationsToday ?? 0,
    lastSeenAt: user.lastSeenAt ? user.lastSeenAt.toISOString() : null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

// ───────────────────────────────────────────────────────────
// POST /auth/register
// ───────────────────────────────────────────────────────────
router.post('/register', registerIpLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      email,
      password,
      name,
      username,
      preferredLanguage,
    } = (req.body ?? {}) as RegisterBody;

    // Required field checks
    if (typeof email !== 'string' || !email.trim()) {
      res.status(400).json({ error: 'email is required' });
      return;
    }
    if (!EMAIL_REGEX.test(email.trim())) {
      res.status(400).json({ error: 'email is not a valid address' });
      return;
    }
    if (typeof password !== 'string' || password.length < 6) {
      res.status(400).json({ error: 'password must be at least 6 characters' });
      return;
    }
    if (typeof username !== 'string' || !username.trim()) {
      res.status(400).json({ error: 'username is required' });
      return;
    }
    if (typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'name is required' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    // Usernames are case-insensitive unique (store lowercase).
    const normalizedUsername = username.trim().replace(/^@/, '').toLowerCase();
    if (!/^[a-z0-9_]{3,24}$/.test(normalizedUsername)) {
      res.status(400).json({
        error:
          'Usuario: 3–24 caracteres, solo letras, números y _ (sin espacios).',
        code: 'invalid_username',
      });
      return;
    }
    const lang =
      typeof preferredLanguage === 'string' && SUPPORTED_LANGUAGES.has(preferredLanguage.toLowerCase())
        ? preferredLanguage.toLowerCase()
        : 'es';

    // Uniqueness check (email exact + username case-insensitive)
    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { email: normalizedEmail },
          { username: { equals: normalizedUsername, mode: 'insensitive' } },
        ],
      },
      select: { email: true, username: true },
    });
    if (existing) {
      if (existing.email === normalizedEmail) {
        res.status(409).json({
          error: 'Ese correo ya está registrado. Iniciá sesión.',
          code: 'email_taken',
        });
        return;
      }
      res.status(409).json({
        error: 'Ese nombre de usuario ya está en uso. Probá otro.',
        code: 'username_taken',
      });
      return;
    }

    const rounds = Number(process.env.BCRYPT_ROUNDS) || 10;
    const passwordHash = await bcrypt.hash(password, rounds);
    const privateNumber = await allocatePrivateNumber();
    const recoveryCode = generateRecoveryCode();
    const accountRecoveryHash = await hashRecoveryCode(recoveryCode);

    let user;
    try {
      user = await prisma.user.create({
        data: {
          email: normalizedEmail,
          username: normalizedUsername,
          name: name.trim(),
          passwordHash,
          preferredLanguage: lang,
          privateNumber,
          accountRecoveryHash,
          accountRecoveryCreatedAt: new Date(),
          accountRecoveryConfirmed: false,
        },
      });
      await prisma.privateNumberLedger.updateMany({
        where: { privateNumber, firstUserId: null },
        data: { firstUserId: user.id },
      });
    } catch (createErr) {
      const code = (createErr as { code?: string }).code;
      if (code === 'P2002') {
        res.status(409).json({
          error: 'Ese correo o usuario ya existe. Iniciá sesión o cambiá el usuario.',
          code: 'already_exists',
        });
        return;
      }
      throw createErr;
    }

    const token = signToken({
      id: user.id,
      email: user.email,
      username: user.username,
    });

    // recoveryCode plaintext ONLY in this response — never logged / never stored.
    res.status(201).json({
      token,
      user: serializeUser(user),
      recoveryCode,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /auth/bootstrap
 * First-open anonymous account: server allocates a unique 10-digit number.
 * No email/phone required. Existing email accounts are untouched.
 */
router.post('/bootstrap', registerIpLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const preferredLanguage =
      typeof (req.body ?? {}).preferredLanguage === 'string' &&
      SUPPORTED_LANGUAGES.has(
        String((req.body as { preferredLanguage: string }).preferredLanguage).toLowerCase(),
      )
        ? String(
            (req.body as { preferredLanguage: string }).preferredLanguage,
          ).toLowerCase()
        : 'es';

    let privateNumber: string;
    try {
      privateNumber = await allocatePrivateNumber();
    } catch {
      res.status(503).json({
        error: 'No se pudo asignar un número único. Probá de nuevo.',
        code: 'number_collision',
      });
      return;
    }
    const username = `u${privateNumber}`;
    const name = formatPrivateNumber(privateNumber);
    const rounds = Number(process.env.BCRYPT_ROUNDS) || 10;
    const passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), rounds);
    const recoveryCode = generateRecoveryCode();
    const accountRecoveryHash = await hashRecoveryCode(recoveryCode);

    let user;
    try {
      user = await prisma.user.create({
        data: {
          email: null,
          username,
          name,
          passwordHash,
          preferredLanguage,
          privateNumber,
          privateNumberShared: false,
          accountRecoveryHash,
          accountRecoveryCreatedAt: new Date(),
          accountRecoveryConfirmed: false,
        },
      });
      await prisma.privateNumberLedger.updateMany({
        where: { privateNumber, firstUserId: null },
        data: { firstUserId: user.id },
      });
    } catch (createErr) {
      const code = (createErr as { code?: string }).code;
      if (code === 'P2002') {
        res.status(409).json({
          error: 'No se pudo asignar un número único. Probá de nuevo.',
          code: 'number_collision',
        });
        return;
      }
      throw createErr;
    }

    const token = signToken({
      id: user.id,
      email: user.email,
      username: user.username,
    });

    res.status(201).json({
      token,
      user: serializeUser(user),
      recoveryCode,
      warning:
        'Apuntá tu código de 12 caracteres en papel. Es la única forma de recuperar tu cuenta.',
    });
  } catch (err) {
    next(err);
  }
});

// ───────────────────────────────────────────────────────────
// POST /auth/login
// ───────────────────────────────────────────────────────────
router.post('/login', loginIpLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, deviceInstallId: rawDevice } =
      (req.body ?? {}) as LoginBody;

    if (typeof email !== 'string' || !email.trim()) {
      res.status(400).json({ error: 'email is required' });
      return;
    }
    if (typeof password !== 'string' || !password) {
      res.status(400).json({ error: 'password is required' });
      return;
    }
    const deviceInstallId =
      typeof rawDevice === 'string' ? rawDevice.trim().slice(0, 128) : '';

    const loginId = email.trim();
    const user = looksLikePrivateNumber(loginId)
      ? await prisma.user.findUnique({
          where: { privateNumber: digitsOnly(loginId) },
        })
      : await prisma.user.findUnique({
          where: { email: loginId.toLowerCase() },
        });

    // Use a constant-time-ish failure: always run bcrypt.compare even if
    // the user doesn't exist, to avoid user enumeration via timing.
    const dummyHash = '$2b$10$CwTycUXWue0Thq9StjUM0uJ8.6f1Q4d3s2r8.5z1nQ3q9r8s2t1u';
    const passwordMatches = user
      ? await bcrypt.compare(password, user.passwordHash)
      : await bcrypt.compare(password, dummyHash);

    if (!user || !passwordMatches) {
      res.status(401).json({
        error: 'Correo / Private Number o contraseña incorrectos',
        code: 'invalid_credentials',
      });
      return;
    }

    try {
      await ensurePrivateNumber(user.id);
    } catch (pnErr) {
      // eslint-disable-next-line no-console
      console.error('[auth/login] privateNumber', pnErr);
    }
    const fresh = await prisma.user.findUnique({ where: { id: user.id } });
    if (!fresh) {
      res.status(401).json({
        error: 'Correo / Private Number o contraseña incorrectos',
        code: 'invalid_credentials',
      });
      return;
    }

    await prisma.user.update({
      where: { id: fresh.id },
      data: { lastActiveAt: new Date(), lastSeenAt: new Date() },
    });

    // No enrolled key → login as always (password only).
    const credCount = await prisma.webAuthnCredential.count({
      where: { userId: fresh.id },
    });
    if (credCount > 0) {
      // Known installation skips FIDO2; only a new phone must assert.
      const known = deviceInstallId
        ? await prisma.trustedLoginDevice.findUnique({
            where: {
              userId_deviceInstallId: {
                userId: fresh.id,
                deviceInstallId,
              },
            },
          })
        : null;
      if (!known) {
        const loginTicket = signLoginTicket(fresh.id);
        res.json({
          requiresWebAuthn: true,
          loginTicket,
          userId: fresh.id,
          hasRecoveryCodes: Boolean(fresh.recoveryCodesHash),
          reason: 'new_device',
        });
        return;
      }
      await prisma.trustedLoginDevice.update({
        where: { id: known.id },
        data: { lastSeenAt: new Date() },
      });
    }

    const token = signToken({
      id: fresh.id,
      email: fresh.email,
      username: fresh.username,
    });

    res.json({ token, user: serializeUser(fresh) });
  } catch (err) {
    next(err);
  }
});

/** Step 2a: WebAuthn options for pending login ticket */
router.post('/login/webauthn/options', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ticket = String((req.body ?? {}).loginTicket || '');
    const { sub: userId } = verifyLoginTicket(ticket);
    const creds = await prisma.webAuthnCredential.findMany({ where: { userId } });
    if (creds.length === 0) {
      res.status(400).json({ error: 'No FIDO2 credentials' });
      return;
    }
    const options = await generateAuthenticationOptions({
      rpID: FIDO2_RP_ID,
      allowCredentials: creds.map((c) => ({
        id: c.credentialId,
        transports: JSON.parse(c.transports || '[]'),
      })),
      userVerification: 'preferred',
    });
    loginChallenges.set(userId, options.challenge);
    res.json({ ...options, loginTicket: ticket });
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired login ticket' });
    void err;
  }
});

router.post('/login/webauthn/verify', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ticket = String((req.body ?? {}).loginTicket || '');
    const deviceInstallId = String(
      (req.body ?? {}).deviceInstallId || '',
    ).trim().slice(0, 128);
    const { sub: userId } = verifyLoginTicket(ticket);
    const expectedChallenge = loginChallenges.get(userId);
    if (!expectedChallenge) {
      res.status(400).json({ error: 'No challenge' });
      return;
    }
    const assertion = (req.body ?? {}).assertion as AuthenticationResponseJSON;
    const cred = await prisma.webAuthnCredential.findUnique({
      where: { credentialId: assertion.id },
    });
    if (!cred || cred.userId !== userId) {
      res.status(400).json({ error: 'Unknown credential' });
      return;
    }
    const verification = await verifyAuthenticationResponse({
      response: assertion,
      expectedChallenge,
      expectedOrigin: FIDO2_ORIGIN,
      expectedRPID: FIDO2_RP_ID,
      credential: {
        id: cred.credentialId,
        publicKey: Buffer.from(cred.publicKey, 'base64'),
        counter: cred.counter,
        transports: JSON.parse(cred.transports || '[]'),
      },
    });
    loginChallenges.delete(userId);
    if (!verification.verified) {
      res.status(401).json({ error: 'WebAuthn failed' });
      return;
    }
    await prisma.webAuthnCredential.update({
      where: { id: cred.id },
      data: { counter: verification.authenticationInfo.newCounter },
    });
    if (deviceInstallId) {
      await trustLoginDevice(userId, deviceInstallId, 'fido2-login');
    }
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const token = signToken({
      id: user.id,
      email: user.email,
      username: user.username,
    });
    res.json({ token, user: serializeUser(user) });
  } catch (err) {
    next(err);
  }
});

router.post('/login/recovery', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ticket = String((req.body ?? {}).loginTicket || '');
    const code = String((req.body ?? {}).code || '').trim().toLowerCase();
    const deviceInstallId = String(
      (req.body ?? {}).deviceInstallId || '',
    ).trim().slice(0, 128);
    const { sub: userId } = verifyLoginTicket(ticket);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user?.recoveryCodesHash) {
      res.status(400).json({ error: 'No recovery codes' });
      return;
    }
    const hashes = JSON.parse(user.recoveryCodesHash) as string[];
    let matched = -1;
    for (let i = 0; i < hashes.length; i++) {
      if (await argon2.verify(hashes[i]!, code)) {
        matched = i;
        break;
      }
    }
    if (matched < 0) {
      res.status(401).json({ error: 'Invalid recovery code' });
      return;
    }
    hashes.splice(matched, 1);
    await prisma.user.update({
      where: { id: userId },
      data: { recoveryCodesHash: JSON.stringify(hashes) },
    });
    if (deviceInstallId) {
      await trustLoginDevice(userId, deviceInstallId, 'recovery');
    }
    const token = signToken({
      id: user.id,
      email: user.email,
      username: user.username,
    });
    res.json({ token, user: serializeUser(user) });
  } catch (err) {
    next(err);
  }
});

// ───────────────────────────────────────────────────────────
// GET /auth/me
// ───────────────────────────────────────────────────────────
router.get('/me', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await ensurePrivateNumber(req.user!.id);
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
    });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({ user: serializeUser(user) });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /auth/recovery/confirm
 * User confirms they wrote down the one-time recovery passphrase.
 */
router.post(
  '/recovery/confirm',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await prisma.user.update({
        where: { id: req.user!.id },
        data: { accountRecoveryConfirmed: true },
      });
      res.json({ user: serializeUser(user) });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /auth/recover
 * Body: { code } — 12-char recovery passphrase.
 * Looks up by argon2 verify (hash only in DB). Always same error on miss.
 * On success: same privateNumber, wipe server-side device keys, new loginTicket.
 */
router.post(
  '/recover',
  recoverIpLimit,
  async (req: Request, res: Response, next: NextFunction) => {
    const ipHash = shortIpHash(clientIpForLog(req));
    try {
      const raw = String((req.body ?? {}).code ?? '');
      if (!isValidRecoveryCodeFormat(raw)) {
        // eslint-disable-next-line no-console
        console.info(`[account-recover] ipHash=${ipHash} result=fail reason=format`);
        res.status(400).json({ error: RECOVER_GENERIC_ERROR });
        return;
      }

      const candidates = await prisma.user.findMany({
        where: { accountRecoveryHash: { not: null } },
        select: {
          id: true,
          email: true,
          username: true,
          privateNumber: true,
          accountRecoveryHash: true,
        },
      });

      let matched: (typeof candidates)[number] | null = null;
      for (const row of candidates) {
        if (!row.accountRecoveryHash) continue;
        if (await verifyRecoveryCode(raw, row.accountRecoveryHash)) {
          matched = row;
          break;
        }
      }

      if (!matched) {
        // eslint-disable-next-line no-console
        console.info(`[account-recover] ipHash=${ipHash} result=fail reason=nomatch`);
        res.status(400).json({ error: RECOVER_GENERIC_ERROR });
        return;
      }

      // Invalidate lost-phone crypto material: Signal device pubs + trusted logins.
      // Old phone keys must never decrypt new traffic after recover.
      await prisma.$transaction([
        prisma.deviceIdentity.deleteMany({ where: { userId: matched.id } }),
        prisma.trustedLoginDevice.deleteMany({ where: { userId: matched.id } }),
        prisma.user.update({
          where: { id: matched.id },
          data: {
            pushToken: null,
            // Rotate password so stale sessions/credentials on the lost phone stop working.
            passwordHash: await bcrypt.hash(randomBytes(32).toString('hex'), 10),
          },
        }),
      ]);

      const fresh = await prisma.user.findUnique({ where: { id: matched.id } });
      if (!fresh) {
        res.status(400).json({ error: RECOVER_GENERIC_ERROR });
        return;
      }

      const loginTicket = signLoginTicket(fresh.id);
      const token = signToken({
        id: fresh.id,
        email: fresh.email,
        username: fresh.username,
      });

      // eslint-disable-next-line no-console
      console.info(
        `[account-recover] ipHash=${ipHash} result=ok userId=${fresh.id.slice(0, 8)}`,
      );

      res.json({
        ok: true,
        privateNumber: fresh.privateNumber,
        privateNumberFormatted: fresh.privateNumber
          ? formatPrivateNumber(fresh.privateNumber)
          : null,
        loginTicket,
        token,
        user: serializeUser(fresh),
        notice:
          'Recuperaste tu cuenta y tu número. Tus conversaciones anteriores no se pueden recuperar.',
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
export { serializeUser };
