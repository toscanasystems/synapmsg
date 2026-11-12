/**
 * Synapmsg — App entry point.
 * Single stack with conditional screens (more reliable touch + auth transitions).
 */

import React, { useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
  View,
  StyleSheet,
  LogBox,
  AppState,
  AppStateStatus,
  Linking,
  Alert,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  NavigationContainer,
  DefaultTheme,
  NavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import colors from './src/theme/colors';
import { useAuthStore } from './src/store/auth';
import { useChatsStore, registerWebSocketListener } from './src/store/chats';
import { useChatPrefsStore } from './src/store/chatPrefs';
import { useAppLockStore } from './src/store/appLock';
import { useHiddenChatsStore } from './src/store/hiddenChats';
import { RootStackParamList } from './src/types';
import wsManager from './src/api/websocket';
import { AppLockGate } from './src/components/AppLockGate';

import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { RegisterScreen } from './src/screens/RegisterScreen';
import { ChatListScreen } from './src/screens/ChatListScreen';
import { ChatScreen } from './src/screens/ChatScreen';
import { NewChatScreen } from './src/screens/NewChatScreen';
import { NewGroupScreen } from './src/screens/NewGroupScreen';
import { ContactsScreen } from './src/screens/ContactsScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { ToolsScreen } from './src/screens/ToolsScreen';
import { CallScreen } from './src/screens/CallScreen';
import { registerPushToken } from './src/notifications/push';
import { setupNotificationHandlers } from './src/notifications/setup';
import { usersApi } from './src/api/messages';
import { ensureE2eBundle, replenishPreKeysIfNeeded } from './src/crypto/e2eKeys';
import { publishKtlIfNeeded } from './src/crypto/ktlPublish';
import { hydrateGlossary } from './src/i18n/glossaryCache';
import { wipeLocalSecrets } from './src/security/localWipe';
import {
  getPinnedWipePubKey,
  pinWipePubKey,
  verifyRemoteWipe,
} from './src/security/wipeVerify';
import { API_BASE_URL } from './src/api/client';
import { assessDeviceRiskAsync } from './src/security/deviceGuard';
import { hydrateVpnRouting } from './src/security/vpnController';

LogBox.ignoreLogs(['Non-serializable values were found in the navigation state']);

const Stack = createNativeStackNavigator<RootStackParamList>();

function RootNavigator(): JSX.Element {
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const token = useAuthStore((s) => s.token);

  if (!isHydrated) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      {token ? (
        <>
          <Stack.Screen name="ChatList" component={ChatListScreen} />
          <Stack.Screen name="Chat" component={ChatScreen} />
          <Stack.Screen name="NewChat" component={NewChatScreen} />
          <Stack.Screen name="NewGroup" component={NewGroupScreen} />
          <Stack.Screen name="Contacts" component={ContactsScreen} />
          <Stack.Screen name="Tools" component={ToolsScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
          <Stack.Screen name="Call" component={CallScreen} />
        </>
      ) : (
        <>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={RegisterScreen} />
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}

export default function App(): JSX.Element {
  const hydrate = useAuthStore((s) => s.hydrate);
  const hydratePrefs = useChatPrefsStore((s) => s.hydrate);
  const hydrateLock = useAppLockStore((s) => s.hydrate);
  const hydrateHidden = useHiddenChatsStore((s) => s.hydrate);
  const duressTriggered = useAppLockStore((s) => s.duressTriggered);
  const clearDuressFlag = useAppLockStore((s) => s.clearDuressFlag);
  const logout = useAuthStore((s) => s.logout);
  const fetchChats = useChatsStore((s) => s.fetchChats);
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const unsubscribeWsRef = useRef<(() => void) | null>(null);
  const navRef = useRef<NavigationContainerRef<RootStackParamList>>(null);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    void (async () => {
      await hydrateVpnRouting();
      await hydrate();
      await hydratePrefs();
      await hydrateLock();
      await hydrateHidden();
      // Native enclave probe (root/Frida/StrongBox) — caches for mayDecryptE2e.
      void assessDeviceRiskAsync();
    })();
  }, [hydrate, hydratePrefs, hydrateLock, hydrateHidden]);

  // Fase 4 prove deep link: synapmsg://prove/phase4?pin=2468&duress=1357
  useEffect(() => {
    const run = (url: string | null) => {
      void import('./src/security/provePhase4').then(async (m) => {
        const parsed = m.parsePhase4ProveUrl(url);
        if (!parsed) return;
        // Wait for auth hydrate.
        for (let i = 0; i < 40; i++) {
          if (useAuthStore.getState().isHydrated) break;
          await new Promise((r) => setTimeout(r, 250));
        }
        await m.runPhase4Proof(parsed);
      });
    };
    void Linking.getInitialURL().then(run);
    const sub = Linking.addEventListener('url', (e) => run(e.url));
    return () => sub.remove();
  }, []);

  // Reconnect WS when returning to foreground (needed for incoming calls).
  useEffect(() => {
    const onChange = (next: AppStateStatus) => {
      const prev = appState.current;
      appState.current = next;
      if (
        (prev === 'background' || prev === 'inactive') &&
        next === 'active'
      ) {
        const t = useAuthStore.getState().token;
        if (t) {
          if (wsManager.getState() !== 'connected') {
            wsManager.reconnect(t);
          }
        }
      }
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    unsubscribeWsRef.current = registerWebSocketListener();
    return () => {
      unsubscribeWsRef.current?.();
      unsubscribeWsRef.current = null;
    };
  }, []);

  // Bootstrap wipe verifying key (pinned; silent key swap rejected).
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch(`${API_BASE_URL}/security/wipe-pubkey`);
        if (!r.ok || cancelled) return;
        const data = (await r.json()) as { pubKey?: string };
        if (data.pubKey && !cancelled) await pinWipePubKey(data.pubKey);
      } catch {
        /* offline — keep existing pin */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const unsub = wsManager.onMessage((msg) => {
      if (msg.type === 'remote_wipe') {
        void (async () => {
          const pinned = await getPinnedWipePubKey();
          if (!pinned || !verifyRemoteWipe(msg, pinned)) {
            console.warn('[wipe] rejected: missing pin or bad Ed25519 signature');
            return;
          }
          // Issuer keeps its session; other devices wipe.
          if (msg.issuerDeviceId) {
            const { getSignalDeviceId } = await import('./src/crypto/signalSession');
            const mine = await getSignalDeviceId();
            if (mine && mine === msg.issuerDeviceId) {
              console.log('[wipe] skipped on issuer device', mine);
              return;
            }
          }
          await wipeLocalSecrets();
          useChatsStore.getState().reset();
          await logout();
          Alert.alert(
            'Borrado remoto',
            'Este dispositivo fue vaciado por seguridad.',
          );
        })();
        return;
      }
      if (msg.type === 'dms_triggered') {
        // Wipe must arrive as signed remote_wipe (dmsScheduler). Never wipe unsigned.
        Alert.alert(
          'Dead Man Switch',
          msg.message ||
            (msg.ciphertext
              ? 'Acción cifrada disparada (payload en ciphertext).'
              : `Acción DMS: ${msg.action || 'notify'}`),
        );
        return;
      }
      if (msg.type !== 'call_invite' || !msg.chatId) return;
      const room =
        'callRoom' in msg && typeof msg.callRoom === 'string'
          ? msg.callRoom
          : undefined;
      void import('./src/notifications/incomingCall').then((m) =>
        m.alertIncomingCall({
          chatId: msg.chatId,
          callType: msg.callType === 'video' ? 'video' : 'voice',
          fromName: msg.fromName,
          callRoom: room,
        }),
      );
      navRef.current?.navigate('Call', {
        chatId: msg.chatId,
        contactName: msg.fromName || 'Llamada entrante',
        callType: msg.callType === 'video' ? 'video' : 'voice',
        incoming: true,
        callRoom: room,
      });
    });
    return unsub;
  }, [token, logout]);

  useEffect(() => {
    if (!duressTriggered) return;
    clearDuressFlag();
    useChatsStore.getState().reset();
    const pending = useAppLockStore.getState().takePendingDecoy();
    void (async () => {
      if (pending) {
        await useAuthStore.getState().adoptSession(pending.token, pending.user);
        await useChatsStore.getState().fetchChats();
        return;
      }
      await logout();
      Alert.alert(
        'Sesión cerrada',
        'Datos sensibles de este dispositivo fueron eliminados.',
      );
    })();
  }, [duressTriggered, clearDuressFlag, logout]);

  useEffect(() => {
    const unsubNotif = setupNotificationHandlers(() => navRef.current);
    return unsubNotif;
  }, []);

  // HTTP fallback: poll pending call invites (when peer WS is down).
  const lastInviteRef = useRef<string | null>(null);
  useEffect(() => {
    if (!token) return;
    let stopped = false;
    const tick = async () => {
      try {
        const { callsApi } = await import('./src/api/calls');
        const { pending, meOnline } = await callsApi.pending();
        if (!meOnline) wsManager.reconnect(token);
        if (stopped || !pending.length) return;
        const inv = pending[0]!;
        if (lastInviteRef.current === inv.id) return;
        lastInviteRef.current = inv.id;
        void import('./src/notifications/incomingCall').then((m) =>
          m.alertIncomingCall({
            chatId: inv.chatId,
            callType: inv.callType,
            fromName: inv.fromName,
            callRoom: inv.callRoom,
          }),
        );
        navRef.current?.navigate('Call', {
          chatId: inv.chatId,
          contactName: inv.fromName || 'Llamada entrante',
          callType: inv.callType === 'video' ? 'video' : 'voice',
          incoming: true,
          callRoom: inv.callRoom,
        });
      } catch {
        /* ignore */
      }
    };
    void tick();
    const id = setInterval(() => void tick(), 2500);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [token]);

  useEffect(() => {
    if (token) {
      // Force WS onto direct API (calls break if stuck on tunnel Worker).
      wsManager.reconnect(token);
      void fetchChats();
      void registerPushToken();
      void hydrateGlossary(true);
      // Fase 1: auto-register E2E, replenish OTKs, publish KTL if needed.
      void (async () => {
        try {
          let bundle = await ensureE2eBundle();
          await usersApi.registerE2eDevice(bundle);
          try {
            const devices = await usersApi.listE2eDevices();
            const mine = devices.find((d) => d.deviceId === bundle.deviceId);
            const replenished = await replenishPreKeysIfNeeded(
              mine?.preKeyCount ?? 0,
            );
            if (replenished) {
              await usersApi.registerE2eDevice(replenished);
              bundle = replenished;
            }
          } catch {
            /* prekey refresh non-fatal */
          }
          await publishKtlIfNeeded();
        } catch {
          /* non-fatal — user can retry from Settings */
        }
      })();
    }
  }, [token, fetchChats]);

  useEffect(() => {
    if (!token) return;

    const refreshAfterPay = async () => {
      try {
        const info = await usersApi.getPlan();
        if (user) {
          setUser({
            ...user,
            plan: info.plan,
            planExpiresAt: info.planExpiresAt,
            mediaBytesUsed: info.media.usedBytes,
            translationsToday: info.translations.usedToday,
          });
        }
        if (info.plan === 'premium') {
          Alert.alert('Premium', 'Tu plan Premium ya está activo.');
        }
      } catch {
        /* webhook may still be processing */
      }
    };

    const onUrl = (url: string) => {
      if (
        url.includes('billing/success') ||
        url.includes('billing-success')
      ) {
        void refreshAfterPay();
        navRef.current?.navigate('Settings');
      }
    };

    void Linking.getInitialURL().then((u) => {
      if (u) onUrl(u);
    });
    const sub = Linking.addEventListener('url', ({ url }) => onUrl(url));
    return () => sub.remove();
  }, [token, user, setUser]);

  const navTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: colors.background,
      card: colors.surface,
      text: colors.textPrimary,
      border: colors.border,
      primary: colors.accent,
    },
  };

  return (
    <SafeAreaProvider>
      <AppLockGate>
        <NavigationContainer ref={navRef} theme={navTheme}>
          <StatusBar style="light" />
          <RootNavigator />
        </NavigationContainer>
      </AppLockGate>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
