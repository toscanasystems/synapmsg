/**
 * Menú ⋮ estilo WhatsApp (contacto / grupo).
 */

import React from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
} from 'react-native';
import colors, { themed } from '../theme/colors';
import { fontSize, fontWeight, radius, spacing } from '../theme/spacing';

export type ChatMenuAction =
  | 'info'
  | 'search'
  | 'mute'
  | 'archive'
  | 'hide'
  | 'disappearing'
  | 'poll'
  | 'wallpaper'
  | 'add_list'
  | 'export'
  | 'clear'
  | 'e2e_mode'
  | 'safety'
  | 'block'
  | 'report'
  | 'group_info'
  | 'group_media'
  | 'add_members'
  | 'exit_group';

type MenuItem = {
  id: ChatMenuAction;
  label: string;
  danger?: boolean;
};

const DIRECT_ITEMS: MenuItem[] = [
  { id: 'info', label: 'Info. del contacto' },
  { id: 'e2e_mode', label: 'Privacidad del chat' },
  { id: 'safety', label: 'Código de seguridad' },
  { id: 'search', label: 'Buscar' },
  { id: 'mute', label: 'Silenciar notificaciones' },
  { id: 'archive', label: 'Archivar chat' },
  { id: 'hide', label: 'Ocultar chat (PIN)' },
  { id: 'disappearing', label: 'Autodestrucción' },
  { id: 'poll', label: 'Encuesta' },
  { id: 'wallpaper', label: 'Fondo de pantalla' },
  { id: 'add_list', label: 'Agregar a lista' },
  { id: 'export', label: 'Exportar chat' },
  { id: 'clear', label: 'Vaciar chat' },
  { id: 'block', label: 'Bloquear', danger: true },
  { id: 'report', label: 'Reportar', danger: true },
];

const GROUP_ITEMS: MenuItem[] = [
  { id: 'group_info', label: 'Info. del grupo' },
  { id: 'add_members', label: 'Agregar participantes' },
  { id: 'group_media', label: 'Multimedia, links y docs' },
  { id: 'search', label: 'Buscar' },
  { id: 'mute', label: 'Silenciar notificaciones' },
  { id: 'archive', label: 'Archivar chat' },
  { id: 'hide', label: 'Ocultar chat (PIN)' },
  { id: 'disappearing', label: 'Autodestrucción' },
  { id: 'poll', label: 'Encuesta' },
  { id: 'wallpaper', label: 'Fondo de pantalla' },
  { id: 'add_list', label: 'Agregar a lista' },
  { id: 'clear', label: 'Vaciar chat' },
  { id: 'exit_group', label: 'Salir del grupo', danger: true },
  { id: 'report', label: 'Reportar grupo', danger: true },
];

interface Props {
  visible: boolean;
  isGroup?: boolean;
  onClose: () => void;
  onAction: (action: ChatMenuAction) => void;
}

export function ChatHeaderMenu({
  visible,
  isGroup = false,
  onClose,
  onAction,
}: Props): JSX.Element {
  const items = isGroup ? GROUP_ITEMS : DIRECT_ITEMS;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.menuAnchor}>
          <Pressable style={styles.menu} onPress={(e) => e.stopPropagation()}>
            <ScrollView bounces={false}>
              {items.map((item) => (
                <Pressable
                  key={item.id}
                  style={({ pressed }) => [
                    styles.item,
                    pressed && styles.itemPressed,
                  ]}
                  onPress={() => {
                    // Close Modal first; Alert/native dialogs fail if shown
                    // while a Modal is still dismissing (Android especially).
                    onClose();
                    setTimeout(() => onAction(item.id), 320);
                  }}
                >
                  <Text
                    style={[styles.itemText, item.danger && styles.itemDanger]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = themed((colors) => ({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
  },
  menuAnchor: {
    position: 'absolute',
    top: 56,
    right: spacing.md,
    maxWidth: 280,
    width: '78%',
  },
  menu: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
    maxHeight: 420,
  },
  item: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  itemPressed: {
    backgroundColor: colors.ripple,
  },
  itemText: {
    color: colors.textPrimary,
    fontSize: fontSize.bodyLg,
  },
  itemDanger: {
    color: colors.error,
    fontWeight: fontWeight.semibold,
  },
}));

export default ChatHeaderMenu;
