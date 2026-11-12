import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth';
import { isR2Configured, uploadToR2 } from '../lib/r2';
import { prisma } from '../lib/prisma';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  assertMediaUpload,
  getEffectivePlan,
  PlanLimitError,
} from '../billing/usage';

const router = Router();

const LOCAL_UPLOAD_DIR = path.join(process.cwd(), 'uploads');

function ensureUploadDir(): void {
  if (!fs.existsSync(LOCAL_UPLOAD_DIR)) {
    fs.mkdirSync(LOCAL_UPLOAD_DIR, { recursive: true });
  }
}

function extFor(contentType: string): string {
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('gif')) return 'gif';
  if (contentType.includes('pdf')) return 'pdf';
  if (contentType.includes('mpeg') || contentType.includes('mp3')) return 'mp3';
  if (contentType.includes('mp4') || contentType.includes('m4a')) return 'm4a';
  if (contentType.includes('aac')) return 'aac';
  if (contentType.includes('wav')) return 'wav';
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg';
  return 'bin';
}

function mediaKind(contentType: string): 'image' | 'audio' | 'file' {
  if (contentType.startsWith('image/')) return 'image';
  if (contentType.startsWith('audio/')) return 'audio';
  return 'file';
}

/**
 * Public file serve (local fallback when R2 is not configured).
 * GET /media/file/:name
 */
router.get('/file/:name', (req: Request, res: Response) => {
  const name = path.basename(req.params.name || '');
  if (!name || name.includes('..')) {
    res.status(400).json({ error: 'Invalid file' });
    return;
  }
  const full = path.join(LOCAL_UPLOAD_DIR, name);
  if (!fs.existsSync(full)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.sendFile(full);
});

router.use(authMiddleware);

/** GET /media/quota — used/limit for the current user */
router.get('/quota', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const state = await getEffectivePlan(req.user!.id);
    res.json({
      plan: state.planId,
      usedBytes: state.mediaBytesUsed,
      limitBytes: state.limits.mediaQuotaBytes,
      remainingBytes: Math.max(
        0,
        state.limits.mediaQuotaBytes - state.mediaBytesUsed,
      ),
      maxFileBytes: state.limits.maxFileBytes,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /media/upload
 * Body: { contentType: string, dataBase64: string }
 */
router.post('/upload', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { contentType, dataBase64 } = (req.body ?? {}) as {
      contentType?: unknown;
      dataBase64?: unknown;
    };

    if (typeof contentType !== 'string' || !contentType.includes('/')) {
      res.status(400).json({ error: 'contentType is required' });
      return;
    }
    if (typeof dataBase64 !== 'string' || !dataBase64.trim()) {
      res.status(400).json({ error: 'dataBase64 is required' });
      return;
    }

    const cleaned = dataBase64.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(cleaned, 'base64');
    if (!buffer.length) {
      res.status(400).json({ error: 'Invalid base64 data' });
      return;
    }

    const state = await assertMediaUpload(req.user!.id, buffer.length);

    const ext = extFor(contentType);
    const kind = mediaKind(contentType);
    const key = `chat/${req.user!.id}/${Date.now()}-${randomUUID()}.${ext}`;

    let url: string;
    if (isR2Configured()) {
      url = await uploadToR2({ key, body: buffer, contentType });
    } else {
      ensureUploadDir();
      const localName = `${Date.now()}-${randomUUID()}.${ext}`;
      fs.writeFileSync(path.join(LOCAL_UPLOAD_DIR, localName), buffer);
      const base =
        process.env.PUBLIC_API_URL?.replace(/\/$/, '') ||
        `https://api.synapmsg.ai`;
      url = `${base}/media/file/${localName}`;
    }

    const used = state.mediaBytesUsed + buffer.length;
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { mediaBytesUsed: BigInt(used) },
    });

    res.status(201).json({
      url,
      mediaType: kind,
      bytes: buffer.length,
      usedBytes: used,
      limitBytes: state.limits.mediaQuotaBytes,
      plan: state.planId,
    });
  } catch (err) {
    if (err instanceof PlanLimitError) {
      res.status(err.status).json({ error: err.message, code: err.code });
      return;
    }
    next(err);
  }
});

export default router;
