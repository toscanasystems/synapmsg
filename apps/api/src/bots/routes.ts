/**
 * Bot API (Fase 5) — Telegram-inspired, cloud chats only.
 * Mounted at /bots
 */

import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import argon2 from 'argon2';
import { prisma } from '../lib/prisma';
import { authMiddleware } from '../middleware/auth';
import {
  createAndBroadcastMessage,
  HttpError,
} from '../messages/websocket';

const router = Router();

function newBotToken(): string {
  return `synbot_${crypto.randomBytes(24).toString('hex')}`;
}

async function resolveBotByToken(token: string) {
  if (!token || !token.startsWith('synbot_')) return null;
  return prisma.bot.findUnique({
    where: { token },
    include: { botUser: { select: { id: true, username: true, name: true } } },
  });
}

const CAPABILITIES = {
  protocol: 'synapmsg-bot-v1',
  status: 'live',
  base: 'https://api.synapmsg.ai',
  endpoints: [
    {
      method: 'POST',
      path: '/bots',
      auth: 'Bearer JWT de usuario',
      body: { username: 'soporte', name: 'Bot Soporte' },
      desc: 'Crea un bot. Devuelve token synbot_… (guardalo).',
    },
    {
      method: 'GET',
      path: '/bots/me',
      auth: 'Bearer JWT de usuario',
      desc: 'Lista tus bots y tokens.',
    },
    {
      method: 'POST',
      path: '/bots/:token/sendMessage',
      auth: 'token en URL',
      body: { chat_id: 'uuid', text: 'Hola' },
      altBody: { user_id: 'uuid', text: 'Hola' },
      desc: 'Envía un mensaje (solo chats cloud).',
    },
    {
      method: 'GET',
      path: '/bots/:token/getUpdates?offset=0&limit=50',
      auth: 'token en URL',
      desc: 'Lee mensajes entrantes al bot.',
    },
    {
      method: 'POST',
      path: '/bots/:token/setWebhook',
      auth: 'token en URL',
      body: { url: 'https://tu-servidor.com/hook' },
      desc: 'Webhook HTTPS (vacío para borrar).',
    },
  ],
  rules: [
    'Solo chats cloud — nunca plaintext de chats E2E.',
    'El token synbot_ es el secreto del bot; no lo compartas.',
    'Creá el bot desde la app: Herramientas → Crear bot.',
  ],
} as const;

