/**
 * TranslationBadge — small pill shown beneath a received translated message.
 *
 * Renders: "🌐 Traducido del {languageLabel}"
 * Tap → onPress (typically opens an alert/modal showing the original text).
 */

import React from 'react';
import { Pressable, Text, StyleSheet, ViewStyle } from 'react-native';
import colors from '../theme/colors';
import { fontSize, fontWeight, radius, spacing } from '../theme/spacing';
import { languageLabel } from '../types';

interface TranslationBadgeProps {
  /** ISO code of the source language ("es", "en", ...). */
  fromLanguage: string;
  /** Tap handler — caller shows original text in alert/modal. */
  onPress?: () => void;
  style?: ViewStyle;
}

export function TranslationBadge({
  fromLanguage,
  onPress,
  style,
}: TranslationBadgeProps): JSX.Element {
  const label = languageLabel(fromLanguage);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.badge, pressed && styles.pressed, style]}
      accessibilityRole="button"
      accessibilityLabel={`Message translated from ${label}. Tap to see original.`}
    >
      <Text style={styles.text}>🌐 Traducido del {label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.badgeBackground,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginTop: spacing.xs,
  },
  pressed: {
    opacity: 0.7,
  },
  text: {
    color: colors.badgeText,
    fontSize: fontSize.caption,
    fontWeight: fontWeight.medium,
  },
});

export default TranslationBadge;
