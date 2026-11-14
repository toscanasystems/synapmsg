/**
 * MessageInput — clip + texto + enviar (estilo WhatsApp).
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Platform,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import colors, { themed } from '../theme/colors';
import { fontSize, fontWeight, radius, spacing } from '../theme/spacing';
import { AttachSheet, AttachAction } from './AttachSheet';
import { assistCompose, COMPOSE_TONES, ComposeTone } from '../i18n/composeAssist';

interface MessageInputProps {
  onSend: (text: string) => void;
  onSchedule?: (text: string, sendAtIso: string) => void;
  onAttach?: (action: AttachAction) => void;
  onChangeText?: (text: string) => void;
  replyPreview?: { author: string; text: string } | null;
  onCancelReply?: () => void;
  disabled?: boolean;
  placeholder?: string;
  /** Próxima foto/audio se envía como ver/escuchar una vez. */
  viewOnce?: boolean;
  onToggleViewOnce?: () => void;
}

export function MessageInput({
  onSend,
  onSchedule,
  onAttach,
  onChangeText,
  replyPreview,
  onCancelReply,
  disabled = false,
  placeholder = 'Mensaje…',
  viewOnce = false,
  onToggleViewOnce,
}: MessageInputProps): JSX.Element {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [attachOpen, setAttachOpen] = useState(false);

  const trimmed = text.trim();
  const canSend = trimmed.length > 0 && !disabled;

  const updateText = useCallback(
    (next: string) => {
      setText(next);
      onChangeText?.(next);
    },
    [onChangeText],
  );

  const handleSend = useCallback(() => {
    if (!canSend) return;
    onSend(trimmed);
    setText('');
    onChangeText?.('');
  }, [canSend, trimmed, onSend, onChangeText]);

  const handleAssist = useCallback(() => {
    if (!trimmed) return;
    Alert.alert('Asistente (on-device)', 'Elegí tono — no se sube a la nube.', [
      ...COMPOSE_TONES.map((t) => ({
        text: t.label,
        onPress: () => {
          const next = assistCompose(trimmed, t.id as ComposeTone);
          updateText(next);
        },
      })),
      { text: 'Cancelar', style: 'cancel' as const },
    ]);
  }, [trimmed, updateText]);

  const handleSchedule = useCallback(() => {
    if (!canSend || !onSchedule) return;
    const body = trimmed;
    Alert.alert('Programar mensaje', '¿Cuándo lo enviamos?', [
      {
        text: 'En 1 minuto',
        onPress: () => {
          onSchedule(body, new Date(Date.now() + 60_000).toISOString());
          setText('');
          onChangeText?.('');
        },
      },
      {
        text: 'En 1 hora',
        onPress: () => {
          onSchedule(body, new Date(Date.now() + 3_600_000).toISOString());
          setText('');
          onChangeText?.('');
        },
      },
      {
        text: 'Mañana 9:00',
        onPress: () => {
          const d = new Date();
          d.setDate(d.getDate() + 1);
          d.setHours(9, 0, 0, 0);
          onSchedule(body, d.toISOString());
          setText('');
          onChangeText?.('');
        },
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }, [canSend, onSchedule, trimmed, onChangeText]);

  return (
    <>
      {replyPreview ? (
        <View style={styles.replyBar}>
          <View style={styles.replyBarText}>
            <Text style={styles.replyBarAuthor} numberOfLines={1}>
              Respondiendo a {replyPreview.author}
            </Text>
            <Text style={styles.replyBarBody} numberOfLines={1}>
              {replyPreview.text}
            </Text>
          </View>
          <Pressable onPress={onCancelReply} hitSlop={10}>
            <Feather name="x" size={18} color={colors.textSecondary} />
          </Pressable>
        </View>
      ) : null}
      <View
        style={[
          styles.container,
          {
            paddingBottom:
              (Platform.OS === 'ios' ? spacing.md : spacing.md) +
              Math.max(insets.bottom, 0),
          },
        ]}
      >
        <Pressable
          onPress={() => setAttachOpen(true)}
          disabled={disabled}
          hitSlop={8}
          style={({ pressed }) => [
            styles.clipBtn,
            pressed && styles.clipPressed,
            disabled && styles.clipDisabled,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Adjuntar"
        >
          <Feather name="paperclip" size={22} color={colors.textSecondary} />
        </Pressable>

        {onToggleViewOnce ? (
          <Pressable
            onPress={onToggleViewOnce}
            disabled={disabled}
            hitSlop={8}
            style={({ pressed }) => [
              styles.clipBtn,
              pressed && styles.clipPressed,
              disabled && styles.clipDisabled,
            ]}
            accessibilityRole="button"
            accessibilityLabel={
              viewOnce
                ? 'Modo una vez activo'
                : 'Activar ver/escuchar una vez'
            }
          >
            <Feather
              name={viewOnce ? 'eye-off' : 'eye'}
              size={20}
              color={viewOnce ? colors.accent : colors.textSecondary}
            />
          </Pressable>
        ) : null}

        <Pressable
          onPress={handleAssist}
          disabled={disabled || !trimmed}
          hitSlop={8}
          style={({ pressed }) => [
            styles.clipBtn,
            pressed && styles.clipPressed,
            (disabled || !trimmed) && styles.clipDisabled,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Asistente de redacción"
        >
          <Feather name="edit-3" size={20} color={colors.accent} />
        </Pressable>

        <TextInput
          value={text}
          onChangeText={updateText}
          placeholder={placeholder}
          placeholderTextColor={colors.chatNeonDim}
          style={styles.input}
          multiline
          maxLength={4000}
          editable={!disabled}
          returnKeyType="send"
          blurOnSubmit={false}
          onSubmitEditing={handleSend}
        />

        <Pressable
          onPress={handleSend}
          onLongPress={handleSchedule}
          delayLongPress={350}
          disabled={!canSend}
          style={({ pressed }) => [
            styles.sendButton,
            (!canSend || pressed) && styles.sendButtonPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Enviar mensaje. Mantén pulsado para programar."
        >
          <Feather name="send" size={20} color={colors.textInverse} />
        </Pressable>
      </View>

      <AttachSheet
        visible={attachOpen}
        onClose={() => setAttachOpen(false)}
        onAction={(action) => {
          if (onAttach) onAttach(action);
        }}
      />
    </>
  );
}

const styles = themed((colors) => ({
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  replyBarText: { flex: 1, minWidth: 0 },
  replyBarAuthor: {
    color: colors.accent,
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
  },
  replyBarBody: {
    color: colors.textSecondary,
    fontSize: fontSize.caption,
    marginTop: 2,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: Platform.select({ ios: spacing.md, android: spacing.md }),
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  clipBtn: {
    width: 40,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.xs,
  },
  clipPressed: { opacity: 0.6 },
  clipDisabled: { opacity: 0.35 },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.inputBackground,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.chatBubbleBorder,
    color: colors.chatNeon,
    fontSize: 16,
    letterSpacing: 0.2,
    marginRight: spacing.sm,
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonPressed: {
    opacity: 0.5,
  },
}));

export default MessageInput;
