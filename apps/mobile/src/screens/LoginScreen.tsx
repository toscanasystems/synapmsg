/**
 * LoginScreen — email + password form.
 *
 * Layout:
 *   • Synapmsg wordmark (mint green, bold)
 *   • Email field (with mail icon)
 *   • Password field (with lock icon + show/hide toggle)
 *   • "Login" button (full width, mint green)
 *   • "Don't have an account? Sign up" link → Register
 *
 * Loading state: spinner inside button + disabled fields.
 * Error display: red text banner above the button.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import colors from '../theme/colors';
import { fontSize, fontWeight, radius, spacing } from '../theme/spacing';
import { useAuthStore } from '../store/auth';
import { RootStackParamList } from '../types';

export function LoginScreen(): JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList, 'Login'>>();

  const login = useAuthStore((s) => s.login);
  const isLoading = useAuthStore((s) => s.isLoading);
  const storeError = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const error = localError ?? storeError;

  const handleSubmit = useCallback(async () => {
    setLocalError(null);
    clearError();
    if (!email.trim() || !password) {
      setLocalError('Please enter your email and password.');
      return;
    }
    try {
      await login({ email: email.trim(), password });
      // App.tsx watches auth.token — navigation is handled there.
    } catch {
      // store error already populated
    }
  }, [email, password, login, clearError]);

  const goToRegister = () => navigation.replace('Register');

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + spacing.xxxl, paddingBottom: insets.bottom + spacing.xxxl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logoWrap}>
          <Text style={styles.logo}>Synapmsg</Text>
          <Text style={styles.tagline}>Speak your language. Everyone listens.</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.field}>
            <Feather
              name="mail"
              size={18}
              color={colors.textSecondary}
              style={styles.fieldIcon}
            />
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
              placeholderTextColor={colors.textSecondary}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="emailAddress"
              style={styles.input}
              editable={!isLoading}
            />
          </View>

          <View style={styles.field}>
            <Feather
              name="lock"
              size={18}
              color={colors.textSecondary}
              style={styles.fieldIcon}
            />
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor={colors.textSecondary}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="password"
              style={styles.input}
              editable={!isLoading}
            />
            <Pressable
              onPress={() => setShowPassword((v) => !v)}
              hitSlop={8}
              style={styles.eyeButton}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            >
              <Feather
                name={showPassword ? 'eye-off' : 'eye'}
                size={18}
                color={colors.textSecondary}
              />
            </Pressable>
          </View>

          {error ? (
            <View style={styles.errorBanner}>
              <Feather name="alert-circle" size={16} color={colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Pressable
            style={({ pressed }) => [styles.submit, pressed && styles.submitPressed, isLoading && styles.submitDisabled]}
            onPress={handleSubmit}
            disabled={isLoading}
          >
            {isLoading ? (
              <Text style={styles.submitText}>Signing in…</Text>
            ) : (
              <Text style={styles.submitText}>Login</Text>
            )}
          </Pressable>

          <Pressable onPress={goToRegister} hitSlop={8} style={styles.linkWrap}>
            <Text style={styles.link}>
              Don't have an account?{' '}
              <Text style={styles.linkBold}>Sign up</Text>
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, paddingHorizontal: spacing.xxl },
  logoWrap: { alignItems: 'center', marginBottom: spacing.xxxl },
  logo: {
    color: colors.accent,
    fontSize: fontSize.hero,
    fontWeight: fontWeight.bold,
    letterSpacing: -1,
  },
  tagline: {
    color: colors.textSecondary,
    fontSize: fontSize.body,
    marginTop: spacing.sm,
  },
  form: { width: '100%' },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  fieldIcon: { marginRight: spacing.md },
  input: {
    flex: 1,
    paddingVertical: spacing.lg,
    color: colors.textPrimary,
    fontSize: 16, // iOS hates <16 in TextInputs (zooms on focus)
  },
  eyeButton: { padding: spacing.sm },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(192, 57, 43, 0.08)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
  },
  errorText: {
    color: colors.error,
    fontSize: fontSize.caption,
    flex: 1,
  },
  submit: {
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  submitPressed: { opacity: 0.85 },
  submitDisabled: { opacity: 0.6 },
  submitText: {
    color: colors.textInverse,
    fontSize: fontSize.bodyLg,
    fontWeight: fontWeight.semibold,
  },
  linkWrap: { alignItems: 'center', marginTop: spacing.xl },
  link: {
    color: colors.textSecondary,
    fontSize: fontSize.body,
  },
  linkBold: {
    color: colors.accent,
    fontWeight: fontWeight.semibold,
  },
});

export default LoginScreen;
