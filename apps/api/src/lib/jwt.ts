import jwt, { SignOptions, JwtPayload } from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_SECRET: string = process.env.JWT_SECRET || 'dev-insecure-secret-change-me';
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
