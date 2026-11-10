/**
 * RegisterScreen — sign-up form.
 *
 * Fields:
 *   Name, Email, Username (with @ prefix), Password, Confirm Password
 *   Preferred Language dropdown
 *
 * Validation:
 *   • All required fields present
 *   • Email format
 *   • Password ≥ 6 chars, matches confirm
 *   • Username trimmed
 *
 * On success → auth store sets the token → App.tsx redirects to ChatList.
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
  Modal,
  FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import colors from '../theme/colors';
import { fontSize, fontWeight, radius, spacing } from '../theme/spacing';
import { useAuthStore } from '../store/auth';
import { LANGUAGES, LanguageCode, RootStackParamList } from '../types';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function RegisterScreen(): JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList, 'Register'>>();

  const register = useAuthStore((s) => s.register);
  const isLoading = useAuthStore((s) => s.isLoading);
  const storeError = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [preferredLanguage, setPreferredLanguage] =
    useState<LanguageCode>('es');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const error = localError ?? storeError;

  const handleSubmit = useCallback(async () => {
    setLocalError(null);
    clearError();

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanUsername = username.trim().replace(/^@/, '');
    const cleanPassword = password;

    if (!cleanName) return setLocalError('Name is required.');
    if (!cleanUsername) return setLocalError('Username is required.');
    if (!EMAIL_REGEX.test(cleanEmail)) return setLocalError('Enter a valid email address.');
    if (cleanPassword.length < 6) return setLocalError('Password must be at least 6 characters.');
    if (cleanPassword !== confirmPassword) return setLocalError('Passwords do not match.');

    try {
      await register({
        name: cleanName,
        username: cleanUsername,
        email: cleanEmail,
        password: cleanPassword,
        preferredLanguage,
      });
      // App.tsx watches auth.token — navigation handled there.
    } catch {
      // store error already populated
    }
  }, [name, email, username, password, confirmPassword, preferredLanguage, register, clearError]);

  const goToLogin = () => navigation.replace('Login');

  const selectedLang = LANGUAGES.find((l) => l.code === preferredLanguage)!;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: insets.top + spacing.xxl,
            paddingBottom: insets.bottom + spacing.xxxl,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerWrap}>
          <Pressable onPress={goToLogin} hitSlop={8} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.title}>Create your account</Text>
        </View>

        <View style={styles.form}>
          {/* Name */}
          <View style={styles.field}>
            <Feather name="user" size={18} color={colors.textSecondary} style={styles.fieldIcon} />
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Full name"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="words"
              textContentType="name"
              style={styles.input}
              editable={!isLoading}
            />
          </View>

          {/* Email */}
          <View style={styles.field}>
            <Feather name="mail" size={18} color={colors.textSecondary} style={styles.fieldIcon} />
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

          {/* Username */}
          <View style={styles.field}>
            <Text style={styles.atPrefix}>@</Text>
            <TextInput
              value={username}
              onChangeText={setUsername}
              placeholder="username"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="username"
              style={styles.input}
              editable={!isLoading}
            />
          </View>

          {/* Password */}
          <View style={styles.field}>
            <Feather name="lock" size={18} color={colors.textSecondary} style={styles.fieldIcon} />
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Password (6+ characters)"
              placeholderTextColor={colors.textSecondary}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="newPassword"
              style={styles.input}
              editable={!isLoading}
            />
            <Pressable
              onPress={() => setShowPassword((v) => !v)}
              hitSlop={8}
              style={styles.eyeButton}
            >
              <Feather
                name={showPassword ? 'eye-off' : 'eye'}
                size={18}
                color={colors.textSecondary}
              />
            </Pressable>
          </View>

          {/* Confirm password */}
          <View style={styles.field}>
            <Feather name="lock" size={18} color={colors.textSecondary} style={styles.fieldIcon} />
            <TextInput
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Confirm password"
              placeholderTextColor={colors.textSecondary}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="newPassword"
              style={styles.input}
              editable={!isLoading}
            />
          </View>

          {/* Preferred Language picker */}
          <Pressable
            style={styles.field}
            onPress={() => setPickerOpen(true)}
            disabled={isLoading}
          >
            <Text style={styles.flag}>{selectedLang.flag}</Text>
            <Text style={styles.pickerLabel}>{selectedLang.label}</Text>
            <Feather
              name="chevron-down"
              size={18}
              color={colors.textSecondary}
              style={styles.chevron}
            />
          </Pressable>

          {error ? (
            <View style={styles.errorBanner}>
              <Feather name="alert-circle" size={16} color={colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Pressable
            style={({ pressed }) => [
              styles.submit,
              pressed && styles.submitPressed,
              isLoading && styles.submitDisabled,
            ]}
            onPress={handleSubmit}
            disabled={isLoading}
          >
            <Text style={styles.submitText}>
              {isLoading ? 'Creating account…' : 'Create Account'}
            </Text>
          </Pressable>

          <Pressable onPress={goToLogin} hitSlop={8} style={styles.linkWrap}>
            <Text style={styles.link}>
              Already have an account?{' '}
              <Text style={styles.linkBold}>Login</Text>
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Language picker modal */}
      <Modal
        visible={pickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerOpen(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setPickerOpen(false)}>
          <Pressable
            style={[styles.modalCard, { marginBottom: insets.bottom + spacing.md }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select your language</Text>
            </View>
            <FlatList
              data={LANGUAGES}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => (
                <Pressable
                  style={[
                    styles.optionRow,
                    item.code === preferredLanguage && styles.optionRowActive,
                  ]}
                  onPress={() => {
                    setPreferredLanguage(item.code);
                    setPickerOpen(false);
                  }}
                >
                  <Text style={styles.optionFlag}>{item.flag}</Text>
                  <Text style={styles.optionLabel}>{item.label}</Text>
                  {item.code === preferredLanguage ? (
                    <Feather name="check" size={18} color={colors.accent} />
                  ) : null}
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, paddingHorizontal: spacing.xxl },
  headerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.xxl,
  },
  backBtn: { padding: spacing.xs },
  title: {
    color: colors.textPrimary,
    fontSize: fontSize.h2,
    fontWeight: fontWeight.bold,
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
  atPrefix: {
    color: colors.textSecondary,
    fontSize: fontSize.bodyLg,
    marginRight: spacing.xs,
    fontWeight: fontWeight.semibold,
  },
  input: {
    flex: 1,
    paddingVertical: spacing.lg,
    color: colors.textPrimary,
    fontSize: 16,
  },
  eyeButton: { padding: spacing.sm },
  flag: { fontSize: fontSize.h3, marginRight: spacing.md },
  pickerLabel: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: fontSize.bodyLg,
    paddingVertical: spacing.lg,
  },
  chevron: { marginLeft: 'auto' },
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
  // Modal styles
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlay,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    maxHeight: '70%',
  },
  modalHeader: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  modalTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.title,
    fontWeight: fontWeight.semibold,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  optionRowActive: {
    backgroundColor: colors.badgeBackground,
    borderRadius: radius.md,
  },
  optionFlag: {
    fontSize: fontSize.h3,
    marginRight: spacing.lg,
  },
  optionLabel: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: fontSize.bodyLg,
  },
});

export default RegisterScreen;
