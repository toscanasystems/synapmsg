/**
 * Inactivity switch — polls idle users and fires the single action the user chose.
 * Never wipe+notify unless action is explicitly wipe_and_notify.
 */

import { prisma } from '../lib/prisma';
import { sendToUser } from '../messages/websocket';
import { randomBytes } from 'crypto';
import { signWipePayload, wipePublicKeyB64 } from '../lib/wipeSign';

let timer: ReturnType<typeof setInterval> | null = null;

export type DmsCfg = {
  enabled?: boolean;
  idleDays?: number;
  /** wipe | notify | wipe_and_notify | ciphertext | message */
  action?: string;
  payloadCiphertext?: string;
  /** Contact userIds to notify (notify / wipe_and_notify). */
  notifyContactIds?: string[];
};

function shouldWipe(action: string): boolean {
  return action === 'wipe' || action === 'wipe_and_notify';
}

function shouldNotify(action: string): boolean {
  return (
    action === 'notify' ||
    action === 'wipe_and_notify' ||
    action === 'message' ||
    action === 'ciphertext'
  );
}

async function fireWipe(userId: string): Promise<void> {
  const payload = {
    type: 'remote_wipe' as const,
    userId,
    nonce: randomBytes(16).toString('hex'),
    reason: 'dead_mans_switch',
    issuedAt: new Date().toISOString(),
    issuerDeviceId: null as string | null,
  };
  const sig = signWipePayload(payload);
  sendToUser(userId, {
    ...payload,
    sig,
    alg: 'ed25519',
    pubKey: wipePublicKeyB64(),
  });
}

async function fireNotify(
  user: { id: string; name: string | null; privateNumber: string | null },
  cfg: DmsCfg,
  idleDays: number,
): Promise<{ notified: string[] }> {
  const action = cfg.action || 'notify';
  const notified: string[] = [];

  if (action === 'ciphertext' && cfg.payloadCiphertext) {
    sendToUser(user.id, {
      type: 'dms_triggered',
      action: 'ciphertext',
      ciphertext: cfg.payloadCiphertext,
      message: 'Aviso de inactividad: payload cifrado pre-armado.',
    });
    notified.push(user.id);
    return { notified };
  }

  const selfMsg =
    action === 'message'
      ? 'Aviso de inactividad: sin apertura de la app en el plazo elegido.'
      : `Aviso de inactividad: sin actividad > ${idleDays} día(s).`;
  sendToUser(user.id, {
    type: 'dms_triggered',
    action: action === 'wipe_and_notify' ? 'notify' : action || 'notify',
    message: selfMsg,
  });
  notified.push(user.id);

  const contacts = Array.isArray(cfg.notifyContactIds)
    ? cfg.notifyContactIds.filter((id) => typeof id === 'string' && id !== user.id)
    : [];
  const label = user.name || user.privateNumber || 'Un contacto';
  for (const contactId of contacts.slice(0, 20)) {
    sendToUser(contactId, {
      type: 'dms_triggered',
      action: 'contact_notify',
      message: `${label} configuró un aviso de inactividad y no abrió Synapmsg en ${idleDays} día(s).`,
      fromUserId: user.id,
    });
    notified.push(contactId);
  }
  return { notified };
}

async function processRow(
  row: { id: string; userId: string; target: string },
  now: number,
): Promise<boolean> {
  let cfg: DmsCfg;
  try {
    cfg = JSON.parse(row.target) as DmsCfg;
  } catch {
    return false;
  }
  if (!cfg.enabled) return false;
  const idleDays = Math.max(1, Number(cfg.idleDays) || 30);
  const user = await prisma.user.findUnique({ where: { id: row.userId } });
  if (!user) return false;
  const last = (user.lastActiveAt ?? user.lastSeenAt ?? user.updatedAt).getTime();
  if (now - last < idleDays * 24 * 60 * 60 * 1000) return false;

  const action = cfg.action || 'notify';
  if (shouldWipe(action)) {
    await fireWipe(user.id);
  }
  if (shouldNotify(action)) {
    await fireNotify(user, cfg, idleDays);
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
        lastFiredAction: action,
      }),
    },
  });
  return true;
}

export async function tickDms(): Promise<{ fired: number }> {
  const rows = await prisma.glossaryEntry.findMany({
    where: { source: '__dms_config__' },
    take: 500,
  });
  const now = Date.now();
  let fired = 0;
  for (const row of rows) {
    if (await processRow(row, now)) fired += 1;
  }
  return { fired };
}

/** Run check for one user (proof / Settings "Comprobar ahora"). */
export async function tickDmsForUser(
  userId: string,
): Promise<{ fired: boolean; reason?: string }> {
  const row = await prisma.glossaryEntry.findUnique({
    where: { userId_source: { userId, source: '__dms_config__' } },
  });
  if (!row) return { fired: false, reason: 'no_config' };
  const fired = await processRow(row, Date.now());
  return { fired, reason: fired ? 'fired' : 'not_due' };
}

export function startDmsScheduler(): void {
  if (timer) return;
  timer = setInterval(() => {
    void tickDms().catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('[dms]', (err as Error).message);
    });
  }, 60_000);
  // eslint-disable-next-line no-console
  console.log('[dms] scheduler started');
  void tickDms().catch(() => undefined);
}

export function stopDmsScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
