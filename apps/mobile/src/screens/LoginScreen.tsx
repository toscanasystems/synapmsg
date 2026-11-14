/**
 * Login — pantalla de entrada (UI limpia, español).
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuthStore } from '../store/auth';
import { mapAuthError } from '../api/authErrors';
import { AuthField, AuthPasswordToggle } from '../components/auth/AuthField';
import {
  AuthScreen,
  AuthPrimaryButton,
  AuthLinkRow,
} from '../components/auth/AuthScreen';
import colors, { themed } from '../theme/colors';
import { fontSize, spacing } from '../theme/spacing';
import { RootStackParamList } from '../types';

function envStr(key: string, fallback = ''): string {
  return String(process.env[key] ?? fallback).replace(/['"]/g, '');
}

export function LoginScreen(): JSX.Element {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList, 'Login'>>();

  const login = useAuthStore((s) => s.login);
  const isLoading = useAuthStore((s) => s.isLoading);
  const storeError = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);

  const [email, setEmail] = useState(() => envStr('EXPO_PUBLIC_AUTO_EMAIL'));
  const [password, setPassword] = useState(() =>
    envStr('EXPO_PUBLIC_AUTO_PASSWORD'),
  );
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const error = localError ?? storeError;

  const clearMessages = useCallback(() => {
    setLocalError(null);
    clearError();
  }, [clearError]);

  // If hydrate auto-login failed, one more silent attempt on mount.
  useEffect(() => {
    if (envStr('EXPO_PUBLIC_AUTO_LOGIN') !== '1') return;
    const e = envStr('EXPO_PUBLIC_AUTO_EMAIL');
    const p = envStr('EXPO_PUBLIC_AUTO_PASSWORD');
    if (!e || !p) return;
    void (async () => {
      try {
        await login({ email: e, password: p });
      } catch {
        /* show form */
      }
    })();
  }, [login]);

  const handleSubmit = useCallback(async () => {
    clearMessages();

    if (!email.trim()) {
      setLocalError('Ingresá tu correo o Private Number.');
      return;
    }
    if (!password) {
      setLocalError('Ingresá tu contraseña.');
      return;
    }

    try {
      await login({ email: email.trim(), password });
    } catch (err) {
      setLocalError(mapAuthError(err));
    }
  }, [email, password, login, clearMessages]);

  return (
    <AuthScreen
      title="Synap"
      subtitle="Escribí en tu idioma. Todos entienden."
      error={error}
      onDismissError={clearMessages}
      footer={
        <>
          <AuthLinkRow
            prompt="¿Perdiste el teléfono?"
            action="Recuperar con código"
            onPress={() => navigation.navigate('RecoverAccount')}
          />
          <AuthLinkRow
            prompt="¿No tenés cuenta?"
            action="Crear una"
            onPress={() => navigation.replace('Register')}
          />
        </>
      }
    >
      <AuthField
        label="Correo o Private Number"
        icon="mail"
        value={email}
        onChangeText={(t) => {
          setEmail(t);
          clearMessages();
        }}
        placeholder="tu@correo.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username"
        textContentType="username"
        editable={!isLoading}
        returnKeyType="next"
        error={Boolean(error && !email.trim())}
      />
      <Text style={styles.hint}>
        También podés entrar con tu Private Number de 10 dígitos.
      </Text>

      <AuthField
        label="Contraseña"
        icon="lock"
        value={password}
        onChangeText={(t) => {
          setPassword(t);
          clearMessages();
        }}
        placeholder="Tu contraseña"
        secureTextEntry={!showPassword}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="password"
        textContentType="password"
        editable={!isLoading}
        returnKeyType="go"
        onSubmitEditing={() => {
          void handleSubmit();
        }}
        error={Boolean(error && !password)}
        right={
          <AuthPasswordToggle
            visible={showPassword}
            onToggle={() => setShowPassword((v) => !v)}
          />
        }
      />

      <AuthPrimaryButton
        label="Entrar"
        loadingLabel="Entrando…"
        loading={isLoading}
        onPress={() => {
          void handleSubmit();
        }}
      />
    </AuthScreen>
  );
}

const styles = themed((colors) => ({
  hint: {
    color: colors.textMuted,
    fontSize: fontSize.caption,
    marginTop: -spacing.md,
    marginBottom: spacing.xl,
    marginLeft: spacing.xs,
  },
}));

export default LoginScreen;
