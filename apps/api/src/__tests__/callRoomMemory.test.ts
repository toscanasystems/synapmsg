/**
 * Call room memory: opaque room tied to chat, expires, clearable.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  clearCallRoom,
  getRememberedCallRoom,
  mintCallRoom,
  rememberCallRoom,
} from '../calls/config';

describe('call room memory', () => {
  it('remember / get / clear', () => {
    const chatId = `t-${Date.now()}`;
    const room = mintCallRoom();
    rememberCallRoom(chatId, room);
    assert.equal(getRememberedCallRoom(chatId), room);
    clearCallRoom(chatId);
    assert.equal(getRememberedCallRoom(chatId), null);
  });
});
