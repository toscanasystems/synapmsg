/**
 * First open without a session.
 * Never auto-creates an account — that wiped real users onto a new number.
 */

import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import colors, { themed } from '../theme/colors';
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

  const runBootstrap = useCallback(async () => {
    setError(null);
    try {
      await bootstrap();
    } catch (err) {
      setError(mapAuthError(err));
    }
  }, [bootstrap]);

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
          Si ya tenías cuenta, no crees otra. Recuperá con tu código de 12
          caracteres del papel — es la única forma de volver al mismo número.
        </Text>
      </View>

      <Text style={styles.hint}>
        Cuenta nueva: te asignamos un número de 10 dígitos. No es un teléfono ni
        una SIM.
      </Text>

      {isLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.loadingText}>Creando tu cuenta…</Text>
        </View>
      ) : null}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Pressable
        style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
        disabled={isLoading}
        onPress={() => navigation.navigate('RecoverAccount')}
      >
        <Text style={styles.primaryLabel}>Recuperar con mi código</Text>
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
        disabled={isLoading}
        onPress={() => {
          void runBootstrap();
        }}
      >
        <Text style={styles.secondaryLabel}>Crear cuenta nueva</Text>
      </Pressable>

      <View style={styles.footer}>
        <Pressable
          onPress={() => navigation.navigate('Login')}
          hitSlop={8}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Text style={styles.link}>Ya tengo cuenta — entrar</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = themed((colors) => ({
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
    marginBottom: spacing.md,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  errorText: {
    color: colors.error,
    fontSize: fontSize.sm,
    marginBottom: spacing.md,
  },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  primaryLabel: {
    color: '#000',
    fontWeight: fontWeight.semibold,
    fontSize: fontSize.md,
  },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  secondaryLabel: {
    color: colors.textPrimary,
    fontWeight: fontWeight.semibold,
    fontSize: fontSize.md,
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
}));
