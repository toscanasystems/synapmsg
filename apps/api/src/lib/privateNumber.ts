/**
 * Synapmsg Private Number — Zangi-style 10-digit identity (not a real SIM).
 * Format display: XX-XXXX-XXXX
 */

import { randomInt } from 'crypto';
import { prisma } from './prisma';

export function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, '');
}

export function formatPrivateNumber(digits: string): string {
  const d = digitsOnly(digits).padStart(10, '0').slice(0, 10);
  return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6, 10)}`;
}

export function looksLikePrivateNumber(raw: string): boolean {
  const d = digitsOnly(raw);
  return d.length === 10;
}

async function randomCandidate(): Promise<string> {
  // 10 digits, avoid leading zeros-only look: 10..99 for first pair
  let n = '';
  for (let i = 0; i < 10; i++) n += String(randomInt(0, 10));
  if (n === '0000000000') return randomCandidate();
  return n;
}

/** Allocate a unique 10-digit Private Number. */
export async function allocatePrivateNumber(): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const candidate = await randomCandidate();
    const clash = await prisma.user.findFirst({
      where: { privateNumber: candidate },
      select: { id: true },
    });
    if (!clash) return candidate;
  }
  throw new Error('Could not allocate private number');
}

/** Ensure user has a Private Number; returns digits. */
export async function ensurePrivateNumber(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { privateNumber: true },
  });
  if (user?.privateNumber) return user.privateNumber;
  const privateNumber = await allocatePrivateNumber();
  await prisma.user.update({
    where: { id: userId },
    data: { privateNumber },
  });
  return privateNumber;
}
