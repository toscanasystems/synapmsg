/**
 * Call media engine config — Synap owns signaling; media is P2P WebRTC (DTLS-SRTP).
 * TURN credentials are minted separately (see turnCredentials.ts).
 */

import { randomBytes } from 'crypto';

export type IceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

export type CallMediaEngine = 'jitsi' | 'webrtc';

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

/** Sync fallback for unauthenticated /call/config — STUN only, never openrelay. */
export function getCallConfig(): {
  engine: CallMediaEngine;
  jitsiDomain: string;
  iceServers: IceServer[];
  iceTransportPolicy: 'relay' | 'all';
  note: string;
} {
  const engine = parseEngine(process.env.SYNAP_CALL_ENGINE);
  const jitsiDomain = (
    process.env.SYNAP_JITSI_DOMAIN || 'meet.jit.si'
  ).replace(/^https?:\/\//, '');

  return {
    engine,
    jitsiDomain,
    iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }],
    iceTransportPolicy: 'relay',
    note:
      engine === 'jitsi'
        ? 'Media via Jitsi SFU; invite/accept/end via Synap WS'
        : 'Media via P2P WebRTC + TURN relay; invite/accept/end via Synap WS',
  };
}
