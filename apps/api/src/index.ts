import 'dotenv/config';
import http from 'http';
import path from 'path';
import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { prisma } from './lib/prisma';
import authRouter from './auth/routes';
import usersRouter from './users/routes';
import chatsRouter from './chats/routes';
import messagesRouter from './messages/routes';
import mediaRouter from './media/routes';
import billingRouter from './billing/routes';
import e2eRouter from './e2e/routes';
import securityRouter from './security/routes';
import botsRouter from './bots/routes';
import walletRouter from './wallet/routes';
import { stripeWebhookHandler } from './billing/webhook';
import { recurrenteWebhookHandler } from './billing/recurrenteWebhook';
import { PlanLimitError } from './billing/usage';
import { attachWebSocketServer } from './messages/websocket';
import { startMessageScheduler, stopMessageScheduler } from './messages/scheduler';
import {
  startExpireScheduler,
  stopExpireScheduler,
} from './messages/expireScheduler';
import { startDmsScheduler, stopDmsScheduler } from './security/dmsScheduler';
import { getCallConfig } from './calls/config';
import { mintTurnIceServers } from './calls/turnCredentials';
import callsRouter from './calls/routes';
import pollsRouter from './polls/routes';
import { authMiddleware } from './middleware/auth';

const PORT = Number(process.env.PORT) || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

const app = express();

// ───────────────────────────────────────────────────────────
// Security & parsing middleware
// ───────────────────────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
      : '*',
    credentials: true,
  })
);
// Force UTF-8 on every JSON response (fixes broken accents/tildes on clients).
app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return originalJson(body);
  }) as typeof res.json;
  next();
});

// Payment webhooks need the raw body for signature verification — before JSON parser.
app.post(
  '/billing/webhook',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    void stripeWebhookHandler(req, res);
  },
);
app.post(
  '/billing/webhook/recurrente',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    void recurrenteWebhookHandler(req, res);
  },
);

// Base64 media uploads ≈ 4/3 of file size; free plan allows 25 MB files.
app.use(express.json({ limit: '40mb' }));
app.use(express.urlencoded({ extended: true }));

// Trust the first proxy (so req.ip / X-Forwarded-* work behind Supabase / nginx)
app.set('trust proxy', 1);

// Request logging — redact secrets in query/path
if (NODE_ENV !== 'test') {
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const safe = req.url
      .replace(/([?&]token=)[^&]*/gi, '$1[REDACTED]')
      .replace(/\/bots\/synbot_[^/?#]+/gi, '/bots/synbot_[REDACTED]');
    // eslint-disable-next-line no-console
    console.log(`${new Date().toISOString()} ${req.method} ${safe}`);
    next();
  });
}

// ───────────────────────────────────────────────────────────
// Health check
// ───────────────────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'synapmsg-api', time: new Date().toISOString() });
});

// FIDO2 HTML pages need inline JS (navigator.credentials). Helmet's default CSP
// blocks them — relax only under /security/*.html helpers.
app.use('/security', (req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'self'",
  );
  next();
});
app.use('/security', express.static(path.join(__dirname, '..', 'public', 'security')));

// Call media: P2P WebRTC (DTLS-SRTP). Signaling on Synap WS.
// Public: STUN only. Authenticated: short-lived TURN + iceTransportPolicy.
// Default policy=relay so peer public IPs are not exchanged (strangers).
app.get('/call/config', (req: Request, res: Response, next: NextFunction) => {
  const base = getCallConfig();
  const auth = req.headers.authorization;
  const wantDirect =
    String(req.query.allowDirect || '') === '1' ||
    String(req.query.allowDirect || '').toLowerCase() === 'true';
  // Trusted-direct only when explicitly enabled on the server (mutual trust UI later).
  const allowDirect =
    wantDirect && process.env.SYNAP_CALL_ALLOW_DIRECT === '1';

  if (auth?.startsWith('Bearer ')) {
    void authMiddleware(req, res, (err?: unknown) => {
      if (err) {
        next(err);
        return;
      }
      if (!req.user) {
        res.json({ ...base, provider: 'none' });
        return;
      }
      void mintTurnIceServers({ allowDirect })
        .then((mint) => {
          res.json({
            ...base,
            iceServers: mint.iceServers,
            iceTransportPolicy: mint.iceTransportPolicy,
            provider: mint.provider,
            ttlSec: mint.ttlSec,
            note:
              mint.iceTransportPolicy === 'relay'
                ? 'TURN relay (encrypted). Peer IP hidden. Server cannot decrypt SRTP.'
                : 'Direct ICE allowed (trusted). Prefer relay for strangers.',
          });
        })
        .catch((e) => next(e));
    });
    return;
  }
  res.json({ ...base, provider: 'none' });
});

