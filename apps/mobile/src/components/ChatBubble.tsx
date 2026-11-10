/**
 * ChatBubble — renders a single message in a chat thread.
 *
 * Sent messages:   mint green background, white text, right-aligned,
 *                  top-right corner smaller.
 * Received:        white background, dark text, left-aligned,
 *                  top-left corner smaller.
 *
 * Max width: 75% of the screen.
 *
 * If the message is translated AND it is NOT mine, a TranslationBadge is
 * rendered below the bubble — tapping it calls `onShowOriginal`.
 */

import React from 'react';
import { View, Text, StyleSheet, Dimensions, Pressable, Alert } from 'react-native';
import colors from '../theme/colors';
import { fontSize, fontWeight, radius, spacing } from '../theme/spacing';
import { Message, languageLabel } from '../types';
import { TranslationBadge } from './TranslationBadge';

interface ChatBubbleProps {
  message: Message;
  isMine: boolean;
  /** Override default alert handler for testing/custom UIs. */
  onShowOriginal?: (message: Message) => void;
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const MAX_BUBBLE_WIDTH = SCREEN_WIDTH * 0.75;

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function ChatBubble({
  message,
  isMine,
  onShowOriginal,
}: ChatBubbleProps): JSX.Element {
  const handleShowOriginal = () => {
    if (onShowOriginal) {
      onShowOriginal(message);
      return;
    }
    Alert.alert(
      `Original · ${languageLabel(message.originalLanguage)}`,
      message.originalText,
      [{ text: 'OK' }],
    );
  };

  const bubbleStyle = isMine ? styles.bubbleMine : styles.bubbleTheirs;
  const textStyle = isMine ? styles.textMine : styles.textTheirs;

  return (
    <View style={[styles.row, isMine ? styles.rowMine : styles.rowTheirs]}>
      <View style={styles.column}>
        <View style={[styles.bubble, bubbleStyle]}>
          <Text style={[styles.text, textStyle]}>
            {isMine ? message.originalText : message.translatedText}
          </Text>
        </View>

        {message.isTranslated && !isMine && (
          <TranslationBadge
            fromLanguage={message.originalLanguage}
            onPress={handleShowOriginal}
          />
        )}

        <Text style={[styles.timestamp, isMine ? styles.timestampMine : styles.timestampTheirs]}>
          {formatTime(message.createdAt)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    width: '100%',
    paddingHorizontal: spacing.xl,
    marginVertical: spacing.xs,
  },
  rowMine: {
    alignItems: 'flex-end',
  },
  rowTheirs: {
    alignItems: 'flex-start',
  },
  column: {
    maxWidth: MAX_BUBBLE_WIDTH,
    flexDirection: 'column',
  },
  bubble: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
  },
  bubbleMine: {
    backgroundColor: colors.accent,
    borderTopRightRadius: radius.sm,
  },
  bubbleTheirs: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.sm,
    // subtle shadow to lift bubble off the cream background
    shadowColor: colors.primary,
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  text: {
    fontSize: fontSize.bodyLg,
    lineHeight: fontSize.bodyLg * 1.35,
  },
  textMine: {
    color: colors.textInverse,
  },
  textTheirs: {
    color: colors.textPrimary,
  },
  timestamp: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  timestampMine: {
    alignSelf: 'flex-end',
  },
  timestampTheirs: {
    alignSelf: 'flex-start',
  },
});

export default ChatBubble;
