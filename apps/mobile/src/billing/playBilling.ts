/**
 * Google Play Billing scaffold.
 * Full IAP (react-native-iap / RevenueCat) only works when the APK is
 * distributed via Play Store with a published subscription product.
 * Sideloaded APKs must use Stripe Checkout instead.
 */

import { Linking, Platform } from 'react-native';

export const PLAY_PRODUCT_ID =
  process.env.EXPO_PUBLIC_PLAY_PRODUCT_ID || 'synapmsg_premium_monthly';

export function isPlayBillingLikelyAvailable(): boolean {
  return (
    Platform.OS === 'android' &&
    Boolean(process.env.EXPO_PUBLIC_PLAY_BILLING_ENABLED === '1')
  );
}

/** Opens Play Store listing when published; no-op helper for now. */
export async function openPlayStoreListing(): Promise<void> {
  const pkg = 'com.synapmsg.app';
  const market = `market://details?id=${pkg}`;
  const web = `https://play.google.com/store/apps/details?id=${pkg}`;
  try {
    const can = await Linking.canOpenURL(market);
    await Linking.openURL(can ? market : web);
  } catch {
    await Linking.openURL(web);
  }
}
