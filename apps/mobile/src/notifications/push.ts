/**
 * Push token registration (base FCM/Expo).
 * Guarda el token en /users/me para notificaciones futuras.
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { usersApi } from '../api/messages';

let registered = false;

export async function registerPushToken(): Promise<void> {
  if (registered) return;
  try {
    // Lazy require so builds without native module still load JS.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Notifications = require('expo-notifications') as typeof import('expo-notifications');

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Synap',
        importance: Notifications.AndroidImportance.MAX,
      });
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (existing !== 'granted') {
      const asked = await Notifications.requestPermissionsAsync();
      status = asked.status;
    }
    if (status !== 'granted') return;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;
    const tokenResponse = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();

    const token = tokenResponse.data;
    if (!token) return;

    await usersApi.updateMe({ pushToken: token });
    registered = true;
  } catch {
    // Push is best-effort in beta; never block chat.
  }
}
