import React from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import colors from '../../theme/colors';
import { fontSize, fontWeight, radius, spacing } from '../../theme/spacing';
import { AuthFeedback } from '../AuthFeedback';

export function AuthScreen(props: {
  title: string;
  subtitle?: string;
  showBrand?: boolean;
  onBack?: () => void;
  error?: string | null;
  onDismissError?: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}): JSX.Element {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.glow, { top: insets.top + 40 }]} />
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: insets.top + spacing.xxl,
            paddingBottom: insets.bottom + spacing.xxxl,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {props.onBack ? (
          <Pressable
            onPress={props.onBack}
            hitSlop={12}
            style={styles.back}
            accessibilityRole="button"
            accessibilityLabel="Volver"
          >
            <Feather name="arrow-left" size={22} color={colors.textPrimary} />
          </Pressable>
        ) : null}

        {props.showBrand !== false ? (
          <View style={styles.brand}>
            <Image
              source={require('../../../assets/logo.png')}
              style={styles.logo}
              accessibilityLabel="Synap"
            />
            <Text style={styles.wordmark}>Synap</Text>
            {props.subtitle ? (
              <Text style={styles.subtitle}>{props.subtitle}</Text>
            ) : null}
          </View>
        ) : (
          <View style={styles.headerPlain}>
            <Text style={styles.titlePlain}>{props.title}</Text>
            {props.subtitle ? (
              <Text style={styles.subtitle}>{props.subtitle}</Text>
            ) : null}
          </View>
        )}

        {props.showBrand !== false && props.title !== 'Synap' ? (
          <Text style={styles.sectionTitle}>{props.title}</Text>
        ) : null}

        {props.error ? (
          <AuthFeedback
            message={props.error}
            onDismiss={props.onDismissError}
          />
        ) : null}

        {props.children}
        {props.footer}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function AuthPrimaryButton(props: {
  label: string;
  loadingLabel?: string;
  loading?: boolean;
  onPress: () => void;
  disabled?: boolean;
}): JSX.Element {
  const busy = Boolean(props.loading);
  return (
    <Pressable
      onPress={props.onPress}
      disabled={busy || props.disabled}
      style={({ pressed }) => [
        styles.cta,
        pressed && !busy && styles.ctaPressed,
        (busy || props.disabled) && styles.ctaDisabled,
      ]}
    >
      {busy ? (
        <View style={styles.ctaRow}>
          <ActivityIndicator color={colors.textInverse} />
          <Text style={styles.ctaText}>
            {props.loadingLabel || props.label}
          </Text>
        </View>
      ) : (
        <Text style={styles.ctaText}>{props.label}</Text>
      )}
    </Pressable>
  );
}

export function AuthLinkRow(props: {
  prompt: string;
  action: string;
  onPress: () => void;
}): JSX.Element {
  return (
    <Pressable onPress={props.onPress} hitSlop={10} style={styles.linkWrap}>
      <Text style={styles.link}>
        {props.prompt} <Text style={styles.linkAction}>{props.action}</Text>
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  glow: {
    position: 'absolute',
    alignSelf: 'center',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(48, 176, 176, 0.12)',
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.xxl,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    marginBottom: spacing.lg,
  },
  brand: { alignItems: 'center', marginBottom: spacing.xxxl },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 18,
    marginBottom: spacing.md,
  },
  wordmark: {
    color: colors.accent,
    fontSize: fontSize.h1,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.8,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.body,
    marginTop: spacing.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.h3,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.xl,
  },
  headerPlain: { marginBottom: spacing.xxl },
  titlePlain: {
    color: colors.textPrimary,
    fontSize: fontSize.h1,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.5,
  },
  cta: {
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  ctaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  ctaPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  ctaDisabled: { opacity: 0.55 },
  ctaText: {
    color: colors.textInverse,
    fontSize: fontSize.bodyLg,
    fontWeight: fontWeight.bold,
  },
  linkWrap: { alignItems: 'center', marginTop: spacing.xxl },
  link: { color: colors.textSecondary, fontSize: fontSize.body },
  linkAction: { color: colors.accent, fontWeight: fontWeight.semibold },
});
