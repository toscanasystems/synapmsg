/**
 * Account recovery passphrase — 12 chars, shown once at signup.
 * Server stores argon2 hash only.
 *
 * Alphabet excludes lookalikes: O/0, I/l/1.
 * Alphabet: 23456789ABCDEFGHJKLMNPQRSTUVWXYZ (32 chars)
 * Combinations: 32^12 = 1_152_921_504_606_846_976
 */

import { randomInt } from 'crypto';
import argon2 from 'argon2';

/** No O, 0, I, l, 1 — readable on paper. */
export const RECOVERY_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const RECOVERY_CODE_LENGTH = 12;
export const RECOVERY_COMBINATIONS = 32n ** 12n; // 1_152_921_504_606_846_976

export function generateRecoveryCode(): string {
  let out = '';
  for (let i = 0; i < RECOVERY_CODE_LENGTH; i++) {
    out += RECOVERY_ALPHABET[randomInt(0, RECOVERY_ALPHABET.length)]!;
  }
  return out;
}

/** Normalize user input: strip spaces/dashes, uppercase. */
export function normalizeRecoveryCode(raw: string): string {
  return raw.replace(/[\s\-]/g, '').toUpperCase();
}

export function isValidRecoveryCodeFormat(raw: string): boolean {
  const n = normalizeRecoveryCode(raw);
  if (n.length !== RECOVERY_CODE_LENGTH) return false;
  for (const ch of n) {
    if (!RECOVERY_ALPHABET.includes(ch)) return false;
  }
  return true;
}

export async function hashRecoveryCode(plain: string): Promise<string> {
  return argon2.hash(normalizeRecoveryCode(plain));
}

export async function verifyRecoveryCode(
  plain: string,
  hash: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, normalizeRecoveryCode(plain));
  } catch {
    return false;
  }
}
