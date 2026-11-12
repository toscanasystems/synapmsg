import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);

type PreKeyPub = { keyId: number; publicKey: string };

function parsePreKeys(raw: unknown): PreKeyPub[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (p): p is PreKeyPub =>
        typeof p === 'object' &&
        p != null &&
        typeof (p as PreKeyPub).keyId === 'number' &&
        typeof (p as PreKeyPub).publicKey === 'string',
    )
    .slice(0, 100);
}

/**
 * PUT /e2e/devices/:deviceId
 * Upload this device's public bundle (private keys stay on device).
 */
router.put(
  '/devices/:deviceId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const deviceId = String(req.params.deviceId || '').trim().slice(0, 64);
      if (!deviceId) {
        res.status(400).json({ error: 'deviceId required' });
        return;
      }
      const body = (req.body ?? {}) as {
        identityKeyPub?: unknown;
        signedPreKeyPub?: unknown;
        signedPreKeySig?: unknown;
        signedPreKeyId?: unknown;
        registrationId?: unknown;
        preKeys?: unknown;
        pqKemPub?: unknown;
        protocol?: unknown;
      };
      if (
        typeof body.identityKeyPub !== 'string' ||
        !body.identityKeyPub.trim() ||
        typeof body.signedPreKeyPub !== 'string' ||
        !body.signedPreKeyPub.trim()
      ) {
        res.status(400).json({ error: 'identityKeyPub and signedPreKeyPub required' });
        return;
      }
      const signedPreKeyId =
        typeof body.signedPreKeyId === 'number' && body.signedPreKeyId > 0
          ? Math.floor(body.signedPreKeyId)
          : 1;
      const registrationId =
        typeof body.registrationId === 'number' && body.registrationId > 0
          ? Math.floor(body.registrationId) % 16384
          : Math.floor(Math.random() * 16384);
      const preKeys = parsePreKeys(body.preKeys);
      const pqKemPub =
        typeof body.pqKemPub === 'string' && body.pqKemPub.trim()
          ? body.pqKemPub.trim()
          : null;
      const signedPreKeySig =
        typeof body.signedPreKeySig === 'string' ? body.signedPreKeySig.trim() : '';
      const protocol =
        typeof body.protocol === 'string' && body.protocol.trim()
          ? body.protocol.trim().slice(0, 32)
          : 'libsignal';

      const row = await prisma.deviceIdentity.upsert({
        where: {
          userId_deviceId: { userId: req.user!.id, deviceId },
        },
        create: {
          userId: req.user!.id,
          deviceId,
          identityKeyPub: body.identityKeyPub.trim(),
          signedPreKeyPub: body.signedPreKeyPub.trim(),
          signedPreKeySig,
          signedPreKeyId,
          registrationId,
          preKeysJson: JSON.stringify(preKeys),
          pqKemPub,
          protocol,
        },
        update: {
          identityKeyPub: body.identityKeyPub.trim(),
          signedPreKeyPub: body.signedPreKeyPub.trim(),
          signedPreKeySig,
          signedPreKeyId,
          registrationId,
          preKeysJson: JSON.stringify(preKeys),
          pqKemPub,
          protocol,
        },
      });

      res.json({
        ok: true,
        device: {
          deviceId: row.deviceId,
          identityKeyPub: row.identityKeyPub,
          signedPreKeyPub: row.signedPreKeyPub,
          signedPreKeySig: row.signedPreKeySig,
          signedPreKeyId: row.signedPreKeyId,
          registrationId: row.registrationId,
          pqKemPub: row.pqKemPub,
          preKeyCount: preKeys.length,
          protocol: row.protocol,
          updatedAt: row.updatedAt.toISOString(),
        },
        protocol: row.protocol,
        note:
          row.protocol === 'libsignal'
            ? 'Signal Protocol (libsignal). Server stores public keys only.'
            : 'Legacy protocol flagged; clients should prefer libsignal for new chats.',
      });
    } catch (err) {
      next(err);
    }
  },
);

