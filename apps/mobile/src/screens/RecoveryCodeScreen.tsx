/**
 * Shown after signup / rotate — recovery passphrase (12 chars).
 * Stays open until the user confirms they wrote it on paper.
 * Hardware back leaves without confirming (Settings banner remains).
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ScrollView,
  BackHandler,
  Alert,
  Share,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import colors, { themed } from '../theme/colors';
import { fontSize, fontWeight, radius, spacing } from '../theme/spacing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../store/auth';
import { apiClient } from '../api/client';
import { STORAGE_KEYS, type RootStackParamList, type User } from '../types';

function formatGroupsOf4(raw: string): string {
  const n = raw.replace(/[\s\-]/g, '').toUpperCase();
  if (n.length < 12) return n || '————';
  return `${n.slice(0, 4)}-${n.slice(4, 8)}-${n.slice(8, 12)}`;
}

export function RecoveryCodeScreen(): JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList, 'RecoveryCode'>>();
  const code = useAuthStore((s) => s.pendingRecoveryCode);
  const clearPendingRecoveryCode = useAuthStore((s) => s.clearPendingRecoveryCode);
  const setUser = useAuthStore((s) => s.setUser);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const leaveWithoutConfirm = useCallback(() => {
    navigation.navigate('ChatList');
  }, [navigation]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      leaveWithoutConfirm();
      return true;
    });
    return () => sub.remove();
  }, [leaveWithoutConfirm]);

  const onConfirm = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const { data } = await apiClient.post<{ user: User }>('/auth/recovery/confirm');
      if (data?.user) setUser(data.user);
      await AsyncStorage.setItem(
        STORAGE_KEYS.RECOVERY_CONFIRMED_AT,
        new Date().toISOString(),
      );
      await clearPendingRecoveryCode();
      navigation.reset({ index: 0, routes: [{ name: 'ChatList' }] });
    } catch {
      setError('No se pudo confirmar. Revisá la conexión e intentá de nuevo.');
    } finally {
      setBusy(false);
    }
  }, [clearPendingRecoveryCode, navigation, setUser]);

  const onCopy = useCallback(() => {
    if (!code) return;
    Alert.alert(
      'Copiar no alcanza',
      'Copiarlo NO basta: hay que apuntarlo en papel. Si perdés el teléfono, la copia se va con él.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Copiar igual',
          onPress: () => {
            void Share.share({ message: code });
          },
        },
      ],
    );
  }, [code]);

  const display = code ? formatGroupsOf4(code) : '————';

  return (
    <ScrollView
      contentContainerStyle={[
        styles.root,
        {
          paddingTop: insets.top + spacing.lg,
          paddingBottom: insets.bottom + spacing.xxl,
        },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <Pressable
        onPress={leaveWithoutConfirm}
        hitSlop={12}
        style={styles.backRow}
        accessibilityRole="button"
        accessibilityLabel="Volver"
      >
        <Feather name="arrow-left" size={22} color={colors.textPrimary} />
      </Pressable>

      <Feather name="key" size={28} color={colors.accent} />
      <Text style={styles.title}>Tu código de recuperación</Text>
      <Text style={styles.code} selectable>
        {display}
      </Text>
      <Text style={styles.warn}>
        Apuntalo en papel. No lo guardes en el teléfono ni en una captura. Si
        perdés el teléfono, este código es la única forma de recuperar tu cuenta.
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={({ pressed }) => [
          styles.btn,
          pressed && styles.pressed,
          busy && styles.disabled,
        ]}
        disabled={busy || !code}
        onPress={() => {
          void onConfirm();
        }}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.btnLabel}>Ya lo escribí en papel</Text>
        )}
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.copyBtn, pressed && styles.pressed]}
        disabled={!code || busy}
        onPress={onCopy}
      >
        <Text style={styles.copyLabel}>Copiar (no alcanza: apuntá en papel)</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = themed((c) => ({
  root: {
    flexGrow: 1,
    backgroundColor: c.background,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
  },
  backRow: {
    alignSelf: 'flex-start',
    marginBottom: spacing.md,
    padding: spacing.xs,
  },
  title: {
    marginTop: spacing.lg,
    color: c.textPrimary,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  code: {
    marginTop: spacing.xl,
    color: c.accentDark,
    fontSize: 32,
    fontWeight: fontWeight.bold,
    letterSpacing: 3,
    fontVariant: ['tabular-nums'],
  },
  warn: {
    marginTop: spacing.xl,
    color: c.textPrimary,
    fontSize: fontSize.md,
    lineHeight: 22,
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
  },
  error: {
    marginTop: spacing.md,
    color: c.error,
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  btn: {
    marginTop: spacing.xxl,
    alignSelf: 'stretch',
    backgroundColor: c.accent,
    paddingVertical: spacing.lg,
    borderRadius: radius.lg,
    alignItems: 'center',
  },
  btnLabel: {
    color: '#fff',
    fontWeight: fontWeight.bold,
    fontSize: fontSize.lg,
  },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.6 },
  copyBtn: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
  },
  copyLabel: {
    color: c.textSecondary,
    fontSize: fontSize.sm,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
}));

export default RecoveryCodeScreen;
