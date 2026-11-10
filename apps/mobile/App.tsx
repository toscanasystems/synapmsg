/**
 * Synapmsg — App entry point.
 *
 * Wires up:
 *   • SafeAreaProvider (for insets)
 *   • NavigationContainer + native-stack navigator
 *   • Auth hydration on mount (reads JWT from AsyncStorage)
 *   • Global WebSocket message listener (forwards inbound messages to the chats store)
 *   • Initial route selection: Onboarding when unauthenticated, ChatList when authenticated.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import colors from './src/theme/colors';
import { useAuthStore } from './src/store/auth';
import { useChatsStore, registerWebSocketListener } from './src/store/chats';
import { RootStackParamList } from './src/types';

import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { RegisterScreen } from './src/screens/RegisterScreen';
import { ChatListScreen } from './src/screens/ChatListScreen';
import { ChatScreen } from './src/screens/ChatScreen';
import { NewChatScreen } from './src/screens/NewChatScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Decide which screen the app should boot into based on auth state.
 *   • Not hydrated yet     → splash loader
 *   • Has token            → ChatList (main app)
 *   • No token             → Onboarding
 *
 * We `replace` rather than `navigate` so the back button can't drop the
 * user back to the auth flow.
 */
function useInitialRoute(): keyof RootStackParamList | null {
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const token = useAuthStore((s) => s.token);

  if (!isHydrated) return null;
  return token ? 'ChatList' : 'Onboarding';
}

function RootNavigator(): JSX.Element {
  const initialRoute = useInitialRoute();

  // Watch for logout while inside the app (e.g. 401 auto-logout).
  // We use a controlled key on the navigator so that when the token
  // disappears we re-mount the stack from the onboarding screen.
  const token = useAuthStore((s) => s.token);
  const navigatorKey = useMemo(() => `root-${token ? 'authed' : 'guest'}`, [token]);

  if (!initialRoute) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <Stack.Navigator
      key={navigatorKey}
      initialRouteName={initialRoute}
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="ChatList" component={ChatListScreen} />
      <Stack.Screen name="Chat" component={ChatScreen} />
      <Stack.Screen name="NewChat" component={NewChatScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
    </Stack.Navigator>
  );
}

export default function App(): JSX.Element {
  const hydrate = useAuthStore((s) => s.hydrate);
  const fetchChats = useChatsStore((s) => s.fetchChats);
  const token = useAuthStore((s) => s.token);
  const unsubscribeWsRef = useRef<(() => void) | null>(null);

  // Kick off hydration exactly once on mount.
  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // Register the WS listener exactly once (the helper is idempotent).
  useEffect(() => {
    unsubscribeWsRef.current = registerWebSocketListener();
    return () => {
      unsubscribeWsRef.current?.();
      unsubscribeWsRef.current = null;
    };
  }, []);

  // After login, pull the chat list once.
  useEffect(() => {
    if (token) {
      void fetchChats();
    }
  }, [token, fetchChats]);

  // Light theme based on Synapmsg palette.
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
      <NavigationContainer theme={navTheme}>
        <StatusBar style="dark" />
        <RootNavigator />
      </NavigationContainer>
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
