/**
 * Dead Man's Switch — polls idle users and fires configured actions.
 * ciphertext action: relays client-pre-armed blob (server never decrypts).
 */

import { prisma } from '../lib/prisma';
import { sendToUser } from '../messages/websocket';
import { randomBytes } from 'crypto';
import { signWipePayload, wipePublicKeyB64 } from '../lib/wipeSign';

let timer: ReturnType<typeof setInterval> | null = null;

type DmsCfg = {
  enabled?: boolean;
  idleDays?: number;
  action?: string;
  payloadCiphertext?: string;
};

async function tick(): Promise<void> {
  const rows = await prisma.glossaryEntry.findMany({
    where: { source: '__dms_config__' },
    take: 500,
  });
  const now = Date.now();
  for (const row of rows) {
    let cfg: DmsCfg;
    try {
      cfg = JSON.parse(row.target) as DmsCfg;
    } catch {
      continue;
    }
    if (!cfg.enabled) continue;
    const idleDays = Math.max(1, Number(cfg.idleDays) || 30);
    const user = await prisma.user.findUnique({ where: { id: row.userId } });
    if (!user) continue;
    const last = (user.lastActiveAt ?? user.lastSeenAt ?? user.updatedAt).getTime();
    if (now - last < idleDays * 24 * 60 * 60 * 1000) continue;

    const action = cfg.action || 'notify';
    if (action === 'wipe') {
      const payload = {
        type: 'remote_wipe' as const,
        userId: user.id,
        nonce: randomBytes(16).toString('hex'),
        reason: 'dead_mans_switch',
        issuedAt: new Date().toISOString(),
        issuerDeviceId: null as string | null,
      };
      const sig = signWipePayload(payload);
      sendToUser(user.id, {
        ...payload,
        sig,
        alg: 'ed25519',
        pubKey: wipePublicKeyB64(),
      });
    } else if (action === 'ciphertext' && cfg.payloadCiphertext) {
      sendToUser(user.id, {
        type: 'dms_triggered',
        action: 'ciphertext',
        ciphertext: cfg.payloadCiphertext,
        message: 'Dead Man\'s Switch: payload cifrado pre-armado.',
      });
    } else if (action === 'message') {
      sendToUser(user.id, {
        type: 'dms_triggered',
        action: 'message',
        message:
          "Dead Man's Switch: inactividad detectada. Revisa tu cuenta.",
      });
    } else {
      sendToUser(user.id, {
        type: 'dms_triggered',
        action: 'notify',
        message: `Dead Man's Switch: sin actividad > ${idleDays} días.`,
      });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastActiveAt: new Date() },
    });
    await prisma.glossaryEntry.update({
      where: { id: row.id },
      data: {
        target: JSON.stringify({
          ...cfg,
          enabled: false,
          lastFiredAt: new Date().toISOString(),
        }),
      },
    });
  }
}

export function startDmsScheduler(): void {
  if (timer) return;
  timer = setInterval(() => {
    void tick().catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('[dms]', (err as Error).message);
    });
  }, 60_000);
  // eslint-disable-next-line no-console
  console.log('[dms] scheduler started');
}

export function stopDmsScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
