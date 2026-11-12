/**
 * Fase 5.4 — vault / SecureStore proof.
 * Trigger: synapmsg://prove/vault
 * Logcat: SynapVaultProve
 */

import { ensureSignalBundle, getSignalIdentityPub } from '../crypto/signalSession';
import { assessDeviceRiskAsync } from './deviceGuard';
import {
  ensureNaclPrng,
  getVaultStatus,
  secureGet,
  securePut,
  vaultGet,
  vaultSet,
} from './secureVault';

const TAG = 'SynapVaultProve';
const PROBE_KEY = 'synap_vault_probe_v1';

function log(obj: unknown): void {
  console.warn(TAG, typeof obj === 'string' ? obj : JSON.stringify(obj));
}

export function parseVaultProveUrl(url: string | null): boolean {
  return Boolean(url && url.includes('prove/vault'));
}

export async function runVaultProof(): Promise<{ ok: boolean }> {
  const out: Record<string, unknown> = { ok: false };
  try {
    ensureNaclPrng();
    out.prngOk = true;

    const marker = `vault-probe-${Date.now()}`;
    await vaultSet(PROBE_KEY, marker);
    const roundtrip = await vaultGet(PROBE_KEY);
    out.vaultRoundtrip = roundtrip === marker;

    const probeKey = 'ssig_probe_persist';
    await securePut(probeKey, marker);
    const again = await secureGet(probeKey);
    out.secureStoreRoundtrip = again === marker;

    await ensureSignalBundle().catch((e) => {
      out.signalBundleError = e instanceof Error ? e.message : String(e);
    });
    const idPub = await getSignalIdentityPub();
    out.hasSignalIdentity = Boolean(idPub);
    out.identityPrefix = idPub?.slice(0, 16) ?? null;

    const vault = await getVaultStatus();
    out.backend = vault.backend;
    out.vaultNote = vault.note;
    out.vaultError = vault.lastError;
    out.prngStatus = vault.prngOk;

    const risk = await assessDeviceRiskAsync();
    out.rootDetected = risk.reasons.includes('root');
    out.riskReasons = risk.reasons;
    out.rootHonesty =
      'Si hay root, el almacén del sistema puede ser eludible; no prometemos que sea imposible de saltar.';

    out.ok =
      out.prngOk === true &&
      out.vaultRoundtrip === true &&
      out.secureStoreRoundtrip === true &&
      vault.backend === 'SecureStore' &&
      !String(vault.lastError || '').includes('no PRNG');

    log(out);
    return { ok: Boolean(out.ok) };
  } catch (err) {
    out.ok = false;
    out.error = err instanceof Error ? err.message : String(err);
    log(out);
    return { ok: false };
  }
}
