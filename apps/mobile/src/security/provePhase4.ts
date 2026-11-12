/**
 * Fase 4 on-device proof — logcat tag SynapPhase4Prove.
 * Trigger: synapmsg://prove/phase4?pin=2468&duress=1357
 */

import * as LocalAuthentication from 'expo-local-authentication';
import { apiClient } from '../api/client';
import securityApi from '../api/security';
import {
  ensureSignalBundle,
  getSignalDeviceId,
  getSignalIdentityPrivB64ForProve,
} from '../crypto/signalSession';
import { useAppLockStore } from '../store/appLock';
import { useAuthStore } from '../store/auth';
import { useChatsStore } from '../store/chats';

async function registerDevice(bundle: {
  deviceId: string;
  identityKeyPub: string;
  signedPreKeyPub: string;
  signedPreKeyId: number;
  signedPreKeySig?: string;
  registrationId: number;
  preKeys: Array<{ keyId: number; publicKey: string }>;
  protocol: string;
}): Promise<void> {
  await apiClient.put(`/e2e/devices/${encodeURIComponent(bundle.deviceId)}`, {
    identityKeyPub: bundle.identityKeyPub,
    signedPreKeyPub: bundle.signedPreKeyPub,
    signedPreKeySig: bundle.signedPreKeySig,
    signedPreKeyId: bundle.signedPreKeyId,
    registrationId: bundle.registrationId,
    preKeys: bundle.preKeys.slice(0, 10),
    protocol: bundle.protocol,
  });
}

async function listDevices(): Promise<
  Array<{ deviceId: string; identityKeyPub?: string }>
> {
  const { data } = await apiClient.get<{
    devices: Array<{ deviceId: string; identityKeyPub?: string }>;
  }>('/e2e/devices');
  return data.devices ?? [];
}

const TAG = 'SynapPhase4Prove';

function log(obj: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.log(TAG, JSON.stringify(obj));
}

