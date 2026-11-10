/**
 * MessageInput — sticky text input + circular send button.
 *
 * Layout: row with [TextInput flex 1] [SendButton 48x48 circular].
 * Send button is disabled (faded) when text is empty.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  TextInput,
  Pressable,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import colors from '../theme/colors';
import { radius, spacing } from '../theme/spacing';

interface MessageInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function MessageInput({
  onSend,
  disabled = false,
  placeholder = 'Message…',
}: MessageInputProps): JSX.Element {
  const [text, setText] = useState('');

  const trimmed = text.trim();
  const canSend = trimmed.length > 0 && !disabled;

  const handleSend = useCallback(() => {
    if (!canSend) return;
    onSend(trimmed);
    setText('');
  }, [canSend, trimmed, onSend]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.container}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor={colors.textSecondary}
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
          disabled={!canSend}
          style={({ pressed }) => [
            styles.sendButton,
            (!canSend || pressed) && styles.sendButtonPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Send message"
        >
          <Feather name="send" size={20} color={colors.textInverse} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: Platform.select({ ios: spacing.md, android: spacing.md }),
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.inputBackground,
    borderRadius: radius.xl,
    color: colors.textPrimary,
    fontSize: 16, // iOS hates <16 in TextInputs (zooms on focus)
    marginRight: spacing.md,
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
});

export default MessageInput;