function capabilitiesHtml(): string {
  const rows = CAPABILITIES.endpoints
    .map(
      (e) => `<tr>
      <td><code>${e.method}</code></td>
      <td><code>${e.path}</code></td>
      <td>${e.auth}</td>
      <td>${e.desc}</td>
    </tr>`,
    )
    .join('');
  const rules = CAPABILITIES.rules.map((r) => `<li>${r}</li>`).join('');
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Synap Bot API</title>
  <style>
    :root { color-scheme: dark; }
    body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 0; background: #0b1214; color: #e8f0f0; }
    main { max-width: 900px; margin: 0 auto; padding: 32px 20px 64px; }
    h1 { color: #30B0B0; margin: 0 0 8px; font-size: 1.75rem; }
    .sub { color: #9db0b0; margin-bottom: 28px; }
    .badge { display: inline-block; background: #30B0B033; color: #30B0B0; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px; }
    th, td { text-align: left; padding: 12px 10px; border-bottom: 1px solid #1e2a2c; vertical-align: top; }
    th { color: #30B0B0; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
    code { background: #142022; padding: 2px 6px; border-radius: 6px; font-size: 12px; }
    ul { line-height: 1.6; color: #c5d4d4; }
    a { color: #30B0B0; }
    pre { background: #142022; padding: 14px; border-radius: 12px; overflow: auto; font-size: 12px; }
  </style>
</head>
<body>
  <main>
    <span class="badge">${CAPABILITIES.protocol} · ${CAPABILITIES.status}</span>
    <h1>Synap Bot API</h1>
    <p class="sub">API estilo Telegram para bots. Base: <code>${CAPABILITIES.base}</code></p>
    <table>
      <thead><tr><th>Método</th><th>Ruta</th><th>Auth</th><th>Qué hace</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <h2>Reglas</h2>
    <ul>${rules}</ul>
    <h2>Ejemplo sendMessage</h2>
    <pre>curl -X POST ${CAPABILITIES.base}/bots/synbot_TOKEN/sendMessage \\
  -H "Content-Type: application/json" \\
  -d '{"user_id":"UUID_DESTINO","text":"Hola desde el bot"}'</pre>
    <p class="sub">JSON máquina: <a href="/bots/capabilities.json">/bots/capabilities.json</a></p>
  </main>
</body>
</html>`;
}

router.get('/capabilities.json', (_req: Request, res: Response) => {
  res.json(CAPABILITIES);
});

router.get('/capabilities', (req: Request, res: Response) => {
  const accept = String(req.headers.accept || '');
  const wantsJson =
    req.query.format === 'json' ||
    (accept.includes('application/json') && !accept.includes('text/html'));
  if (wantsJson) {
    res.json(CAPABILITIES);
    return;
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(capabilitiesHtml());
});

router.post('/', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = (req.body ?? {}) as { username?: unknown; name?: unknown };
    const rawUser =
      typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
    const name =
      typeof body.name === 'string' && body.name.trim()
        ? body.name.trim().slice(0, 64)
        : 'Synap Bot';

    if (!/^[a-z][a-z0-9_]{2,31}$/.test(rawUser)) {
      res.status(400).json({
        error: 'username: 3–32 chars, lowercase letters/digits/_; must start with letter',
      });
      return;
    }
    const username = rawUser.endsWith('bot') ? rawUser : `${rawUser}_bot`;

    const exists = await prisma.user.findUnique({ where: { username } });
    if (exists) {
      res.status(409).json({ error: 'Bot username already taken' });
      return;
    }

    const token = newBotToken();
    const passwordHash = await argon2.hash(crypto.randomBytes(32).toString('hex'));
    const email = `bot+${crypto.randomBytes(8).toString('hex')}@bots.synapmsg.internal`;

    const bot = await prisma.$transaction(async (tx) => {
      const botUser = await tx.user.create({
        data: {
          email,
          username,
          name,
          passwordHash,
          preferredLanguage: 'en',
          preferredTranslateMode: 'cloud',
        },
      });
      return tx.bot.create({
        data: {
          ownerId: req.user!.id,
          botUserId: botUser.id,
          token,
          username,
          name,
        },
      });
    });

    res.status(201).json({
      bot: {
        id: bot.id,
        username: bot.username,
        name: bot.name,
        token: bot.token,
        botUserId: bot.botUserId,
      },
      hint: 'Guarda el token. Se usa en /bots/:token/sendMessage y getUpdates.',
    });
  } catch (err) {
    next(err);
  }
});

router.get('/me', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bots = await prisma.bot.findMany({
      where: { ownerId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        username: true,
        name: true,
        token: true,
        webhookUrl: true,
        botUserId: true,
        createdAt: true,
      },
    });
    res.json({ bots });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/:token/sendMessage',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const bot = await resolveBotByToken(req.params.token || '');
      if (!bot) {
        res.status(401).json({ error: 'Invalid bot token' });
        return;
      }

      const body = (req.body ?? {}) as {
        chat_id?: unknown;
        user_id?: unknown;
        text?: unknown;
      };
      const text = typeof body.text === 'string' ? body.text.trim() : '';
      if (!text) {
        res.status(400).json({ error: 'text is required' });
        return;
      }

      let chatId =
        typeof body.chat_id === 'string' ? body.chat_id.trim() : '';

      if (!chatId && typeof body.user_id === 'string' && body.user_id.trim()) {
        const userId = body.user_id.trim();
        const existing = await prisma.chat.findFirst({
          where: {
            type: 'single',
            encryptionMode: 'cloud',
            AND: [
              { participants: { some: { userId: bot.botUserId } } },
              { participants: { some: { userId } } },
            ],
          },
          select: { id: true },
        });
        if (existing) {
          chatId = existing.id;
        } else {
          const created = await prisma.chat.create({
            data: {
              type: 'single',
              encryptionMode: 'cloud',
              participants: {
                create: [
                  { userId: bot.botUserId, role: 'member' },
                  { userId, role: 'member' },
                ],
              },
            },
          });
          chatId = created.id;
        }
      }

      if (!chatId) {
        res.status(400).json({ error: 'chat_id or user_id is required' });
        return;
      }

      const chat = await prisma.chat.findUnique({
        where: { id: chatId },
        select: { id: true, encryptionMode: true },
      });
      if (!chat) {
        res.status(404).json({ error: 'Chat not found' });
        return;
      }
      if (chat.encryptionMode === 'e2e') {
        res.status(400).json({
          error: 'Bots cannot send into E2E chats (no plaintext on server)',
          code: 'bot_e2e_forbidden',
        });
        return;
      }

      const member = await prisma.chatParticipant.findUnique({
        where: {
          chatId_userId: { chatId, userId: bot.botUserId },
        },
      });
      if (!member) {
        // Allow owner to invite bot into their cloud chats by first message path:
        // only auto-join if owner is in the chat.
        const ownerInChat = await prisma.chatParticipant.findUnique({
          where: {
            chatId_userId: { chatId, userId: bot.ownerId },
          },
        });
        if (!ownerInChat) {
          res.status(403).json({ error: 'Bot is not a participant of this chat' });
          return;
        }
        await prisma.chatParticipant.create({
          data: { chatId, userId: bot.botUserId, role: 'member' },
        });
      }

      const { message } = await createAndBroadcastMessage(
        chatId,
        bot.botUserId,
        text,
      );
      res.json({ ok: true, message });
    } catch (err) {
      if (err instanceof HttpError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      next(err);
    }
  },
);

router.get(
  '/:token/getUpdates',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const bot = await resolveBotByToken(req.params.token || '');
      if (!bot) {
        res.status(401).json({ error: 'Invalid bot token' });
        return;
      }
      const offset = Math.max(0, Number(req.query.offset ?? 0) || 0);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50) || 50));

      const rows = await prisma.botUpdate.findMany({
        where: {
          botId: bot.id,
          updateId: { gt: offset },
        },
        orderBy: { updateId: 'asc' },
        take: limit,
      });

      res.json({
        ok: true,
        result: rows.map((r) => JSON.parse(r.payloadJson) as unknown),
      });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/:token/setWebhook',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const bot = await resolveBotByToken(req.params.token || '');
      if (!bot) {
        res.status(401).json({ error: 'Invalid bot token' });
        return;
      }
      const url =
        typeof (req.body as { url?: unknown })?.url === 'string'
          ? String((req.body as { url: string }).url).trim()
          : '';
      if (url && !/^https:\/\//i.test(url)) {
        res.status(400).json({ error: 'url must be https:// or empty to clear' });
        return;
      }
      const updated = await prisma.bot.update({
        where: { id: bot.id },
        data: { webhookUrl: url || null },
      });
      res.json({ ok: true, webhookUrl: updated.webhookUrl });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
