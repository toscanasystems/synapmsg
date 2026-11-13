/**
 * Optional outbound mail (recovery notices, etc.).
 *
 * Not configured yet in this repo: no SMTP/Resend/SendGrid wiring.
 * When SMTP_URL (or RESEND_API_KEY) is set, sendNoticeEmail will deliver.
 * Until then, calls no-op with a single info log — never throws into auth flows.
 */

export type NoticeEmailPayload = {
  to: string;
  subject: string;
  text: string;
};

export function isOutboundMailConfigured(): boolean {
  return Boolean(
    process.env.SMTP_URL?.trim() || process.env.RESEND_API_KEY?.trim(),
  );
}

/**
 * Best-effort notice. Never throws. Never includes secrets in logs.
 */
export async function sendNoticeEmail(
  payload: NoticeEmailPayload,
): Promise<{ sent: boolean; reason?: string }> {
  if (!payload.to?.includes('@')) {
    return { sent: false, reason: 'no_recipient' };
  }
  if (!isOutboundMailConfigured()) {
    // eslint-disable-next-line no-console
    console.info(
      '[mail] outbound not configured (set SMTP_URL or RESEND_API_KEY); notice skipped',
    );
    return { sent: false, reason: 'not_configured' };
  }

  // Provider hooks land here when ops configures SMTP_URL / RESEND_API_KEY.
  // Intentionally not implemented until a real sender is chosen.
  // eslint-disable-next-line no-console
  console.warn(
    '[mail] SMTP_URL/RESEND_API_KEY present but sender not wired yet; notice skipped',
  );
  return { sent: false, reason: 'provider_not_wired' };
}

/** Guatemala local wall-clock for user-facing notice text. */
export function formatNoticeWhen(d = new Date()): string {
  return new Intl.DateTimeFormat('es-GT', {
    timeZone: 'America/Guatemala',
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(d);
}

/** Coarse place from edge headers only — never the full IP. */
export function approxPlaceFromRequest(headers: Record<string, unknown>): string {
  const raw =
    headers['cf-ipcountry'] ??
    headers['CF-IPCountry'] ??
    headers['x-vercel-ip-country'] ??
    headers['x-country-code'];
  const cc = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  if (cc && cc.length === 2 && cc !== 'XX' && cc !== 'T1') {
    return cc;
  }
  return 'ubicación no disponible';
}

export function buildRecoveryUsedNotice(opts: {
  when: string;
  place: string;
}): { subject: string; text: string } {
  const support = 'https://synapmsg.ai/support/';
  return {
    subject: 'Aviso Synap: usaron tu código de recuperación',
    text:
      `Alguien usó tu código de recuperación el ${opts.when} desde ${opts.place}.\n\n` +
      `Si fuiste vos, no tenés que hacer nada.\n` +
      `Si no fuiste vos, escribinos en ${support}\n\n` +
      `Este mensaje no incluye tu código ni tu número. Synap no necesita tu correo para recuperar la cuenta: eso vive en tu código de papel.`,
  };
}
