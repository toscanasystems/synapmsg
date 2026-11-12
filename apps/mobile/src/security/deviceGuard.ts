/**
 * Anti-extracción — native enclave probes + JS fallback.
 * EXPO_PUBLIC_ENCLAVE_STRICT=1 → fail-closed: deny E2E decrypt on risk.
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { probeEnclave, type EnclaveProbe } from 'synap-enclave';

export type DeviceRisk = {
  risky: boolean;
  reasons: string[];
  strict: boolean;
  native: boolean;
  strongBox: boolean;
  probe?: EnclaveProbe;
};

function strictMode(): boolean {
  return (
    String(process.env.EXPO_PUBLIC_ENCLAVE_STRICT ?? '1').replace(/['"]/g, '') !==
    '0'
  );
}

let cached: DeviceRisk | null = null;

export async function assessDeviceRiskAsync(): Promise<DeviceRisk> {
  const reasons: string[] = [];
  let native = false;
  let strongBox = false;
  let probe: EnclaveProbe | undefined;

  try {
    probe = await probeEnclave();
    native = probe.native;
    strongBox = probe.strongBox;
    if (probe.rooted) reasons.push('root');
    if (probe.frida) reasons.push('frida');
    if (probe.emulator) reasons.push('emulator');
    if (probe.debugger) reasons.push('debugger');
    for (const r of probe.reasons) {
      if (!reasons.includes(r)) reasons.push(r);
    }
  } catch {
    reasons.push('enclave_probe_failed');
  }

  if (Constants.isDevice === false && !reasons.includes('emulator')) {
    reasons.push('emulator');
  }
  if (__DEV__) reasons.push('dev_build');
  if (Platform.OS === 'android') {
    const appOwnership = (Constants as { appOwnership?: string }).appOwnership;
    if (appOwnership === 'expo') reasons.push('expo_go');
  }

  const risk: DeviceRisk = {
    risky: reasons.some((r) => r !== 'dev_build' && r !== 'native_module_missing'),
    reasons,
    strict: strictMode(),
    native,
    strongBox,
    probe,
  };
  cached = risk;
  return risk;
}

/** Sync snapshot — prefer assessDeviceRiskAsync at boot. */
export function assessDeviceRisk(): DeviceRisk {
  if (cached) return cached;
  const reasons: string[] = [];
  if (Constants.isDevice === false) reasons.push('emulator');
  if (__DEV__) reasons.push('dev_build');
  return {
    risky: reasons.length > 0,
    reasons,
    strict: strictMode(),
    native: false,
    strongBox: false,
  };
}

export function mayDecryptE2e(): { ok: boolean; reason?: string } {
  const risk = assessDeviceRisk();
  if (!risk.strict) return { ok: true };
  const blocking = risk.reasons.filter(
    (r) =>
      r !== 'dev_build' &&
      r !== 'native_module_missing' &&
      r !== 'enclave_probe_failed',
  );
  // Hard deny: root / frida / emulator / expo go.
  // Note: "debugger" alone is NOT hard-denied — USB adb debugging on real
  // phones would otherwise block reading Private chats during QA.
  const hard = blocking.filter((r) =>
    ['root', 'frida', 'emulator', 'expo_go', 'su_binary', 'frida_maps'].some(
      (h) => r === h || r.startsWith('frida_port'),
    ),
  );
  if (hard.length > 0) {
    return { ok: false, reason: hard.join(',') };
  }
  return { ok: true };
}
