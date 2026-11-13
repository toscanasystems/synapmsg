/**
 * In-memory group voice call sessions (mesh, no SFU / no audio mixer).
 *
 * Privacy: media stays DTLS-SRTP between peers (via TURN relay).
 * The server only tracks roster / mute / connection flags — never audio.
 *
 * Cap: GROUP_CALL_MAX_MEMBERS (8). Full mesh edges = n*(n-1)/2.
 * Soft honesty: voice-only mesh is feasible to 8 on modern phones + Wi‑Fi;
 * if devices struggle, lower the product cap — do NOT add a mixer for Private.
 */

export const GROUP_CALL_MAX_MEMBERS = 8;

export type GroupMemberStatus =
  | 'ringing'
  | 'joining'
  | 'connected'
  | 'disconnected';

export type GroupRosterMember = {
  userId: string;
  name: string;
  muted: boolean;
  status: GroupMemberStatus;
  joinedAt: number;
};

export type GroupCallSession = {
  callRoom: string;
  chatId: string;
  createdBy: string;
  /** Group voice only for Pieza 4. */
  callType: 'voice';
  members: Map<string, GroupRosterMember>;
  createdAt: number;
};

const byRoom = new Map<string, GroupCallSession>();
const byChat = new Map<string, string>(); // chatId → callRoom

export function meshEdgeCount(memberCount: number): number {
  const n = Math.max(0, Math.floor(memberCount));
  return (n * (n - 1)) / 2;
}

export function getSessionByRoom(callRoom: string): GroupCallSession | null {
  return byRoom.get(callRoom) || null;
}

export function getSessionByChat(chatId: string): GroupCallSession | null {
  const room = byChat.get(chatId);
  if (!room) return null;
  return byRoom.get(room) || null;
}

export function rosterOf(session: GroupCallSession): GroupRosterMember[] {
  return [...session.members.values()].sort((a, b) =>
    a.joinedAt === b.joinedAt
      ? a.userId.localeCompare(b.userId)
      : a.joinedAt - b.joinedAt,
  );
}

function touchMaps(session: GroupCallSession): void {
  byRoom.set(session.callRoom, session);
  byChat.set(session.chatId, session.callRoom);
}

export function createGroupSession(opts: {
  callRoom: string;
  chatId: string;
  createdBy: string;
  creatorName: string;
}): GroupCallSession {
  const existing = getSessionByChat(opts.chatId);
  if (existing) {
    // Re-invite into live session (same chat) — keep room.
    return existing;
  }
  const session: GroupCallSession = {
    callRoom: opts.callRoom,
    chatId: opts.chatId,
    createdBy: opts.createdBy,
    callType: 'voice',
    members: new Map(),
    createdAt: Date.now(),
  };
  session.members.set(opts.createdBy, {
    userId: opts.createdBy,
    name: opts.creatorName || 'Synap',
    muted: false,
    status: 'joining',
    joinedAt: Date.now(),
  });
  touchMaps(session);
  return session;
}

export function markRinging(
  session: GroupCallSession,
  userId: string,
  name: string,
): void {
  if (session.members.has(userId)) return;
  session.members.set(userId, {
    userId,
    name: name || 'Synap',
    muted: false,
    status: 'ringing',
    joinedAt: Date.now(),
  });
  touchMaps(session);
}

/** Join / accept. Returns null if full (in-call members ≥ max). */
export function joinGroupSession(
  session: GroupCallSession,
  userId: string,
  name: string,
): GroupRosterMember | null {
  const existing = session.members.get(userId);
  if (existing) {
    existing.name = name || existing.name;
    existing.status = 'joining';
    touchMaps(session);
    return existing;
  }
  const inCall = [...session.members.values()].filter(
    (m) =>
      m.status === 'joining' ||
      m.status === 'connected' ||
      m.status === 'disconnected',
  ).length;
  if (inCall >= GROUP_CALL_MAX_MEMBERS) {
    return null;
  }
  const row: GroupRosterMember = {
    userId,
    name: name || 'Synap',
    muted: false,
    status: 'joining',
    joinedAt: Date.now(),
  };
  session.members.set(userId, row);
  touchMaps(session);
  return row;
}

export function setMemberStatus(
  session: GroupCallSession,
  userId: string,
  status: GroupMemberStatus,
): GroupRosterMember | null {
  const m = session.members.get(userId);
  if (!m) return null;
  m.status = status;
  touchMaps(session);
  return m;
}

export function setMemberMuted(
  session: GroupCallSession,
  userId: string,
  muted: boolean,
): GroupRosterMember | null {
  const m = session.members.get(userId);
  if (!m) return null;
  m.muted = muted;
  touchMaps(session);
  return m;
}

/**
 * Leave without ending the call for others.
 * Returns { ended: true } when the session is destroyed (last member left).
 */
export function leaveGroupSession(
  session: GroupCallSession,
  userId: string,
): { ended: boolean; remaining: GroupRosterMember[] } {
  session.members.delete(userId);
  const remaining = rosterOf(session).filter((m) => m.status !== 'ringing');
  const anyoneInCall = remaining.length > 0;
  if (!anyoneInCall) {
    destroyGroupSession(session.callRoom);
    return { ended: true, remaining: [] };
  }
  touchMaps(session);
  return { ended: false, remaining: rosterOf(session) };
}

export function destroyGroupSession(callRoom: string): void {
  const session = byRoom.get(callRoom);
  if (!session) return;
  byRoom.delete(callRoom);
  if (byChat.get(session.chatId) === callRoom) {
    byChat.delete(session.chatId);
  }
}

export function destroyGroupSessionByChat(chatId: string): void {
  const room = byChat.get(chatId);
  if (room) destroyGroupSession(room);
}

/** Test helper — wipe all sessions. */
export function _resetGroupSessionsForTests(): void {
  byRoom.clear();
  byChat.clear();
}
