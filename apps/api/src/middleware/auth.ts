import { Request, Response, NextFunction } from 'express';
import { verifyToken, AuthTokenPayload } from '../lib/jwt';
import { prisma } from '../lib/prisma';

// Augment Express Request with the authenticated user payload
declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthTokenPayload & {
      id: string;
    };
  }
}

/**
 * Extracts the JWT from `Authorization: Bearer <token>` and attaches
 * the decoded payload to `req.user`.
 *
 * Rejects the request with 401 if the token is missing, malformed,
 * or expired.
 */
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or malformed Authorization header' });
      return;
    }

    const token = header.slice('Bearer '.length).trim();
    let payload: AuthTokenPayload;
    try {
      payload = verifyToken(token);
    } catch (err) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    if (!payload.sub) {
      res.status(401).json({ error: 'Invalid token payload' });
      return;
    }

    // Optionally verify the user still exists. We do a lightweight check
    // (only id) so this is cheap even on hot paths.
    const userExists = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true },
    });
    if (!userExists) {
      res.status(401).json({ error: 'User no longer exists' });
      return;
    }

    req.user = {
      ...payload,
      id: payload.sub,
    };
    // Heartbeat for inactivity switch — skip dms/check so the check itself
    // does not reset the idle timer mid-evaluation.
    const url = `${req.baseUrl || ''}${req.path || ''}${req.originalUrl || ''}`;
    const skipHeartbeat = url.includes('/dms/check');
    if (!skipHeartbeat) {
      void prisma.user
        .update({
          where: { id: payload.sub },
          data: { lastActiveAt: new Date() },
        })
        .catch(() => undefined);
    }
    next();
  } catch (err) {
    next(err);
  }
}
