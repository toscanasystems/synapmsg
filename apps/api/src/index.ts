import 'dotenv/config';
import http from 'http';
import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { prisma } from './lib/prisma';
import authRouter from './auth/routes';
import usersRouter from './users/routes';
import chatsRouter from './chats/routes';
import messagesRouter from './messages/routes';
import { attachWebSocketServer } from './messages/websocket';

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
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Trust the first proxy (so req.ip / X-Forwarded-* work behind Supabase / nginx)
app.set('trust proxy', 1);

// Request logging (lightweight, dev-only)
if (NODE_ENV !== 'test') {
  app.use((req: Request, _res: Response, next: NextFunction) => {
    // eslint-disable-next-line no-console
    console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
    next();
  });
}

// ───────────────────────────────────────────────────────────
// Health check
// ───────────────────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'synapmsg-api', time: new Date().toISOString() });
});

// ───────────────────────────────────────────────────────────
// Routes
// ───────────────────────────────────────────────────────────
app.use('/auth', authRouter);
app.use('/users', usersRouter);
app.use('/chats', chatsRouter);
// Messages router handles /chats/:chatId/messages (mounted alongside chats router)
app.use('/chats', messagesRouter);

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

  // eslint-disable-next-line no-console
  console.error('[unhandled error]', err);
  const status = (err as Error & { status?: number }).status ?? 500;
  const message =
    NODE_ENV === 'production' && status >= 500
      ? 'Internal server error'
      : err.message || 'Internal server error';
  res.status(status).json({ error: message });
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
  });
}

// Graceful shutdown
let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  // eslint-disable-next-line no-console
  console.log(`\n[shutdown] received ${signal}, closing server...`);
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
