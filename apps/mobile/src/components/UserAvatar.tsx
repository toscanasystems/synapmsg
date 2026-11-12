/**
 * UserAvatar — circular avatar with the user's initials on a deterministic
 * tinted background (no network image required).
 *
 * Props:
 *   name — display name (we derive initials from it)
 *   size — pixel diameter (default 44)
 */

import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import colors, { themed } from '../theme/colors';
import { fontSize, fontWeight, avatarPalette, radius } from '../theme/spacing';

interface UserAvatarProps {
  name: string;
  size?: number;
}

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0; // force int32
  }
  return Math.abs(hash);
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  const first = parts[0][0] ?? '';
  const last = parts[parts.length - 1][0] ?? '';
  return `${first}${last}`.toUpperCase();
}

function UserAvatarComponent({ name, size = 44 }: UserAvatarProps): JSX.Element {
  const initials = getInitials(name || '?');
  const tint = avatarPalette[hashString(name || 'Synap') % avatarPalette.length];
  const dynamicStyles = StyleSheet.create({
    circle: {
      width: size,
      height: size,
      borderRadius: size / 2,
      backgroundColor: tint,
    },
    label: {
      fontSize: Math.max(12, size * 0.4),
    },
  });

  return (
    <View style={[styles.circle, dynamicStyles.circle]}>
      <Text style={[styles.label, dynamicStyles.label]}>{initials}</Text>
    </View>
  );
}

const styles = themed((colors) => ({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: colors.textInverse,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.5,
  },
}));

export const UserAvatar = memo(UserAvatarComponent);
export default UserAvatar;
