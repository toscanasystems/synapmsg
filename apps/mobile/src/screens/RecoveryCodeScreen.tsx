/**
 * Shown once after signup — recovery passphrase (12 chars).
 * User must confirm "Ya lo apunté" before entering the app.
 */

import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import colors, { themed } from '../theme/colors';
import { fontSize, fontWeight, radius, spacing } from '../theme/spacing';
import { useAuthStore } from '../store/auth';
import { apiClient } from '../api/client';
import type { RootStackParamList, User } from '../types';

export function RecoveryCodeScreen(): JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList, 'RecoveryCode'>>();
  const code = useAuthStore((s) => s.pendingRecoveryCode);
  const clearPendingRecoveryCode = useAuthStore((s) => s.clearPendingRecoveryCode);
  const setUser = useAuthStore((s) => s.setUser);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onConfirm = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const { data } = await apiClient.post<{ user: User }>('/auth/recovery/confirm');
      if (data?.user) setUser(data.user);
      await clearPendingRecoveryCode();
    } catch {
      setError('No se pudo confirmar. Revisá la conexión e intentá de nuevo.');
    } finally {
      setBusy(false);
    }
  }, [clearPendingRecoveryCode, setUser]);

  const display = code
    ? `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}`
    : '————';

  return (
    <ScrollView
      contentContainerStyle={[
        styles.root,
        {
          paddingTop: insets.top + spacing.xxl,
          paddingBottom: insets.bottom + spacing.xxl,
        },
      ]}
    >
      <Feather name="key" size={28} color={colors.accent} />
      <Text style={styles.title}>Tu código de recuperación</Text>
      <Text style={styles.code}>{display}</Text>
      <Text style={styles.warn}>
        Apúntalo en papel. No lo guardes en el teléfono ni en una captura. Si
        pierdes el teléfono, este código es la única forma de recuperar tu cuenta.
      </Text>
      <Text style={styles.hint}>
        Tus conversaciones anteriores no se pueden recuperar si pierdes el
        teléfono: están cifradas en el aparato.
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
          <Text style={styles.btnLabel}>Ya lo apunté</Text>
        )}
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.laterBtn, pressed && styles.pressed]}
        disabled={busy}
        onPress={() => {
          navigation.navigate('ChatList');
        }}
      >
        <Text style={styles.laterLabel}>Lo apunto después</Text>
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
    fontSize: 28,
    fontWeight: fontWeight.bold,
    letterSpacing: 2,
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
  hint: {
    marginTop: spacing.md,
    color: c.textSecondary,
    fontSize: fontSize.sm,
    lineHeight: 20,
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
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    alignItems: 'center',
  },
  btnLabel: {
    color: '#fff',
    fontWeight: fontWeight.bold,
    fontSize: fontSize.md,
  },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.6 },
  laterBtn: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
  },
  laterLabel: {
    color: c.textSecondary,
    fontSize: fontSize.sm,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
}));

export default RecoveryCodeScreen;
