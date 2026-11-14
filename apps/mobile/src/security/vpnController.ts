/**
 * Anti-censorship traffic routing.
 * 1) Embedded tunnel: route API/WS via media.synapmsg.ai (Cloudflare) so
 *    local observers see CDN IP, not Railway API IP.
 * 2) Optional WireGuard/Outline profile import when ops provisions relays.
 */

import { Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  API_BASE_URL,
  DIRECT_API_BASE_URL,
  getAuthToken,
  setApiBaseUrl,
} from '../api/client';
import { wsManager } from '../api/websocket';

const VPN_ENABLED_KEY = 'synap_vpn_enabled';

export type VpnProfile = {
  enabled: boolean;
  provider: 'wireguard' | 'outline' | 'none';
  config?: string;
  endpoint?: string;
  note?: string;
  tunnel?: string;
};

export async function fetchVpnProfile(token?: string | null): Promise<VpnProfile> {
  try {
    const res = await fetch(`${API_BASE_URL}/security/vpn/config`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!res.ok) {
      return {
        enabled: false,
        provider: 'none',
        tunnel: 'https://media.synapmsg.ai/tunnel',
        note: 'Usá túnel Cloudflare (media) — oculta IP del API',
      };
    }
    return (await res.json()) as VpnProfile;
  } catch {
    return {
      enabled: false,
      provider: 'none',
      tunnel: 'https://media.synapmsg.ai/tunnel',
      note: 'network_error',
    };
  }
}

export async function isVpnPreferred(): Promise<boolean> {
  return (await AsyncStorage.getItem(VPN_ENABLED_KEY)) === '1';
}

export async function setVpnPreferred(on: boolean): Promise<void> {
  await AsyncStorage.setItem(VPN_ENABLED_KEY, on ? '1' : '0');
}

/**
 * Apply Cloudflare tunnel for messaging HTTP + reconnect WS.
 * Message IP privacy requires the tunnel; keep it on even if WireGuard is off.
 */
export async function applyTrafficTunnel(_on: boolean): Promise<void> {
  setApiBaseUrl(true);
  const token = getAuthToken();
  if (token) {
    wsManager.reconnect(token);
  }
}

/**
 * Hydrate routing at app start.
 * Prefer DIRECT for auth/bootstrap reliability. If the user previously
 * enabled anti-censorship, re-apply the Cloudflare tunnel after hydrate.
 */
export async function hydrateVpnRouting(): Promise<boolean> {
  const preferTunnel = await isVpnPreferred();
  setApiBaseUrl(preferTunnel);
  return preferTunnel;
}

/** Open WireGuard import or Outline add-server deep link when possible. */
export async function activateVpn(profile: VpnProfile): Promise<{
  ok: boolean;
  detail: string;
}> {
  // Always enable Cloudflare tunnel (anti-IP-trace of API origin).
  await applyTrafficTunnel(true);
  await setVpnPreferred(true);

  if (!profile.enabled || profile.provider === 'none') {
    return {
      ok: true,
      detail:
        'Túnel anti-censura activo: tráfico vía media.synapmsg.ai (IP del API no visible). WireGuard/Outline opcional cuando haya relay.',
    };
  }

  if (profile.provider === 'wireguard' && profile.config) {
    const encoded = encodeURIComponent(profile.config);
    const urls =
      Platform.OS === 'android'
        ? [
            `wireguard://import/${encoded}`,
            `https://synapmsg.ai/vpn/import?c=${encoded.slice(0, 1800)}`,
          ]
        : [`wireguard://import/${encoded}`];
    for (const url of urls) {
      try {
        const can = await Linking.canOpenURL(url);
        if (can) {
          await Linking.openURL(url);
          return {
            ok: true,
            detail: 'Túnel CF activo + abriendo WireGuard',
          };
        }
      } catch {
        /* try next */
      }
    }
    return {
      ok: true,
      detail:
        'Túnel CF activo. Instalá WireGuard para el relay adicional, o pedí el perfil a soporte.',
    };
  }

  if (profile.provider === 'outline' && profile.endpoint) {
    const url = `ssconf://${profile.endpoint}`;
    try {
      await Linking.openURL(url);
      return { ok: true, detail: 'Túnel CF activo + abriendo Outline' };
    } catch {
      return {
        ok: true,
        detail: 'Túnel CF activo. Outline no disponible en el dispositivo.',
      };
    }
  }

  return {
    ok: true,
    detail: `Túnel activo → ${API_BASE_URL} (antes ${DIRECT_API_BASE_URL})`,
  };
}

export async function deactivateVpn(): Promise<void> {
  await setVpnPreferred(false);
  await applyTrafficTunnel(false);
}

export const VPN_STATUS = {
  protocol: 'synap-tunnel-v1',
  antiCensorship: true,
  embeddedTunnel: true,
  tunnelHost: 'media.synapmsg.ai',
  note: 'Cloudflare Worker reverse-proxy hides Railway API IP; optional WG/Outline relays.',
} as const;
