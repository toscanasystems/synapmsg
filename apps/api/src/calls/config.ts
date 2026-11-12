/**
 * Call media engine config — Synap owns signaling; Jitsi/WebRTC are media only.
 */

import { randomBytes } from 'crypto';

export type CallMediaEngine = 'jitsi' | 'webrtc';

export type IceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

function parseEngine(raw: string | undefined): CallMediaEngine {
  // Default WebRTC P2P for 1:1 — public meet.jit.si often blocks anonymous
  // iframe rooms behind “waiting for moderator / conference”.
  if (raw === 'jitsi') return 'jitsi';
  return 'webrtc';
}

/** Random opaque Jitsi/WebRTC room — never derive solely from chatId. */
export function mintCallRoom(): string {
  return `synap${randomBytes(16).toString('hex')}`;
}

const callRooms = new Map<string, { room: string; expires: number }>();

export function rememberCallRoom(chatId: string, room: string): void {
  callRooms.set(chatId, { room, expires: Date.now() + 2 * 60 * 60 * 1000 });
}

export function getRememberedCallRoom(chatId: string): string | null {
  const hit = callRooms.get(chatId);
  if (!hit) return null;
  if (hit.expires < Date.now()) {
    callRooms.delete(chatId);
    return null;
  }
  return hit.room;
}

export function clearCallRoom(chatId: string): void {
  callRooms.delete(chatId);
}

export function getCallConfig(opts?: { includeTurnCredentials?: boolean }): {
  engine: CallMediaEngine;
  jitsiDomain: string;
  iceServers: IceServer[];
  note: string;
} {
  const includeTurn = opts?.includeTurnCredentials !== false;
  const engine = parseEngine(process.env.SYNAP_CALL_ENGINE);
  const jitsiDomain =
    (process.env.SYNAP_JITSI_DOMAIN || 'meet.jit.si').replace(/^https?:\/\//, '');

  const iceServers: IceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ];

  if (includeTurn) {
    const turnUrls = (process.env.SYNAP_TURN_URLS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const turnUser = process.env.SYNAP_TURN_USERNAME || '';
    const turnPass = process.env.SYNAP_TURN_CREDENTIAL || '';
    if (turnUrls.length && turnUser && turnPass) {
      iceServers.push({
        urls: turnUrls,
        username: turnUser,
        credential: turnPass,
      });
    } else if ((process.env.NODE_ENV || 'development') !== 'production') {
      // Dev-only public relay; production should set SYNAP_TURN_*.
      iceServers.push({
        urls: [
          'turn:openrelay.metered.ca:80',
          'turn:openrelay.metered.ca:443',
          'turn:openrelay.metered.ca:443?transport=tcp',
        ],
        username: 'openrelayproject',
        credential: 'openrelayproject',
      });
    }
  }

  return {
    engine,
    jitsiDomain,
    iceServers,
    note:
      engine === 'jitsi'
        ? 'Media via Jitsi SFU; invite/accept/end via Synap WS'
        : 'Media via P2P WebRTC; invite/accept/end via Synap WS',
  };
}
