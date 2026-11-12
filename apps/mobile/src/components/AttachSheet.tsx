/**
 * Panel de adjuntos estilo WhatsApp (clip).
 */

import React from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import colors, { themed } from '../theme/colors';
import { fontSize, fontWeight, radius, spacing } from '../theme/spacing';

export type AttachAction =
  | 'document'
  | 'camera'
  | 'gallery'
  | 'audio'
  | 'location'
  | 'contact';

type AttachItem = {
  id: AttachAction;
  label: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  tint: string;
};

const ITEMS: AttachItem[] = [
  { id: 'document', label: 'Documento', icon: 'file-text', tint: '#7B68EE' },
  { id: 'camera', label: 'Cámara', icon: 'camera', tint: '#E91E63' },
  { id: 'gallery', label: 'Galería', icon: 'image', tint: '#9C27B0' },
  { id: 'audio', label: 'Audio', icon: 'headphones', tint: '#FF5722' },
  { id: 'location', label: 'Ubicación', icon: 'map-pin', tint: '#4CAF50' },
  { id: 'contact', label: 'Contacto', icon: 'user', tint: '#2196F3' },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  onAction: (action: AttachAction) => void;
}

export function AttachSheet({
  visible,
  onClose,
  onAction,
}: Props): JSX.Element {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <View style={styles.grid}>
            {ITEMS.map((item) => (
              <Pressable
                key={item.id}
                style={({ pressed }) => [
                  styles.cell,
                  pressed && styles.cellPressed,
                ]}
                onPress={() => {
                  // Defer until Modal dismiss finishes (Alert/picker race).
                  onClose();
                  setTimeout(() => onAction(item.id), 320);
                }}
              >
                <View style={[styles.iconCircle, { backgroundColor: item.tint }]}>
                  <Feather name={item.icon} size={22} color="#fff" />
                </View>
                <Text style={styles.label}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = themed((colors) => ({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlay,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
    paddingHorizontal: spacing.xl,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.xl,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: spacing.xl,
  },
  cell: {
    width: '30%',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  cellPressed: { opacity: 0.7 },
  iconCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  label: {
    color: colors.textPrimary,
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
  },
}));

export default AttachSheet;
