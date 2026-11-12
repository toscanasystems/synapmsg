import nacl from 'tweetnacl';
import { createHash } from 'crypto';

const NODE_ENV = process.env.NODE_ENV || 'development';

function seedFromEnv(): Uint8Array {
  const wipe = (process.env.WIPE_SIGNING_SEED || '').trim();
  const jwt = (process.env.JWT_SECRET || '').trim();
  if (NODE_ENV === 'production') {
    if (!wipe || wipe.length < 32 || wipe === 'dev-wipe') {
      throw new Error(
        '[fatal] WIPE_SIGNING_SEED missing/weak in production (min 32 chars, dedicated seed)',
      );
    }
    if (jwt && wipe === jwt) {
      throw new Error(
        '[fatal] WIPE_SIGNING_SEED must differ from JWT_SECRET in production',
      );
    }
  }
  const material = wipe || jwt || 'dev-wipe';
  return createHash('sha256').update(material).digest();
}

function keyPair() {
  return nacl.sign.keyPair.fromSeed(seedFromEnv());
}

export function wipePublicKeyB64(): string {
  return Buffer.from(keyPair().publicKey).toString('base64');
}

export function signWipePayload(payload: object): string {
  const msg = Buffer.from(JSON.stringify(payload), 'utf8');
  const sig = nacl.sign.detached(msg, keyPair().secretKey);
  return Buffer.from(sig).toString('base64');
}

export function verifyWipePayload(payload: object, sigB64: string): boolean {
  try {
    const msg = Buffer.from(JSON.stringify(payload), 'utf8');
    const sig = Buffer.from(sigB64, 'base64');
    return nacl.sign.detached.verify(msg, sig, keyPair().publicKey);
  } catch {
    return false;
  }
}
