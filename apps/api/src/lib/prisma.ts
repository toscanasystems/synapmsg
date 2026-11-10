import { PrismaClient } from '@prisma/client';

/**
 * Prisma client singleton.
 *
 * In development, Next.js / ts-node can hot-reload and create multiple
 * PrismaClient instances, exhausting DB connections. We cache the client
 * on the global object to prevent this.
 */
declare global {
  // eslint-disable-next-line no-var
  var __prismaClient: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  global.__prismaClient ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  global.__prismaClient = prisma;
}