app.get('/call', (req: Request, res: Response) => {
  const cfg = getCallConfig();
  const engineParam = String(req.query.engine || '');
  const engine =
    engineParam === 'webrtc' || engineParam === 'jitsi'
      ? engineParam
      : cfg.engine;
  const isJitsi = engine === 'jitsi';
  const jitsiHost = String(req.query.jitsi || cfg.jitsiDomain).replace(
    /^https?:\/\//,
    '',
  );
  if (isJitsi) {
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self' https:",
        `script-src 'self' 'unsafe-inline' https://${jitsiHost} https://*.jitsi.net https://*.jit.si`,
        "style-src 'self' 'unsafe-inline' https:",
        `frame-src https://${jitsiHost} https://*.jitsi.net https://*.jit.si blob:`,
        "media-src 'self' blob: mediastream: https:",
        "connect-src 'self' wss: ws: https: stun: turn:",
        "img-src 'self' data: blob: https:",
      ].join('; '),
    );
  } else {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; media-src 'self' blob: mediastream:; connect-src 'self' wss: ws: https: stun: turn:; img-src 'self' data: blob:;",
    );
  }
  res.setHeader(
    'Permissions-Policy',
    'camera=(self), microphone=(self), display-capture=(self)',
  );
  // Call HTML must not stick in WebView cache — airplane rejoin depends on latest mesh JS.
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  // Allow Jitsi iframe / WebRTC in WebView (helmet CORP can block third-party media).
  res.removeHeader('Cross-Origin-Resource-Policy');
  res.removeHeader('Cross-Origin-Embedder-Policy');
  // Pieza 4: group voice mesh page (no SFU / no mixer).
  const isGroupCall = String(req.query.group || '') === '1' && !isJitsi;
  res.sendFile(
    path.join(
      __dirname,
      '..',
      'public',
      isJitsi ? 'call-jitsi.html' : isGroupCall ? 'call-group.html' : 'call.html',
    ),
  );
});

// ───────────────────────────────────────────────────────────
// Routes
// ───────────────────────────────────────────────────────────
app.use('/auth', authRouter);
app.use('/users', usersRouter);
app.use('/media', mediaRouter);
app.use('/billing', billingRouter);
app.use('/e2e', e2eRouter);
app.use('/security', securityRouter);
app.use('/bots', botsRouter);
app.use('/wallet', walletRouter);
app.use('/chats', chatsRouter);
app.use('/chats/:chatId/polls', pollsRouter);
// Messages router handles /chats/:chatId/messages (mounted alongside chats router)
app.use('/chats', messagesRouter);
app.use('/calls', callsRouter);

// ───────────────────────────────────────────────────────────
// 404
// ───────────────────────────────────────────────────────────
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

// ───────────────────────────────────────────────────────────
// Error handler
// ───────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  // Prisma validation errors often surface as P2002 (unique constraint)
  // or P2025 (record not found). Normalize them into clean 4xx responses.
  const anyErr = err as Error & { code?: string };
  if (anyErr.code === 'P2002') {
    res.status(409).json({ error: 'A record with this value already exists' });
    return;
  }
  if (anyErr.code === 'P2025') {
    res.status(404).json({ error: 'Record not found' });
    return;
  }

  if (err instanceof PlanLimitError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }

  const anyStatus = (err as Error & { status?: number; statusCode?: number })
    .status
    ?? (err as Error & { statusCode?: number }).statusCode
    ?? 500;

  // Bad JSON body → clear 400 (not a mysterious 500)
  if (
    anyStatus === 400 ||
    (err instanceof SyntaxError && 'body' in (err as object))
  ) {
    res.status(400).json({
      error: 'Pedido inválido. Revisá los datos e intentá de nuevo.',
      code: 'bad_request',
    });
    return;
  }

  // eslint-disable-next-line no-console
  console.error('[unhandled error]', err);
  const status = anyStatus;
  const message =
    NODE_ENV === 'production' && status >= 500
      ? 'El servidor tuvo un problema. Intentá de nuevo.'
      : err.message || 'El servidor tuvo un problema. Intentá de nuevo.';
  const code = (err as Error & { code?: string }).code;
  res.status(status).json(code ? { error: message, code } : { error: message });
});

// ───────────────────────────────────────────────────────────
// HTTP + WebSocket server
// ───────────────────────────────────────────────────────────
const server = http.createServer(app);
attachWebSocketServer(server);

async function start(): Promise<void> {
  // Verify DB connectivity at boot (fails fast instead of per-request).
  try {
    await prisma.$connect();
    // eslint-disable-next-line no-console
    console.log('[db] connected');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[db] failed to connect:', (err as Error).message);
    process.exit(1);
  }

  server.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`[synapmsg-api] HTTP + WebSocket listening on :${PORT}`);
    // eslint-disable-next-line no-console
    console.log(`  REST:      http://localhost:${PORT}`);
    // eslint-disable-next-line no-console
    console.log(`  WebSocket: ws://localhost:${PORT}/ws?token=JWT`);
    startMessageScheduler();
    startExpireScheduler();
    startDmsScheduler();
  });
}

// Graceful shutdown
let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  // eslint-disable-next-line no-console
  console.log(`\n[shutdown] received ${signal}, closing server...`);
  stopMessageScheduler();
  stopExpireScheduler();
  stopDmsScheduler();
  server.close();
  try {
    await prisma.$disconnect();
    // eslint-disable-next-line no-console
    console.log('[shutdown] db disconnected');
  } catch {
    // ignore
  }
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

// Start the server (top-level await for older ts-node configs)
void start();

export { app, server };
