/**
 * Permanent guard: group voice is mesh (no mixer), leave ≠ end-for-all, cap 8.
 */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  GROUP_CALL_MAX_MEMBERS,
  _resetGroupSessionsForTests,
  createGroupSession,
  destroyGroupSession,
  joinGroupSession,
  leaveGroupSession,
  markRinging,
  meshEdgeCount,
  rosterOf,
  setMemberMuted,
  setMemberStatus,
} from '../calls/groupSession';

afterEach(() => {
  _resetGroupSessionsForTests();
});

describe('groupSession — llamada de voz en grupo (mesh)', () => {
  it('meshEdgeCount: 2→1, 3→3, 8→28', () => {
    assert.equal(meshEdgeCount(2), 1);
    assert.equal(meshEdgeCount(3), 3);
    assert.equal(meshEdgeCount(8), 28);
  });

  it('cap duro GROUP_CALL_MAX_MEMBERS = 8 (sin mezclador)', () => {
    assert.equal(GROUP_CALL_MAX_MEMBERS, 8);
  });

  it('crear sesión y unirse; salir no destruye si quedan otros', () => {
    const s = createGroupSession({
      callRoom: 'synaptestroom1',
      chatId: 'chat-g1',
      createdBy: 'u1',
      creatorName: 'Uno',
    });
    assert.equal(joinGroupSession(s, 'u2', 'Dos')?.userId, 'u2');
    assert.equal(joinGroupSession(s, 'u3', 'Tres')?.userId, 'u3');
    assert.equal(rosterOf(s).length, 3);

    const left = leaveGroupSession(s, 'u2');
    assert.equal(left.ended, false);
    assert.equal(
      rosterOf(s).filter((m) => m.status !== 'ringing').length,
      2,
    );
  });

  it('el último en salir cierra la sesión', () => {
    const s = createGroupSession({
      callRoom: 'synaptestroom2',
      chatId: 'chat-g2',
      createdBy: 'a',
      creatorName: 'A',
    });
    joinGroupSession(s, 'b', 'B');
    leaveGroupSession(s, 'a');
    const last = leaveGroupSession(s, 'b');
    assert.equal(last.ended, true);
  });

  it('mute y status sin conexión quedan en el roster', () => {
    const s = createGroupSession({
      callRoom: 'synaptestroom3',
      chatId: 'chat-g3',
      createdBy: 'a',
      creatorName: 'A',
    });
    joinGroupSession(s, 'b', 'B');
    setMemberMuted(s, 'b', true);
    setMemberStatus(s, 'b', 'disconnected');
    const b = rosterOf(s).find((m) => m.userId === 'b');
    assert.equal(b?.muted, true);
    assert.equal(b?.status, 'disconnected');
  });

  it('rechaza el 9º participante en llamada (ringing no cuenta igual)', () => {
    const s = createGroupSession({
      callRoom: 'synaptestroom4',
      chatId: 'chat-g4',
      createdBy: 'u0',
      creatorName: 'U0',
    });
    for (let i = 1; i < 8; i++) {
      assert.ok(joinGroupSession(s, `u${i}`, `U${i}`));
    }
    // 8 in-call already (u0..u7)
    assert.equal(joinGroupSession(s, 'u8', 'U8'), null);
    // ringing slot can still be marked
    markRinging(s, 'ringer', 'Ringer');
    destroyGroupSession(s.callRoom);
  });
});
