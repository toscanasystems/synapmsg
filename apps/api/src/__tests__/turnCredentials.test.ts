/**
 * Permanent guard: calls mint short-lived TURN creds and default to relay
 * (peer IP hidden). Must not regress when adding group calls.
 */
import assert from 'node:assert/strict';
import { createHmac } from 'crypto';
import { afterEach, describe, it } from 'node:test';
import {
  mintCoturnHmac,
  mintTurnIceServers,
} from '../calls/turnCredentials';
import { getCallConfig, mintCallRoom } from '../calls/config';

const PREV = { ...process.env };

afterEach(() => {
  for (const k of Object.keys(process.env)) {
    if (!(k in PREV)) delete process.env[k];
  }
  Object.assign(process.env, PREV);
});

describe('TURN / call config — relé y credenciales temporales', () => {
  it('mintCoturnHmac usa username con expiry y HMAC-SHA1', () => {
    const secret = 'unit-test-turn-secret-value';
    const ttl = 600;
    const before = Math.floor(Date.now() / 1000);
    const { username, credential } = mintCoturnHmac(secret, ttl);
    const [expStr, rand] = username.split(':');
    const exp = Number(expStr);
    assert.ok(exp >= before + ttl - 2);
    assert.ok(exp <= before + ttl + 5);
    assert.match(rand, /^[a-f0-9]+$/i);
    const expected = createHmac('sha1', secret).update(username).digest('base64');
    assert.equal(credential, expected);
  });

  it('mintTurnIceServers con coturn: provider coturn-hmac, policy relay, TTL 600', async () => {
    delete process.env.SYNAP_CF_TURN_KEY_ID;
    delete process.env.SYNAP_CF_TURN_API_TOKEN;
    delete process.env.CLOUDFLARE_API_TOKEN;
    delete process.env.SYNAP_TURN_ALLOW_STATIC;
    process.env.SYNAP_TURN_URLS =
      'turn:yamabiko.proxy.rlwy.net:27351?transport=tcp';
    process.env.SYNAP_TURN_SECRET = 'unit-test-turn-secret-value';
    delete process.env.SYNAP_TURN_TTL_SEC;

    const mint = await mintTurnIceServers();
    assert.equal(mint.provider, 'coturn-hmac');
    assert.equal(mint.iceTransportPolicy, 'relay');
    assert.equal(mint.ttlSec, 600);
    const turn = mint.iceServers.find((s) =>
      JSON.stringify(s.urls).includes('turn:'),
    );
    assert.ok(turn);
    assert.ok(turn?.username && /^\d+:[a-f0-9]+$/i.test(turn.username));
    assert.ok(turn?.credential && turn.credential.length > 10);
  });

  it('allowDirect solo si se pide explícitamente → policy all', async () => {
    process.env.SYNAP_TURN_URLS = 'turn:example.test:3478?transport=tcp';
    process.env.SYNAP_TURN_SECRET = 'unit-test-turn-secret-value';
    const mint = await mintTurnIceServers({ allowDirect: true });
    assert.equal(mint.iceTransportPolicy, 'all');
  });

  it('sin SYNAP_TURN_ALLOW_STATIC no usa username/password fijos', async () => {
    delete process.env.SYNAP_TURN_SECRET;
    delete process.env.SYNAP_CF_TURN_KEY_ID;
    process.env.SYNAP_TURN_URLS = 'turn:example.test:3478';
    process.env.SYNAP_TURN_USERNAME = 'fixed-user';
    process.env.SYNAP_TURN_CREDENTIAL = 'fixed-pass';
    delete process.env.SYNAP_TURN_ALLOW_STATIC;

    const mint = await mintTurnIceServers();
    assert.equal(mint.provider, 'none');
    assert.equal(mint.iceTransportPolicy, 'relay');
  });

  it('getCallConfig por defecto: relay y sin openrelay', () => {
    delete process.env.SYNAP_CALL_ENGINE;
    const cfg = getCallConfig();
    assert.equal(cfg.engine, 'webrtc');
    assert.equal(cfg.iceTransportPolicy, 'relay');
    const blob = JSON.stringify(cfg.iceServers).toLowerCase();
    assert.ok(!blob.includes('openrelay'));
    assert.ok(!blob.includes('metered.ca'));
  });

  it('mintCallRoom es opaco (no es el chatId)', () => {
    const chatId = 'chat-fixed-id-12345';
    const room = mintCallRoom();
    assert.ok(room.startsWith('synap'));
    assert.ok(room.length > 20);
    assert.ok(!room.includes(chatId));
  });
});
