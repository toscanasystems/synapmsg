/**
 * Notification display + tap → navigate to Chat / Call.
 */

import { Platform } from 'react-native';
import type { NavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from '../types';

type Nav = NavigationContainerRef<RootStackParamList> | null;

let responseSub: { remove: () => void } | null = null;

export function setupNotificationHandlers(getNav: () => Nav): () => void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Notifications = require('expo-notifications') as typeof import('expo-notifications');

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });

    if (Platform.OS === 'android') {
      void Notifications.setNotificationChannelAsync('default', {
        name: 'Synap',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#30B0B0',
      });
      void Notifications.setNotificationChannelAsync('calls', {
        name: 'Llamadas Synap',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 400, 200, 400],
        lightColor: '#30B0B0',
        sound: 'default',
      });
    }

    responseSub?.remove();
    responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as {
        type?: string;
        chatId?: string;
        callType?: string;
        callRoom?: string;
        fromName?: string;
      };
      const nav = getNav();
      if (!nav || !data?.chatId) return;

      if (data.type === 'call_invite') {
        nav.navigate('Call', {
          chatId: data.chatId,
          contactName: data.fromName || 'Llamada entrante',
          callType: data.callType === 'video' ? 'video' : 'voice',
          incoming: true,
          callRoom: data.callRoom,
        });
        return;
      }

      if (data.type === 'message') {
        nav.navigate('Chat', { chatId: data.chatId });
      }
    });

    return () => {
      responseSub?.remove();
      responseSub = null;
    };
  } catch {
    return () => undefined;
  }
}