/** GET /e2e/devices — my registered devices (public material only) */
router.get('/devices', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await prisma.deviceIdentity.findMany({
      where: { userId: req.user!.id },
      orderBy: { updatedAt: 'desc' },
    });
    res.json({
      devices: rows.map((r) => ({
        deviceId: r.deviceId,
        identityKeyPub: r.identityKeyPub,
        signedPreKeyPub: r.signedPreKeyPub,
        signedPreKeyId: r.signedPreKeyId,
        registrationId: r.registrationId,
        preKeyCount: (JSON.parse(r.preKeysJson || '[]') as unknown[]).length,
        updatedAt: r.updatedAt.toISOString(),
      })),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /e2e/users/:userId/bundle
 * Fetch a peer's newest device bundle to start a session (future libsignal).
 */
router.get(
  '/users/:userId/bundle',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.params.userId;
      if (!userId) {
        res.status(400).json({ error: 'userId required' });
        return;
      }
      const row = await prisma.deviceIdentity.findFirst({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
      });
      if (!row) {
        res.status(404).json({
          error: 'No E2E device registered',
          code: 'no_e2e_device',
        });
        return;
      }
      const preKeys = JSON.parse(row.preKeysJson || '[]') as PreKeyPub[];
      const consume = String(req.query.consume ?? '') === '1';
      let oneTime: PreKeyPub | null = null;
      if (consume && preKeys[0]) {
        oneTime = preKeys[0];
        const rest = preKeys.slice(1);
        await prisma.deviceIdentity.update({
          where: { id: row.id },
          data: { preKeysJson: JSON.stringify(rest) },
        });
      }
      const lastKtl = await prisma.keyTransparencyEntry.findFirst({
        where: { userId },
        orderBy: { seq: 'desc' },
      });
      const keyChanged = Boolean(
        lastKtl && lastKtl.identityKeyPub !== row.identityKeyPub,
      );
      res.json({
        userId,
        deviceId: row.deviceId,
        registrationId: row.registrationId,
        identityKey: row.identityKeyPub,
        signedPreKey: {
          keyId: row.signedPreKeyId,
          publicKey: row.signedPreKeyPub,
          signature: row.signedPreKeySig || undefined,
        },
        oneTimePreKey: oneTime,
        pqKemPub: row.pqKemPub,
        protocol: row.protocol || 'libsignal',
        pqHybrid: Boolean(row.pqKemPub),
        keyChanged,
        ktlSeq: lastKtl?.seq ?? null,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /e2e/chats/:chatId/mode  { mode: "cloud" | "e2e" }
 * Flag only — ciphertext path not enforced yet.
 */
router.patch(
  '/chats/:chatId/mode',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const chatId = req.params.chatId;
      const mode = (req.body ?? {}).mode;
      if (mode !== 'cloud' && mode !== 'e2e') {
        res.status(400).json({ error: 'mode must be cloud or e2e' });
        return;
      }
      const membership = await prisma.chatParticipant.findUnique({
        where: {
          chatId_userId: { chatId: chatId!, userId: req.user!.id },
        },
      });
      if (!membership) {
        res.status(403).json({ error: 'Not a participant' });
        return;
      }
      if (mode === 'e2e') {
        const devices = await prisma.deviceIdentity.count({
          where: { userId: req.user!.id },
        });
        if (devices === 0) {
          res.status(400).json({
            error: 'Registra un dispositivo E2E antes de activar el modo',
            code: 'no_e2e_device',
          });
          return;
        }
      }
      const chat = await prisma.chat.update({
        where: { id: chatId },
        data: { encryptionMode: mode },
      });
      res.json({
        chatId: chat.id,
        encryptionMode: chat.encryptionMode,
        note:
          mode === 'e2e'
            ? 'Modo Privado: el servidor solo acepta ciphertext (libsignal)'
            : 'Modo nube (traducción cloud + almacenamiento servidor)',
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
