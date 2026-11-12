/**
 * Local ring notification when call_invite arrives over WS
 * (works even without Expo/FCM remote push).
 */

import { Platform, Vibration } from 'react-native';

export async function alertIncomingCall(opts: {
  chatId: string;
  callType?: 'voice' | 'video';
  fromName?: string;
  callRoom?: string;
}): Promise<void> {
  try {
    Vibration.vibrate([0, 400, 200, 400, 200, 400], false);
  } catch {
    /* ignore */
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Notifications = require('expo-notifications') as typeof import('expo-notifications');

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('calls', {
        name: 'Llamadas Synap',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 400, 200, 400],
        lightColor: '#30B0B0',
        sound: 'default',
        lockscreenVisibility:
          Notifications.AndroidNotificationVisibility.PUBLIC,
      });
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title:
          opts.callType === 'video'
            ? 'Videollamada entrante'
            : 'Llamada entrante',
        body: opts.fromName
          ? `${opts.fromName} te está llamando`
          : 'Abrí Synap para contestar',
        data: {
          type: 'call_invite',
          chatId: opts.chatId,
          callType: opts.callType || 'voice',
          callRoom: opts.callRoom,
          fromName: opts.fromName,
        },
        sound: true,
        ...(Platform.OS === 'android' ? { channelId: 'calls' } : {}),
      },
      trigger: null,
    });
  } catch {
    /* notifications optional */
  }
}