export async function runPhase4Proof(opts?: {
  pin?: string;
  duressPin?: string;
  email?: string;
  password?: string;
}): Promise<void> {
  const pin = (opts?.pin || '2468').replace(/\D/g, '').slice(0, 8);
  const duressPin = (opts?.duressPin || '1357').replace(/\D/g, '').slice(0, 8);
  const out: Record<string, unknown> = {
    phase: 4,
    pinLen: pin.length,
    duressLen: duressPin.length,
  };

  try {
    let auth = useAuthStore.getState();
    if (opts?.email && opts?.password) {
      // Always start from a clean real account (avoid leftover decoy session).
      try {
        await useAuthStore.getState().logout();
      } catch {
        /* ignore */
      }
      await useAuthStore.getState().login({
        email: opts.email,
        password: opts.password,
      });
      auth = useAuthStore.getState();
      out.loggedInViaProve = true;
    }
    if (!auth.token || !auth.user) {
      out.ok = false;
      out.error = 'NOT_LOGGED_IN';
      log(out);
      return;
    }
    const realUserId = auth.user.id;
    out.realUserId = realUserId;
    out.realUsername = auth.user.username;
    // ── 1) Device key: private stays local; server sees public only ──
    out.step = 'ensureSignalBundle';
    const bundle = await ensureSignalBundle();
    out.step = 'registerE2eDevice';
    out.deviceId = bundle.deviceId;
    await registerDevice(bundle);
    out.step = 'readLocalPriv';
    const privB64 = await getSignalIdentityPrivB64ForProve();
    if (!privB64) {
      out.ok = false;
      out.error = 'NO_LOCAL_PRIV';
      log(out);
      return;
    }
    const privMarker = privB64.slice(0, 24);
    out.identityKeyPubPrefix = bundle.identityKeyPub.slice(0, 16);
    out.privMarkerPrefix = privMarker.slice(0, 8);

    out.step = 'fetchServerDevices';
    const serverDevices = await listDevices();
    const serverJson = JSON.stringify(serverDevices);
    const privateOnServer = serverJson.includes(privMarker);
    out.privateKeyOnServer = privateOnServer;
    out.serverDeviceCount = serverDevices.length;

    // ── 2) PIN unlock ──
    out.step = 'pin';
    await useAppLockStore.getState().setEnabled(true, pin);
    useAppLockStore.getState().lock();
    const pinResult = await useAppLockStore.getState().unlockWithPin(pin);
    out.pinUnlock = pinResult;
    // ── 3) Biometrics (optional) ──
    let bioHardware = false;
    let bioEnrolled = false;
    try {
      bioHardware = await LocalAuthentication.hasHardwareAsync();
      bioEnrolled = await LocalAuthentication.isEnrolledAsync();
    } catch {
      /* ignore */
    }
    out.bioHardware = bioHardware;
    out.bioEnrolled = bioEnrolled;
    out.bioNote = bioEnrolled
      ? 'Huella disponible; PIN también abre la app'
      : 'Sin huella configurada; PIN alcanza';

    // ── 4) Remote wipe of another device session ──
    // Disconnect local WS first so this issuer does not self-wipe; peer + API handle others.
    const otherId = `prove_other_${Date.now().toString(36)}`;
    await registerDevice({
      deviceId: otherId,
      identityKeyPub: bundle.identityKeyPub,
      signedPreKeyPub: bundle.signedPreKeyPub,
      signedPreKeyId: bundle.signedPreKeyId,
      signedPreKeySig: bundle.signedPreKeySig,
      registrationId: bundle.registrationId,
      preKeys: [{ keyId: 99, publicKey: bundle.identityKeyPub }],
      protocol: bundle.protocol,
    });
    const before = await listDevices();
    out.devicesBeforeWipe = before.map((d) => d.deviceId);
    const issuerId = (await getSignalDeviceId()) || bundle.deviceId;
    out.step = 'wipe';
    const { wsManager } = await import('../api/websocket');
    if (typeof wsManager.disconnect === 'function') wsManager.disconnect();
    out.step = 'wipeApi';
    log({
      wipeRequest: true,
      userId: realUserId,
      otherId,
      issuerId,
      realUsername: out.realUsername,
    });
    const wipeRes = await securityApi.wipe({
      reason: 'phase4_prove',
      issuerDeviceId: issuerId,
    });
    out.wipe = wipeRes;
    // Wait for peer/DB helper to drop the other device identity.
    // Stay WS-disconnected so a delayed remote_wipe does not wipe this issuer mid-prove.
    out.step = 'wipeVerify';
    let after = await listDevices();
    for (let i = 0; i < 15; i++) {
      after = await listDevices();
      if (!after.some((d) => d.deviceId === otherId)) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    out.devicesAfterWipe = after.map((d) => d.deviceId);
    out.otherDeviceRemoved =
      before.some((d) => d.deviceId === otherId) &&
      !after.some((d) => d.deviceId === otherId);
    out.issuerKept = after.some((d) => d.deviceId === issuerId);
    log({ step: 'wipeDone', otherDeviceRemoved: out.otherDeviceRemoved, issuerKept: out.issuerKept });

    // ── 5) Duress PIN → empty decoy, not real account ──
    out.step = 'duressEnsure';
    log({ step: 'duressEnsure' });
    const decoyEnsured = await securityApi.ensureDecoy();
    out.decoyEnsured = decoyEnsured;
    out.step = 'duressSetPins';
    log({ step: 'duressSetPins' });
    // PIN already set in step 2 — only add duress (avoid a second Argon2 setEnabled).
    await useAppLockStore.getState().setDuressPin(duressPin);
    log({ step: 'duressPinSaved' });
    useAppLockStore.getState().lock();
    out.step = 'duressEnterPreview';
    // Prove decoy session without relying on App.tsx race (still triggers unlock path).
    const decoySession = await securityApi.enterDecoy();
    out.decoyUserId = decoySession.user.id;
    out.decoyIsNotReal = decoySession.user.id !== realUserId;
    out.decoyUsername = decoySession.user.username;
    log({
      step: 'duressEnterPreview',
      decoyUserId: out.decoyUserId,
      decoyIsNotReal: out.decoyIsNotReal,
    });
    out.step = 'duressUnlock';
    const duressResult = await useAppLockStore
      .getState()
      .unlockWithPin(duressPin);
    out.duressUnlock = duressResult;
    log({ step: 'duressUnlock', duressUnlock: duressResult });

    await new Promise((r) => setTimeout(r, 1500));
    const chats = useChatsStore.getState().chats;
    out.decoyChatCount = chats.length;
    out.decoyEmpty = chats.length === 0;

    out.ok =
      pinResult === 'ok' &&
      privateOnServer === false &&
      out.otherDeviceRemoved === true &&
      out.issuerKept === true &&
      duressResult === 'duress' &&
      out.decoyIsNotReal === true &&
      out.decoyEmpty === true;

    log(out);
    void wsManager;
  } catch (e) {
    out.ok = false;
    out.error = e instanceof Error ? e.message : String(e);
    out.stack =
      e instanceof Error ? String(e.stack || '').slice(0, 600) : undefined;
    log(out);
  }
}

export function parsePhase4ProveUrl(url: string | null): {
  pin?: string;
  duressPin?: string;
  email?: string;
  password?: string;
} | null {
  if (!url || !url.includes('prove/phase4')) return null;
  try {
    const q = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
    const params = Object.fromEntries(
      q.split('&').filter(Boolean).map((p) => {
        const [k, v] = p.split('=');
        return [decodeURIComponent(k || ''), decodeURIComponent(v || '')];
      }),
    );
    return {
      pin: params.pin,
      duressPin: params.duress || params.duressPin,
      email: params.email,
      password: params.password,
    };
  } catch {
    return { pin: '2468', duressPin: '1357' };
  }
}
