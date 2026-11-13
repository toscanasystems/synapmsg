/**
 * Synapmsg Private Number — 10-digit find-me name (not a phone / SIM).
 * Display: XX-XXXX-XXXX
 */

import { randomInt } from 'crypto';
import { prisma } from './prisma';

export function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, '');
}

export function formatPrivateNumber(digits: string): string {
  const d = digitsOnly(digits).slice(0, 10);
  if (d.length !== 10) return d;
  return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6, 10)}`;
}

export function looksLikePrivateNumber(raw: string): boolean {
  const d = digitsOnly(raw);
  return d.length === 10 && d[0] !== '0';
}

/** 10 digits, must not start with 0. */
export function randomPrivateNumberCandidate(): string {
  let n = String(randomInt(1, 10));
  for (let i = 1; i < 10; i++) n += String(randomInt(0, 10));
  return n;
}

/**
 * Allocate a unique 10-digit Private Number on the server.
 * Checks users + permanent ledger so numbers are never reused.
 * Max 5 attempts on collision (product rule).
 */
export async function allocatePrivateNumber(firstUserId?: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = randomPrivateNumberCandidate();
    const [userClash, ledgerClash] = await Promise.all([
      prisma.user.findFirst({
        where: { privateNumber: candidate },
        select: { id: true },
      }),
      prisma.privateNumberLedger.findUnique({
        where: { privateNumber: candidate },
        select: { privateNumber: true },
      }),
    ]);
    if (userClash || ledgerClash) continue;
    try {
      await prisma.privateNumberLedger.create({
        data: {
          privateNumber: candidate,
          firstUserId: firstUserId ?? null,
        },
      });
      return candidate;
    } catch (err) {
      // Unique race on ledger — try another candidate.
      const code = (err as { code?: string }).code;
      if (code === 'P2002') continue;
      throw err;
    }
  }
  throw new Error('Could not allocate private number after 5 attempts');
}

/** Ensure user has a Private Number; returns digits. */
export async function ensurePrivateNumber(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { privateNumber: true },
  });
  if (user?.privateNumber) return user.privateNumber;
  const privateNumber = await allocatePrivateNumber(userId);
  await prisma.user.update({
    where: { id: userId },
    data: { privateNumber },
  });
  // Bind ledger firstUserId if we reserved without it.
  await prisma.privateNumberLedger.updateMany({
    where: { privateNumber, firstUserId: null },
    data: { firstUserId: userId },
  });
  return privateNumber;
}
