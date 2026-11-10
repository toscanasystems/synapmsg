/**
 * Loading — simple centered spinner.
 *
 * Variants:
 *   • fullScreen — fills parent, used during app bootstrap / auth checks
 *   • inline     — small spinner + optional label
 */

import React from 'react';
import {
  ActivityIndicator,
  View,
  Text,
  StyleSheet,
  ActivityIndicatorProps,
} from 'react-native';
import colors from '../theme/colors';
import { fontSize, spacing } from '../theme/spacing';

interface LoadingProps extends Pick<ActivityIndicatorProps, 'size'> {
  label?: string;
  fullScreen?: boolean;
}

export function Loading({
  size = 'small',
  label,
  fullScreen = false,
}: LoadingProps): JSX.Element {
  if (fullScreen) {
    return (
      <View style={styles.fullScreen}>
        <ActivityIndicator size="large" color={colors.accent} />
        {label ? <Text style={styles.fullScreenLabel}>{label}</Text> : null}
      </View>
    );
  }
  return (
    <View style={styles.inline}>
      <ActivityIndicator size={size} color={colors.accent} />
      {label ? <Text style={styles.inlineLabel}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fullScreen: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullScreenLabel: {
    marginTop: spacing.md,
    color: colors.textSecondary,
    fontSize: fontSize.body,
  },
  inline: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineLabel: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    fontSize: fontSize.caption,
  },
});

export default Loading;
