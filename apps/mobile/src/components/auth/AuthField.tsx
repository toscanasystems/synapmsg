import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  type TextInputProps,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import colors from '../../theme/colors';
import { fontSize, fontWeight, radius, spacing } from '../../theme/spacing';
import type { FeatherIconName } from '../../types/iconNames';

export function AuthField(
  props: {
    label: string;
    icon?: FeatherIconName;
    prefix?: string;
    error?: boolean;
    right?: React.ReactNode;
  } & TextInputProps,
): JSX.Element {
  const [focused, setFocused] = useState(false);
  const {
    label,
    icon,
    prefix,
    error,
    right,
    style,
    onFocus,
    onBlur,
    ...inputProps
  } = props;

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={[
          styles.field,
          focused && styles.fieldFocused,
          error && styles.fieldError,
        ]}
      >
        {icon ? (
          <Feather
            name={icon}
            size={18}
            color={focused ? colors.accent : colors.textMuted}
            style={styles.icon}
          />
        ) : null}
        {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}
        <TextInput
          {...inputProps}
          placeholderTextColor={colors.textMuted}
          style={[styles.input, style]}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
        />
        {right}
      </View>
    </View>
  );
}

export function AuthPasswordToggle(props: {
  visible: boolean;
  onToggle: () => void;
}): JSX.Element {
  return (
    <Pressable
      onPress={props.onToggle}
      hitSlop={10}
      style={styles.eye}
      accessibilityRole="button"
      accessibilityLabel={
        props.visible ? 'Ocultar contraseña' : 'Mostrar contraseña'
      }
    >
      <Feather
        name={props.visible ? 'eye-off' : 'eye'}
        size={18}
        color={colors.textSecondary}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.xl },
  label: {
    color: colors.textSecondary,
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.3,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBackground,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.xl,
    minHeight: 52,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  fieldFocused: {
    borderColor: colors.accent,
    backgroundColor: colors.surface,
  },
  fieldError: {
    borderColor: colors.error,
  },
  icon: { marginRight: spacing.md },
  prefix: {
    color: colors.accent,
    fontSize: fontSize.bodyLg,
    fontWeight: fontWeight.semibold,
    marginRight: spacing.sm,
  },
  input: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 16,
    paddingVertical: 14,
  },
  eye: { padding: spacing.sm, marginLeft: spacing.sm },
});

export default AuthField;
