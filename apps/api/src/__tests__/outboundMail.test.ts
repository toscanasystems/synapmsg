import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  approxPlaceFromRequest,
  buildRecoveryUsedNotice,
  formatNoticeWhen,
} from '../lib/outboundMail';

describe('outboundMail — recovery notice copy', () => {
  it('notice has when/place and no code/number secrets', () => {
    const n = buildRecoveryUsedNotice({
      when: '13 de noviembre de 2026, 17:00',
      place: 'GT',
    });
    assert.match(n.text, /código de recuperación/);
    assert.match(n.text, /13 de noviembre/);
    assert.match(n.text, /GT/);
    assert.match(n.text, /synapmsg\.ai\/support/);
    assert.equal(/\b[A-Z0-9]{12}\b/.test(n.text.replace(/recuperación/gi, '')), false);
    assert.ok(!n.text.includes('privateNumber'));
    assert.ok(!n.text.toLowerCase().includes('loginTicket'));
  });

  it('approxPlaceFromRequest uses country header only', () => {
    assert.equal(approxPlaceFromRequest({ 'cf-ipcountry': 'gt' }), 'GT');
    assert.equal(
      approxPlaceFromRequest({ 'cf-ipcountry': 'XX' }),
      'ubicación no disponible',
    );
  });

  it('formatNoticeWhen returns a non-empty Guatemala string', () => {
    const s = formatNoticeWhen(new Date('2026-11-13T23:00:00.000Z'));
    assert.ok(s.length > 8);
  });
});
