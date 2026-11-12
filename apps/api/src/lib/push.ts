/**
 * Expo Push Notifications (best-effort).
 * https://docs.expo.dev/push-notifications/sending-notifications/
 */

export type PushPayload = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  channelId?: string;
  priority?: 'default' | 'normal' | 'high';
};

export async function sendExpoPush(
  messages: PushPayload[],
): Promise<void> {
  const batch = messages.filter(
    (m) => typeof m.to === 'string' && m.to.startsWith('ExponentPushToken'),
  );
  if (batch.length === 0) return;

  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(
        batch.map((m) => ({
          to: m.to,
          title: m.title,
          body: m.body.slice(0, 180),
          data: m.data ?? {},
          sound: m.sound ?? 'default',
          channelId: m.channelId ?? 'default',
          priority: m.priority ?? 'high',
        })),
      ),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      // eslint-disable-next-line no-console
      console.warn('[push] Expo error', res.status, text.slice(0, 200));
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[push] send failed', err);
  }
}

export async function pushToUserTokens(
  tokens: Array<string | null | undefined>,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  const unique = Array.from(
    new Set(tokens.filter((t): t is string => Boolean(t && t.trim()))),
  );
  if (!unique.length) return;
  await sendExpoPush(
    unique.map((to) => ({ to, title, body, data, priority: 'high' })),
  );
}
