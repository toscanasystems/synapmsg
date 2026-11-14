/**
 * Recover account with the 12-char paper code → same Private Number.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import colors, { themed } from '../theme/colors';
import { fontSize, fontWeight, radius, spacing } from '../theme/spacing';
import { useAuthStore } from '../store/auth';
import { mapAuthError } from '../api/authErrors';
import { RootStackParamList } from '../types';

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function normalizeCode(raw: string): string {
  return raw.replace(/[\s\-]/g, '').toUpperCase();
}

function formatCode(raw: string): string {
  const n = normalizeCode(raw).slice(0, 12);
  const parts: string[] = [];
  for (let i = 0; i < n.length; i += 4) parts.push(n.slice(i, i + 4));
  return parts.join('-');
}

function isValidCode(raw: string): boolean {
  const n = normalizeCode(raw);
  if (n.length !== 12) return false;
  for (const ch of n) {
    if (!ALPHABET.includes(ch)) return false;
  }
  return true;
}

export function RecoverAccountScreen(): JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList, 'RecoverAccount'>>();
  const recoverWithCode = useAuthStore((s) => s.recoverWithCode);
  const isLoading = useAuthStore((s) => s.isLoading);

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const valid = useMemo(() => isValidCode(code), [code]);

  const onSubmit = useCallback(async () => {
    setError(null);
    if (!valid) {
      setError('El código debe tener 12 caracteres. Revisá el papel.');
      return;
    }
    try {
      await recoverWithCode(normalizeCode(code));
      // RootNavigator switches to ChatList when token is set.
    } catch (err) {
      setError(mapAuthError(err));
    }
  }, [code, recoverWithCode, valid]);

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
      <Pressable
        onPress={() => navigation.goBack()}
        hitSlop={12}
        style={styles.back}
      >
        <Feather name="arrow-left" size={22} color={colors.textPrimary} />
      </Pressable>

      <Text style={styles.brand}>Recuperar cuenta</Text>
      <Text style={styles.hint}>
        Escribí el código de 12 caracteres del papel. Conservás el mismo número.
        Las conversaciones del teléfono perdido no vuelven.
      </Text>

      <Text style={styles.label}>Código</Text>
      <TextInput
        value={code}
        onChangeText={(t) => setCode(formatCode(t))}
        placeholder="XXXX-XXXX-XXXX"
        placeholderTextColor={colors.textSecondary}
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        spellCheck={false}
        maxLength={14}
        style={styles.input}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={({ pressed }) => [
          styles.btn,
          (!valid || isLoading) && styles.btnDisabled,
          pressed && styles.pressed,
        ]}
        disabled={!valid || isLoading}
        onPress={() => {
          void onSubmit();
        }}
      >
        {isLoading ? (
          <ActivityIndicator color="#000" />
        ) : (
          <Text style={styles.btnLabel}>Recuperar mi número</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = themed((colors) => ({
  root: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xl,
  },
  back: { marginBottom: spacing.lg, alignSelf: 'flex-start' },
  brand: {
    color: colors.accent,
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.md,
  },
  hint: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    lineHeight: 20,
    marginBottom: spacing.xl,
  },
  label: {
    color: colors.textPrimary,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: colors.textPrimary,
    fontSize: fontSize.lg,
    letterSpacing: 2,
    textAlign: 'center',
  },
  error: {
    color: colors.error,
    fontSize: fontSize.sm,
    marginTop: spacing.md,
  },
  btn: {
    marginTop: spacing.xl,
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.5 },
  btnLabel: {
    color: '#000',
    fontWeight: fontWeight.semibold,
    fontSize: fontSize.md,
  },
  pressed: { opacity: 0.85 },
}));

export default RecoverAccountScreen;
