/**
 * In-app auth feedback (no native Alert).
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import colors from '../theme/colors';
import { fontSize, fontWeight, radius, spacing } from '../theme/spacing';

type Kind = 'error' | 'info';

export function AuthFeedback(props: {
  message: string;
  kind?: Kind;
  onDismiss?: () => void;
}): JSX.Element {
  const kind = props.kind ?? 'error';
  const isError = kind === 'error';
  return (
    <View
      style={[styles.wrap, isError ? styles.wrapError : styles.wrapInfo]}
      accessibilityRole="alert"
    >
      <Feather
        name={isError ? 'alert-circle' : 'info'}
        size={18}
        color={isError ? colors.error : colors.accent}
        style={styles.icon}
      />
      <Text
        style={[styles.text, { color: isError ? colors.error : colors.accentLight }]}
      >
        {props.message}
      </Text>
      {props.onDismiss ? (
        <Pressable onPress={props.onDismiss} hitSlop={10} accessibilityLabel="Cerrar">
          <Feather name="x" size={16} color={colors.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  wrapError: {
    backgroundColor: 'rgba(229, 115, 115, 0.12)',
    borderColor: 'rgba(229, 115, 115, 0.35)',
  },
  wrapInfo: {
    backgroundColor: 'rgba(48, 176, 176, 0.12)',
    borderColor: 'rgba(48, 176, 176, 0.35)',
  },
  icon: { marginTop: 1 },
  text: {
    flex: 1,
    fontSize: fontSize.body,
    fontWeight: fontWeight.medium,
    lineHeight: 20,
  },
});

export default AuthFeedback;
