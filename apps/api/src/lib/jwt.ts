import jwt, { SignOptions, JwtPayload } from 'jsonwebtoken';
import crypto from 'crypto';

const NODE_ENV = process.env.NODE_ENV || 'development';
const rawJwt = (process.env.JWT_SECRET || '').trim();
if (
  NODE_ENV === 'production' &&
  (!rawJwt || rawJwt.length < 32 || rawJwt === 'dev-insecure-secret-change-me')
) {
  throw new Error(
    '[fatal] JWT_SECRET missing/weak in production (min 32 chars, no default)',
  );
}
const JWT_SECRET: string = rawJwt || 'dev-insecure-secret-change-me';
const JWT_EXPIRES_IN: string = process.env.JWT_EXPIRES_IN || '7d';

export interface AuthTokenPayload extends JwtPayload {
  sub: string; // user id
  email: string;
  username: string;
}

/**
 * Sign a JWT for the given user.
 */
export function signToken(user: { id: string; email: string; username: string }): string {
  const payload: AuthTokenPayload = {
    sub: user.id,
    email: user.email,
    username: user.username,
    // explicit iat so tests are deterministic
    iat: Math.floor(Date.now() / 1000),
  };

  const options: SignOptions = {
    expiresIn: JWT_EXPIRES_IN as any,
    issuer: 'synapmsg',
    audience: 'synapmsg-client',
  };

  return jwt.sign(payload, JWT_SECRET, options);
}

/** Short-lived ticket after password OK but before FIDO2/recovery. */
export function signLoginTicket(userId: string): string {
  return jwt.sign(
    { sub: userId, purpose: 'login_pending' },
    JWT_SECRET,
    { expiresIn: '10m', issuer: 'synapmsg', audience: 'synapmsg-login' },
  );
}

export function verifyLoginTicket(ticket: string): { sub: string } {
  const decoded = jwt.verify(ticket, JWT_SECRET, {
    issuer: 'synapmsg',
    audience: 'synapmsg-login',
  }) as JwtPayload & { purpose?: string };
  if (decoded.purpose !== 'login_pending' || typeof decoded.sub !== 'string') {
    throw new Error('Invalid login ticket');
  }
  return { sub: decoded.sub };
}

/**
 * Verify a JWT and return its typed payload.
 * Throws jwt.JsonWebTokenError / TokenExpiredError if invalid.
 */
export function verifyToken(token: string): AuthTokenPayload {
  const decoded = jwt.verify(token, JWT_SECRET, {
    issuer: 'synapmsg',
    audience: 'synapmsg-client',
  }) as AuthTokenPayload;

  return decoded;
}

/**
 * Generate a secure random opaque token (e.g. for refresh tokens / sessions).
 */
export function generateOpaqueToken(byteLength = 32): string {
  return crypto.randomBytes(byteLength).toString('hex');
}
