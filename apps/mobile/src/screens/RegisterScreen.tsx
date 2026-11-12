/**
 * Register — crear cuenta (UI limpia, español).
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { useAuthStore } from '../store/auth';
import { mapAuthError } from '../api/authErrors';
import { AuthField, AuthPasswordToggle } from '../components/auth/AuthField';
import {
  AuthScreen,
  AuthPrimaryButton,
  AuthLinkRow,
} from '../components/auth/AuthScreen';
import colors from '../theme/colors';
import { fontSize, fontWeight, radius, spacing } from '../theme/spacing';
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
  const [usernameTouched, setUsernameTouched] = useState(false);

  const error = localError ?? storeError;
  const selectedLang =
    LANGUAGES.find((l) => l.code === preferredLanguage) ?? LANGUAGES[0]!;

  const clearMessages = useCallback(() => {
    setLocalError(null);
    clearError();
  }, [clearError]);

  const handleSubmit = useCallback(async () => {
    clearMessages();

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanUsername = username.trim().replace(/^@/, '').toLowerCase();
    const cleanPassword = password;

    if (!cleanName) return setLocalError('Ingresá tu nombre.');
    if (!EMAIL_REGEX.test(cleanEmail)) {
      return setLocalError('Ingresá un correo válido.');
    }
    if (!cleanUsername) return setLocalError('Ingresá un nombre de usuario.');
    if (!/^[a-z0-9_]{3,24}$/.test(cleanUsername)) {
      return setLocalError(
        'Usuario: 3–24 caracteres, solo letras, números y _.',
      );
    }
    if (cleanPassword.length < 6) {
      return setLocalError('La contraseña debe tener al menos 6 caracteres.');
    }
    if (cleanPassword !== confirmPassword) {
      return setLocalError('La contraseña y la confirmación no coinciden.');
    }

    try {
      await register({
        name: cleanName,
        username: cleanUsername,
        email: cleanEmail,
        password: cleanPassword,
        preferredLanguage,
      });
    } catch (err) {
      setLocalError(mapAuthError(err));
    }
  }, [
    name,
    email,
    username,
    password,
    confirmPassword,
    preferredLanguage,
    register,
    clearMessages,
  ]);

  return (
    <>
      <AuthScreen
        title="Crear cuenta"
        subtitle="Gratis. Sin anuncios molestos en el registro."
        showBrand={false}
        onBack={() => navigation.replace('Login')}
        error={error}
        onDismissError={clearMessages}
        footer={
          <AuthLinkRow
            prompt="¿Ya tenés cuenta?"
            action="Iniciar sesión"
            onPress={() => navigation.replace('Login')}
          />
        }
      >
        <AuthField
          label="Nombre"
          icon="user"
          value={name}
          onChangeText={(t) => {
            setName(t);
            clearMessages();
          }}
          placeholder="Tu nombre"
          autoCapitalize="words"
          textContentType="name"
          editable={!isLoading}
        />

        <AuthField
          label="Correo"
          icon="mail"
          value={email}
          onChangeText={(t) => {
            setEmail(t);
            clearMessages();
            if (!usernameTouched) {
              const local = t.trim().split('@')[0] || '';
              setUsername(
                local
                  .toLowerCase()
                  .replace(/[^a-z0-9_]/g, '')
                  .slice(0, 24),
              );
            }
          }}
          placeholder="tu@correo.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="emailAddress"
          editable={!isLoading}
        />

        <AuthField
          label="Usuario"
          prefix="@"
          value={username}
          onChangeText={(t) => {
            setUsernameTouched(true);
            setUsername(t.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24));
            clearMessages();
          }}
          placeholder="usuario"
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="username"
          editable={!isLoading}
        />

        <AuthField
          label="Contraseña"
          icon="lock"
          value={password}
          onChangeText={(t) => {
            setPassword(t);
            clearMessages();
          }}
          placeholder="Mínimo 6 caracteres"
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="newPassword"
          editable={!isLoading}
          right={
            <AuthPasswordToggle
              visible={showPassword}
              onToggle={() => setShowPassword((v) => !v)}
            />
          }
        />

        <AuthField
          label="Confirmar contraseña"
          icon="lock"
          value={confirmPassword}
          onChangeText={(t) => {
            setConfirmPassword(t);
            clearMessages();
          }}
          placeholder="Repetí la contraseña"
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="newPassword"
          editable={!isLoading}
        />

        <Text style={styles.langLabel}>Idioma de la app</Text>
        <Pressable
          style={styles.langField}
          onPress={() => {
            // Modal after press — no Alert race here
            setPickerOpen(true);
          }}
          disabled={isLoading}
        >
          <Text style={styles.flag}>{selectedLang.flag}</Text>
          <Text style={styles.langText}>{selectedLang.label}</Text>
          <Feather name="chevron-down" size={18} color={colors.textSecondary} />
        </Pressable>

        <AuthPrimaryButton
          label="Crear cuenta"
          loadingLabel="Creando…"
          loading={isLoading}
          onPress={() => {
            void handleSubmit();
          }}
        />
      </AuthScreen>

      <Modal
        visible={pickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerOpen(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setPickerOpen(false)}
        >
          <Pressable
            style={[
              styles.modalCard,
              { paddingBottom: insets.bottom + spacing.xl },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalGrab} />
            <Text style={styles.modalTitle}>Elegí tu idioma</Text>
            <FlatList
              data={LANGUAGES}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => (
                <Pressable
                  style={[
                    styles.optionRow,
                    item.code === preferredLanguage && styles.optionActive,
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
    </>
  );
}

const styles = StyleSheet.create({
  langLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  langField: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBackground,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.xl,
    minHeight: 52,
    borderWidth: 1.5,
    borderColor: colors.border,
    marginBottom: spacing.xl,
  },
  flag: { fontSize: fontSize.h3, marginRight: spacing.md },
  langText: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: fontSize.bodyLg,
  },
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
  modalGrab: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  modalTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.title,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  optionActive: { backgroundColor: colors.badgeBackground },
  optionFlag: { fontSize: fontSize.h3, marginRight: spacing.lg },
  optionLabel: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: fontSize.bodyLg,
  },
});

export default RegisterScreen;
