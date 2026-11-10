/**
 * EmptyState — centered icon + title + subtitle + optional action button.
 * Used by ChatList ("No chats yet") and NewChat ("Search for someone…").
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import colors from '../theme/colors';
import { fontSize, fontWeight, spacing } from '../theme/spacing';
import { FeatherIconName } from '../types/iconNames';

interface EmptyStateProps {
  icon?: FeatherIconName;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export function EmptyState({
  icon = 'message-square',
  title,
  subtitle,
  action,
}: EmptyStateProps): JSX.Element {
  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Feather name={icon} size={32} color={colors.accent} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {action ? <View style={styles.actionWrap}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.huge,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.badgeBackground,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSize.title,
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.body,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  actionWrap: {
    marginTop: spacing.xl,
  },
});

export default EmptyState;
