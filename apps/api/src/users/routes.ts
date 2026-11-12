import { Router, Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authMiddleware } from '../middleware/auth';
import { serializeUser } from '../auth/routes';
import {
  digitsOnly,
  looksLikePrivateNumber,
} from '../lib/privateNumber';
import { APP_LANGUAGES, translateText } from '../translation/service';
import {
  assertGlossaryCapacity,
  consumeTranslation,
  getEffectivePlan,
  PlanLimitError,
} from '../billing/usage';

const router = Router();

const SUPPORTED_LANGUAGES = new Set(APP_LANGUAGES);

router.use(authMiddleware);

// GET /users/me/glossary
router.get('/me/glossary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const state = await getEffectivePlan(req.user!.id);
    const entries = await prisma.glossaryEntry.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      take: state.limits.glossaryMax,
    });
    res.json({
      entries: entries.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        createdAt: e.createdAt.toISOString(),
      })),
      limit: state.limits.glossaryMax,
      plan: state.planId,
    });
  } catch (err) {
    next(err);
  }
});

// POST /users/me/glossary { source, target }
router.post('/me/glossary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { source, target } = (req.body ?? {}) as {
      source?: unknown;
      target?: unknown;
    };
    if (typeof source !== 'string' || !source.trim()) {
      res.status(400).json({ error: 'source is required' });
      return;
    }
    if (typeof target !== 'string' || !target.trim()) {
      res.status(400).json({ error: 'target is required' });
      return;
    }

    const existing = await prisma.glossaryEntry.findUnique({
      where: {
        userId_source: {
          userId: req.user!.id,
          source: source.trim(),
        },
      },
    });
    if (!existing) {
      await assertGlossaryCapacity(req.user!.id);
    }

    const entry = await prisma.glossaryEntry.upsert({
      where: {
        userId_source: {
          userId: req.user!.id,
          source: source.trim(),
        },
      },
      create: {
        userId: req.user!.id,
        source: source.trim(),
        target: target.trim(),
      },
      update: { target: target.trim() },
    });
    res.status(201).json({
      entry: {
        id: entry.id,
        source: entry.source,
        target: entry.target,
        createdAt: entry.createdAt.toISOString(),
      },
    });
  } catch (err) {
    if (err instanceof PlanLimitError) {
      res.status(err.status).json({ error: err.message, code: err.code });
      return;
    }
    next(err);
  }
});

// DELETE /users/me/glossary/:id
router.delete(
  '/me/glossary/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ error: 'id required' });
        return;
      }
      const existing = await prisma.glossaryEntry.findFirst({
        where: { id, userId: req.user!.id },
      });
      if (!existing) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      await prisma.glossaryEntry.delete({ where: { id } });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// POST /users/me/translate { text, targetLang, sourceLang? } — for call captions
router.post('/me/translate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { text, targetLang, sourceLang } = (req.body ?? {}) as {
      text?: unknown;
      targetLang?: unknown;
      sourceLang?: unknown;
    };
    if (typeof text !== 'string' || !text.trim()) {
      res.status(400).json({ error: 'text required' });
      return;
    }
    if (typeof targetLang !== 'string' || !SUPPORTED_LANGUAGES.has(targetLang.toLowerCase())) {
      res.status(400).json({ error: 'targetLang invalid' });
      return;
    }
    await consumeTranslation(req.user!.id);
    const result = await translateText(
      text.trim().slice(0, 500),
      targetLang,
      typeof sourceLang === 'string' ? sourceLang : undefined,
    );
    res.json({
      text: result.text,
      translated: result.translated,
      detectedSourceLanguage: result.detectedSourceLanguage ?? null,
    });
  } catch (err) {
    if (err instanceof PlanLimitError) {
      res.status(err.status).json({ error: err.message, code: err.code });
      return;
    }
    next(err);
  }
});

// ───────────────────────────────────────────────────────────
// POST /users/match  { emails: string[] }
// Match phone-book emails against registered Synapmsg users.
// ───────────────────────────────────────────────────────────
router.post('/match', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const raw = (req.body ?? {}) as { emails?: unknown };
    if (!Array.isArray(raw.emails)) {
      res.status(400).json({ error: 'emails must be an array' });
      return;
    }
    const emails = Array.from(
      new Set(
        raw.emails
          .filter((e): e is string => typeof e === 'string')
          .map((e) => e.trim().toLowerCase())
          .filter((e) => e.includes('@')),
      ),
    ).slice(0, 500);

    if (emails.length === 0) {
      res.json({ users: [] });
      return;
    }

    // Chunk to keep Postgres IN lists reasonable.
    const matched = new Map<string, ReturnType<typeof serializeUser>>();
    for (let i = 0; i < emails.length; i += 100) {
      const chunk = emails.slice(i, i + 100);
      const users = await prisma.user.findMany({
        where: {
          AND: [
            { id: { not: req.user!.id } },
            { email: { in: chunk } },
          ],
        },
        take: 100,
      });
      users.forEach((u) => matched.set(u.id, serializeUser(u)));
    }

    res.json({ users: Array.from(matched.values()) });
  } catch (err) {
    next(err);
  }
});

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

    // Private Number: exact 10-digit match only (no public directory scrape).
    if (looksLikePrivateNumber(q)) {
      const hit = await prisma.user.findFirst({
        where: {
          privateNumber: digitsOnly(q),
          id: { not: req.user!.id },
        },
      });
      res.json({ users: hit ? [serializeUser(hit)] : [] });
      return;
    }

    // Username / email / name — intentional share; not a public phone book.
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
    const { name, preferredLanguage, preferredTranslateMode, pushToken } = (req.body ?? {}) as {
      name?: unknown;
      preferredLanguage?: unknown;
      preferredTranslateMode?: unknown;
      pushToken?: unknown;
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
    if (typeof pushToken === 'string') {
      data.pushToken = pushToken.trim() || null;
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
