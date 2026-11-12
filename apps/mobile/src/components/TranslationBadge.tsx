/**
 * TranslationBadge — pill under received translated messages.
 * Tap → ver texto original.
 */

import React from 'react';
import { Pressable, Text, StyleSheet, ViewStyle } from 'react-native';
import colors, { themed } from '../theme/colors';
import { fontSize, fontWeight, radius, spacing } from '../theme/spacing';
import { languageFlag, languageLabel } from '../types';

interface TranslationBadgeProps {
  fromLanguage: string;
  onPress?: () => void;
  style?: ViewStyle;
}

export function TranslationBadge({
  fromLanguage,
  onPress,
  style,
}: TranslationBadgeProps): JSX.Element {
  const label = languageLabel(fromLanguage);
  const flag = languageFlag(fromLanguage);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.badge, pressed && styles.pressed, style]}
      accessibilityRole="button"
      accessibilityLabel={`Traducido de ${label}. Toca para ver el original.`}
    >
      <Text style={styles.text}>
        {flag} Traducido de {label}
      </Text>
      <Text style={styles.cta}>Ver original ›</Text>
    </Pressable>
  );
}

const styles = themed((colors) => ({
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.badgeBackground,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
    maxWidth: '100%',
  },
  pressed: {
    opacity: 0.7,
  },
  text: {
    color: colors.badgeText,
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
  },
  cta: {
    color: colors.accent,
    fontSize: fontSize.caption,
    fontWeight: fontWeight.medium,
    marginTop: 2,
  },
}));

export default TranslationBadge;
