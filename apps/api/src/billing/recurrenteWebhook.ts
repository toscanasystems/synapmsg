/**
 * POST /billing/webhook/recurrente — Svix-signed Recurrente events.
 */

import { Request, Response } from 'express';
import { Webhook } from 'svix';
import {
  findUserIdFromRecurrentePayload,
  grantPremiumFromRecurrente,
  isRecurrenteConfigured,
  revokePremium,
} from './recurrente';

export async function recurrenteWebhookHandler(
  req: Request,
  res: Response,
): Promise<void> {
  if (!isRecurrenteConfigured()) {
    res.status(503).json({ error: 'Recurrente not configured' });
    return;
  }

  const secret = process.env.RECURRENTE_WEBHOOK_SECRET?.trim();
  const rawBody = req.body;
  if (!Buffer.isBuffer(rawBody)) {
    res.status(400).json({ error: 'Raw body required' });
    return;
  }

  const nodeEnv = process.env.NODE_ENV || 'development';
  if (!secret) {
    if (nodeEnv === 'production') {
      res.status(503).json({ error: 'Webhook secret not configured' });
      return;
    }
    // eslint-disable-next-line no-console
    console.warn(
      '[recurrente webhook] RECURRENTE_WEBHOOK_SECRET missing — unsigned body (dev only)',
    );
  }

  let payload: Record<string, unknown>;
  try {
    if (secret) {
      const wh = new Webhook(secret);
      const headers = {
        'svix-id': String(req.headers['svix-id'] || ''),
        'svix-timestamp': String(req.headers['svix-timestamp'] || ''),
        'svix-signature': String(req.headers['svix-signature'] || ''),
      };
      payload = wh.verify(rawBody.toString('utf8'), headers) as unknown as Record<
        string,
        unknown
      >;
    } else {
      payload = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'invalid signature';
    res.status(400).json({ error: `Webhook Error: ${msg}` });
    return;
  }

  try {
    const eventType = String(
      payload.event_type || payload.type || '',
    ).toLowerCase();
    const status = String(payload.status || '').toLowerCase();

    const userId = await findUserIdFromRecurrentePayload(
      payload as {
        checkout?: { metadata?: Record<string, string> };
        metadata?: Record<string, string>;
        customer?: { email?: string };
      },
    );

    if (
      eventType === 'intent.succeeded' ||
      eventType === 'intent.paid' ||
      (eventType.includes('succeeded') && status === 'succeeded') ||
      eventType === 'subscription.create'
    ) {
      if (userId) {
        await grantPremiumFromRecurrente(userId, { expiresAt: null });
      }
    }

    if (
      eventType === 'subscription.cancel' ||
      eventType === 'subscription.past_due'
    ) {
      if (userId) await revokePremium(userId);
    }

    res.json({ received: true });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[recurrente webhook]', err);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
}
