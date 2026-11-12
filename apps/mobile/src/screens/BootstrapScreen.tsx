/**
 * First open without a session: create anonymous account (server Private Number).
 * Email is optional later in Settings.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import colors from '../theme/colors';
import { fontSize, fontWeight, radius, spacing } from '../theme/spacing';
import { useAuthStore } from '../store/auth';
import { mapAuthError } from '../api/authErrors';
import { RootStackParamList } from '../types';

export function BootstrapScreen(): JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList, 'Bootstrap'>>();
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const isLoading = useAuthStore((s) => s.isLoading);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const runBootstrap = useCallback(async () => {
    setError(null);
    try {
      await bootstrap();
    } catch (err) {
      setError(mapAuthError(err));
    }
  }, [bootstrap]);

  // Create the account on first open — no email/phone form.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void runBootstrap();
  }, [runBootstrap]);

  return (
    <View
      style={[
        styles.root,
        {
          paddingTop: insets.top + spacing.xxl,
          paddingBottom: insets.bottom + spacing.xxl,
        },
      ]}
    >
      <Text style={styles.brand}>Synap</Text>

      <View style={styles.warningBox}>
        <Feather name="alert-triangle" size={22} color={colors.warning ?? '#F5A623'} />
        <Text style={styles.warningText}>
          Si pierdes este teléfono y no agregaste un correo, no podrás recuperar la
          cuenta.
        </Text>
      </View>

      <Text style={styles.hint}>
        Te asignamos un número de 10 dígitos para que te encuentren. No es un
        teléfono ni una SIM.
      </Text>

      {isLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.loadingText}>Creando tu cuenta…</Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            style={({ pressed }) => [styles.retryBtn, pressed && styles.pressed]}
            onPress={() => {
              void runBootstrap();
            }}
          >
            <Text style={styles.retryLabel}>Reintentar</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.footer}>
        <Pressable
          onPress={() => navigation.navigate('Login')}
          hitSlop={8}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Text style={styles.link}>Ya tengo correo — entrar</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xl,
  },
  brand: {
    color: colors.accent,
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.xl,
  },
  warningBox: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  warningText: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: fontSize.md,
    lineHeight: 22,
    fontWeight: fontWeight.semibold,
  },
  hint: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    lineHeight: 20,
    marginBottom: spacing.xl,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  errorBox: {
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  errorText: {
    color: colors.error,
    fontSize: fontSize.sm,
  },
  retryBtn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  retryLabel: {
    color: '#fff',
    fontWeight: fontWeight.semibold,
  },
  footer: {
    marginTop: 'auto',
    alignItems: 'center',
  },
  link: {
    color: colors.accent,
    fontSize: fontSize.sm,
  },
  pressed: {
    opacity: 0.7,
  },
});
