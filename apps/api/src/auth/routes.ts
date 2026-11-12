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

const FIDO2_RP_ID = process.env.FIDO2_RP_ID || 'synapmsg.ai';
const FIDO2_ORIGIN = process.env.FIDO2_ORIGIN || 'https://api.synapmsg.ai';
const loginChallenges = new Map<string, string>();

const router = Router();

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
router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
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
        },
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

    res.status(201).json({ token, user: serializeUser(user) });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /auth/bootstrap
 * First-open anonymous account: server allocates a unique 10-digit number.
 * No email/phone required. Existing email accounts are untouched.
 */
router.post('/bootstrap', async (req: Request, res: Response, next: NextFunction) => {
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
        },
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
      warning:
        'Si pierdes este teléfono y no agregaste un correo, no podrás recuperar la cuenta.',
    });
  } catch (err) {
    next(err);
  }
});

// ───────────────────────────────────────────────────────────
// POST /auth/login
// ───────────────────────────────────────────────────────────
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = (req.body ?? {}) as LoginBody;

    if (typeof email !== 'string' || !email.trim()) {
      res.status(400).json({ error: 'email is required' });
      return;
    }
    if (typeof password !== 'string' || !password) {
      res.status(400).json({ error: 'password is required' });
      return;
    }

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

    const skipFido =
      (process.env.NODE_ENV || 'development') !== 'production' &&
      (process.env.LOGIN_SKIP_FIDO2 === '1' ||
        process.env.LOGIN_SKIP_FIDO2 === 'true');
    const credCount = skipFido
      ? 0
      : await prisma.webAuthnCredential.count({
          where: { userId: fresh.id },
        });
    if (!skipFido && (fresh.fido2Enforced || credCount > 0)) {
      const loginTicket = signLoginTicket(fresh.id);
      res.json({
        requiresWebAuthn: true,
        loginTicket,
        userId: fresh.id,
        hasRecoveryCodes: Boolean(fresh.recoveryCodesHash),
      });
      return;
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

export default router;
export { serializeUser };
