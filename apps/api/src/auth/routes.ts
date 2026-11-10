import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { prisma } from '../lib/prisma';
import { signToken } from '../lib/jwt';
import { authMiddleware } from '../middleware/auth';

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
  email: string;
  username: string;
  name: string;
  preferredLanguage: string;
  preferredTranslateMode: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    name: user.name,
    preferredLanguage: user.preferredLanguage,
    preferredTranslateMode: user.preferredTranslateMode,
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
    const normalizedUsername = username.trim();
    const lang =
      typeof preferredLanguage === 'string' && SUPPORTED_LANGUAGES.has(preferredLanguage.toLowerCase())
        ? preferredLanguage.toLowerCase()
        : 'es';

    // Uniqueness check (returns 409 instead of relying on Prisma's P2002)
    const existing = await prisma.user.findFirst({
      where: {
        OR: [{ email: normalizedEmail }, { username: normalizedUsername }],
      },
      select: { email: true, username: true },
    });
    if (existing) {
      if (existing.email === normalizedEmail) {
        res.status(409).json({ error: 'email is already registered' });
        return;
      }
      res.status(409).json({ error: 'username is already taken' });
      return;
    }

    const rounds = Number(process.env.BCRYPT_ROUNDS) || 10;
    const passwordHash = await bcrypt.hash(password, rounds);

    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        username: normalizedUsername,
        name: name.trim(),
        passwordHash,
        preferredLanguage: lang,
      },
    });

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

    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    // Use a constant-time-ish failure: always run bcrypt.compare even if
    // the user doesn't exist, to avoid user enumeration via timing.
    const dummyHash = '$2b$10$CwTycUXWue0Thq9StjUM0uJ8.6f1Q4d3s2r8.5z1nQ3q9r8s2t1u';
    const passwordMatches = user
      ? await bcrypt.compare(password, user.passwordHash)
      : await bcrypt.compare(password, dummyHash);

    if (!user || !passwordMatches) {
      res.status(401).json({ error: 'Invalid email or password' });
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

// ───────────────────────────────────────────────────────────
// GET /auth/me
// ───────────────────────────────────────────────────────────
router.get('/me', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
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
