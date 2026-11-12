/**
 * Pantalla de bloqueo PIN / biometría.
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import colors, { themed } from '../theme/colors';
import { fontSize, fontWeight, radius, spacing } from '../theme/spacing';
import { useAppLockStore } from '../store/appLock';

export function AppLockGate({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  const insets = useSafeAreaInsets();
  const hydrated = useAppLockStore((s) => s.hydrated);
  const enabled = useAppLockStore((s) => s.enabled);
  const unlocked = useAppLockStore((s) => s.unlocked);
  const bioEnabled = useAppLockStore((s) => s.bioEnabled);
  const unlockWithPin = useAppLockStore((s) => s.unlockWithPin);
  const unlockWithBiometrics = useAppLockStore((s) => s.unlockWithBiometrics);

  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!hydrated || !enabled || unlocked || !bioEnabled) return;
    void unlockWithBiometrics();
  }, [hydrated, enabled, unlocked, bioEnabled, unlockWithBiometrics]);

  if (!hydrated || !enabled || unlocked) {
    return <>{children}</>;
  }

  const tryPin = async () => {
    setBusy(true);
    setError('');
    const result = await unlockWithPin(pin);
    setBusy(false);
    if (result === 'bad') {
      setError('PIN incorrecto');
      setPin('');
    }
    // 'duress' unlocks into wiped/decoy state — App handles logout.
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.xxl }]}>
      <Feather name="lock" size={40} color={colors.accent} />
      <Text style={styles.title}>Synap bloqueado</Text>
      <Text style={styles.sub}>Ingresa tu PIN para continuar</Text>
      <TextInput
        value={pin}
        onChangeText={(t) => setPin(t.replace(/\D/g, '').slice(0, 8))}
        keyboardType="number-pad"
        secureTextEntry
        style={styles.input}
        placeholder="••••"
        placeholderTextColor={colors.textSecondary}
        maxLength={8}
        onSubmitEditing={() => void tryPin()}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable
        style={styles.btn}
        onPress={() => void tryPin()}
        disabled={busy || pin.length < 4}
      >
        {busy ? (
          <ActivityIndicator color={colors.textInverse} />
        ) : (
          <Text style={styles.btnText}>Desbloquear</Text>
        )}
      </Pressable>
      {bioEnabled ? (
        <Pressable
          style={styles.bioBtn}
          onPress={() => void unlockWithBiometrics()}
        >
          <Feather name="smartphone" size={18} color={colors.accent} />
          <Text style={styles.bioText}>Usar biometría</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = themed((colors) => ({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  root: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
  },
  title: {
    marginTop: spacing.xl,
    color: colors.textPrimary,
    fontSize: fontSize.title,
    fontWeight: fontWeight.bold,
  },
  sub: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    fontSize: fontSize.body,
    marginBottom: spacing.xl,
  },
  input: {
    width: '100%',
    textAlign: 'center',
    letterSpacing: 8,
    fontSize: 28,
    color: colors.textPrimary,
    backgroundColor: colors.inputBackground,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    marginBottom: spacing.md,
  },
  error: {
    color: colors.error,
    marginBottom: spacing.md,
  },
  btn: {
    width: '100%',
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  btnText: {
    color: colors.textInverse,
    fontWeight: fontWeight.bold,
    fontSize: fontSize.bodyLg,
  },
  bioBtn: {
    marginTop: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  bioText: {
    color: colors.accent,
    fontWeight: fontWeight.semibold,
  },
}));

export default AppLockGate;
