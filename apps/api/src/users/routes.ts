import { Router, Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authMiddleware } from '../middleware/auth';
import { serializeUser } from '../auth/routes';

const router = Router();

const SUPPORTED_LANGUAGES = new Set([
  'es', 'en', 'pt', 'fr', 'it', 'de', 'zh', 'ja', 'ko', 'ar', 'ru', 'hi',
]);

router.use(authMiddleware);

// ───────────────────────────────────────────────────────────
// GET /users/search?q=
// ───────────────────────────────────────────────────────────
router.get('/search', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!q) {
      res.json({ users: [] });
      return;
    }

    // Case-insensitive search across username / email / name, excluding self.
    // Use Prisma's `mode: insensitive` (Postgres) and limit results.
    const users = await prisma.user.findMany({
      where: {
        AND: [
          { id: { not: req.user!.id } },
          {
            OR: [
              { username: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
              { name: { contains: q, mode: 'insensitive' } },
            ],
          },
        ],
      },
      take: 20,
      orderBy: { username: 'asc' },
    });

    res.json({ users: users.map(serializeUser) });
  } catch (err) {
    next(err);
  }
});

// ───────────────────────────────────────────────────────────
// GET /users/:id
// ───────────────────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ user: serializeUser(user) });
  } catch (err) {
    // Handle malformed UUIDs gracefully
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2023') {
      res.status(400).json({ error: 'Invalid user id' });
      return;
    }
    next(err);
  }
});

// ───────────────────────────────────────────────────────────
// PATCH /users/me
// ───────────────────────────────────────────────────────────
router.patch('/me', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, preferredLanguage, preferredTranslateMode } = (req.body ?? {}) as {
      name?: unknown;
      preferredLanguage?: unknown;
      preferredTranslateMode?: unknown;
    };

    const data: Prisma.UserUpdateInput = {};
    if (typeof name === 'string') {
      if (!name.trim()) {
        res.status(400).json({ error: 'name cannot be empty' });
        return;
      }
      data.name = name.trim();
    }
    if (typeof preferredLanguage === 'string') {
      const lang = preferredLanguage.toLowerCase();
      if (!SUPPORTED_LANGUAGES.has(lang)) {
        res.status(400).json({ error: `preferredLanguage must be one of: ${[...SUPPORTED_LANGUAGES].join(', ')}` });
        return;
      }
      data.preferredLanguage = lang;
    }
    if (typeof preferredTranslateMode === 'string') {
      if (preferredTranslateMode !== 'cloud' && preferredTranslateMode !== 'on-device') {
        res.status(400).json({ error: 'preferredTranslateMode must be "cloud" or "on-device"' });
        return;
      }
      data.preferredTranslateMode = preferredTranslateMode;
    }

    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: 'No valid fields to update' });
      return;
    }

    const updated = await prisma.user.update({
      where: { id: req.user!.id },
      data,
    });

    res.json({ user: serializeUser(updated) });
  } catch (err) {
    next(err);
  }
});

export default router;
