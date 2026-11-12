/**
 * ChatBubble — texto + imagen/audio/archivo + reacciones / editar.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Pressable,
  Alert,
  Image,
  Linking,
  Modal,
  TextInput,
} from 'react-native';
import { Audio } from 'expo-av';
import { Feather } from '@expo/vector-icons';
import colors, { themed } from '../theme/colors';
import { fontSize, fontWeight, radius, spacing } from '../theme/spacing';
import { Message, languageLabel } from '../types';
import { TranslationBadge } from './TranslationBadge';
import {
  extractMediaMeta,
  extForContentType,
  openMediaBytes,
  writeBytesToCache,
  type MediaSealMeta,
} from '../crypto/mediaSeal';

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const;

interface ChatBubbleProps {
  message: Message;
  isMine: boolean;
  peerReadAt?: string | null;
  onShowOriginal?: (message: Message) => void;
  onReact?: (messageId: string, emoji: string) => void;
  onEdit?: (messageId: string, text: string) => void;
  onDelete?: (messageId: string) => void;
  onReply?: (message: Message) => void;
  onForward?: (message: Message) => void;
  /** Abre foto/audio de una sola vez (receptor). */
  onOpenViewOnce?: (
    message: Message,
  ) => Promise<{ mediaUrl: string | null; mediaType: string | null } | void>;
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const MAX_BUBBLE_WIDTH = SCREEN_WIDTH * 0.75;
const EDIT_WINDOW_MS = 48 * 60 * 60 * 1000;

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function canEdit(message: Message, isMine: boolean): boolean {
  if (!isMine || message.deletedAt) return false;
  // Media captions with seal meta: text-only edits (no re-upload) for plain text.
  if (message.mediaType && message.mediaUrl) return false;
  const age = Date.now() - new Date(message.createdAt).getTime();
  return age <= EDIT_WINDOW_MS;
}

export function ChatBubble({
  message,
  isMine,
  peerReadAt,
  onShowOriginal,
  onReact,
  onEdit,
  onDelete,
  onReply,
  onForward,
  onOpenViewOnce,
}: ChatBubbleProps): JSX.Element {
  const [playing, setPlaying] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editText, setEditText] = useState(message.originalText);
  const [ephemeralUri, setEphemeralUri] = useState<string | null>(null);
  const [openedMediaUri, setOpenedMediaUri] = useState<string | null>(null);
  const [poll, setPoll] = useState<import('../api/polls').PollView | null>(
    null,
  );

  const mediaFromText = useMemo(() => {
    const a = extractMediaMeta(message.originalText);
    const b = extractMediaMeta(message.translatedText);
    return a.meta ? a : b;
  }, [message.originalText, message.translatedText]);

  useEffect(() => {
    let cancelled = false;
    const meta = mediaFromText.meta;
    const remote = message.mediaUrl;
    if (!meta || !remote || message.deletedAt) {
      setOpenedMediaUri(null);
      return;
    }
    void (async () => {
      try {
        const res = await fetch(remote);
        const buf = new Uint8Array(await res.arrayBuffer());
        const plain = openMediaBytes(buf, meta as MediaSealMeta);
        const path = await writeBytesToCache(
          plain,
          extForContentType(meta.ct || 'application/octet-stream'),
        );
        if (!cancelled) setOpenedMediaUri(path);
      } catch (err) {
        console.warn(
          '[mediaSeal] open failed',
          err instanceof Error ? err.message : err,
        );
        if (!cancelled) setOpenedMediaUri(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mediaFromText.meta, message.mediaUrl, message.deletedAt]);

  useEffect(() => {
    let cancelled = false;
    if (message.mediaType !== 'poll' || !message.mediaUrl?.startsWith('poll:')) {
      setPoll(null);
      return;
    }
    const pollId = message.mediaUrl.slice('poll:'.length);
    void (async () => {
      try {
        const { pollsApi } = await import('../api/polls');
        const p = await pollsApi.get(message.chatId, pollId);
        if (!cancelled) setPoll(p);
      } catch {
        if (!cancelled) setPoll(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [message.mediaType, message.mediaUrl, message.chatId]);

  const viewOncePending =
    Boolean(message.viewOnce) &&
    !message.viewOnceOpenedAt &&
    !message.deletedAt &&
    !message.mediaUrl &&
    !ephemeralUri;

  const translated =
    Boolean(message.isTranslated) &&
    Boolean(message.translatedText) &&
    message.translatedText !== message.originalText;

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

  const handleShowDelivered = () => {
    Alert.alert(
      `Así lo recibe · ${languageLabel(message.translatedLanguage || 'en')}`,
      message.translatedText || message.originalText,
      [{ text: 'OK' }],
    );
  };

  const displayText = mediaFromText.meta
    ? mediaFromText.text
    : isMine
      ? message.originalText
      : message.translatedText || message.originalText;
  const mediaUri = ephemeralUri || openedMediaUri || message.mediaUrl;

  const playAudio = async (uri?: string | null) => {
    const src = uri || mediaUri;
    if (!src) return;
    try {
      setPlaying(true);
      const { sound } = await Audio.Sound.createAsync(
        { uri: src },
        { shouldPlay: true },
      );
      sound.setOnPlaybackStatusUpdate((st) => {
        if (!st.isLoaded || st.didJustFinish) {
          setPlaying(false);
          void sound.unloadAsync();
          if (message.viewOnce) {
            setEphemeralUri(null);
          }
        }
      });
    } catch {
      setPlaying(false);
      Alert.alert('Audio', 'No se pudo reproducir.');
    }
  };

  const openViewOnce = () => {
    if (!onOpenViewOnce) return;
    Alert.alert(
      message.mediaType === 'audio' ? 'Escuchar una vez' : 'Ver una vez',
      'Se eliminará para ambos después de abrirlo.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Abrir',
          onPress: () => {
            void (async () => {
              try {
                const res = await onOpenViewOnce(message);
                if (res?.mediaUrl) {
                  setEphemeralUri(res.mediaUrl);
                  if (message.mediaType === 'audio') {
                    void playAudio(res.mediaUrl);
                  }
                }
              } catch (err) {
                Alert.alert(
                  'Una vez',
                  err instanceof Error ? err.message : 'No se pudo abrir.',
                );
              }
            })();
          },
        },
      ],
    );
  };

  const openActions = () => {
    if (message.deletedAt) return;
    const buttons: {
      text: string;
      style?: 'cancel' | 'destructive' | 'default';
      onPress?: () => void;
    }[] = [
      {
        text: 'Reaccionar',
        onPress: () => setPickerOpen(true),
      },
    ];
    if (onReply) {
      buttons.push({
        text: 'Responder',
        onPress: () => onReply(message),
      });
    }
    if (onForward) {
      buttons.push({
        text: 'Reenviar',
        onPress: () => onForward(message),
      });
    }
    if (canEdit(message, isMine) && onEdit) {
      buttons.push({
        text: 'Editar',
        onPress: () => {
          setEditText(message.originalText);
          setEditOpen(true);
        },
      });
    }
    if (isMine && onDelete) {
      buttons.push({
        text: 'Eliminar',
        style: 'destructive',
        onPress: () => {
          Alert.alert('Eliminar mensaje', 'Se borrará para todos en el chat.', [
            { text: 'Cancelar', style: 'cancel' },
            {
              text: 'Eliminar',
              style: 'destructive',
              onPress: () => onDelete(message.id),
            },
          ]);
        },
      });
    }
    buttons.push({ text: 'Cancelar', style: 'cancel' });
    Alert.alert('Mensaje', undefined, buttons);
  };

  const reactions = message.reactions ?? [];

  return (
    <View style={[styles.row, isMine ? styles.rowMine : styles.rowTheirs]}>
      <View style={styles.column}>
        <Pressable onLongPress={openActions} delayLongPress={280}>
          <View
            style={[
              styles.bubble,
              isMine ? styles.bubbleMine : styles.bubbleTheirs,
              message.deletedAt ? styles.bubbleDeleted : null,
            ]}
          >
            {message.deletedAt ? (
              <Text
                style={[
                  styles.text,
                  styles.deletedText,
                  isMine ? styles.textMine : styles.textTheirs,
                ]}
              >
                Mensaje eliminado
              </Text>
            ) : null}

            {!message.deletedAt && message.replyTo ? (
              <View
                style={[
                  styles.replyQuote,
                  isMine ? styles.replyQuoteMine : styles.replyQuoteTheirs,
                ]}
              >
                <Text
                  style={[
                    styles.replyAuthor,
                    isMine ? styles.replyAuthorMine : styles.replyAuthorTheirs,
                  ]}
                  numberOfLines={1}
                >
                  {message.replyTo.senderName}
                </Text>
                <Text
                  style={[
                    styles.replyBody,
                    isMine ? styles.replyBodyMine : styles.replyBodyTheirs,
                  ]}
                  numberOfLines={2}
                >
                  {message.replyTo.text}
                </Text>
              </View>
            ) : null}

            {!message.deletedAt && poll ? (
              <View style={styles.pollBox}>
                <Text
                  style={[
                    styles.text,
                    isMine ? styles.textMine : styles.textTheirs,
                    { fontWeight: '600' },
                  ]}
                >
                  {poll.question}
                  {poll.anonymous ? ' · anónima' : ''}
                  {poll.quiz ? ' · quiz' : ''}
                </Text>
                {poll.options.map((o) => (
                  <Pressable
                    key={o.id}
                    style={styles.pollOpt}
                    onPress={() => {
                      void (async () => {
                        try {
                          const { pollsApi } = await import('../api/polls');
                          const next = await pollsApi.vote(
                            message.chatId,
                            poll.id,
                            o.id,
                          );
                          setPoll(next);
                        } catch (err) {
                          Alert.alert(
                            'Encuesta',
                            err instanceof Error ? err.message : 'No se pudo votar',
                          );
                        }
                      })();
                    }}
                  >
                    <Text
                      style={[
                        styles.text,
                        isMine ? styles.textMine : styles.textTheirs,
                      ]}
                    >
                      {poll.myVote === o.id ? '✓ ' : ''}
                      {o.text} ({o.votes})
                    </Text>
                  </Pressable>
                ))}
                <Text
                  style={[
                    styles.meta,
                    isMine ? styles.metaMine : styles.metaTheirs,
                  ]}
                >
                  {poll.totalVotes} voto(s)
                </Text>
              </View>
            ) : null}

            {!message.deletedAt &&
            message.mediaType === 'image' &&
            viewOncePending ? (
              <Pressable style={styles.viewOnceBtn} onPress={openViewOnce}>
                <Feather name="eye" size={22} color={colors.accent} />
                <Text
                  style={[styles.text, isMine ? styles.textMine : styles.textTheirs]}
                >
                  Foto · ver una vez
                </Text>
              </Pressable>
            ) : null}

            {!message.deletedAt &&
            message.mediaType === 'image' &&
            mediaUri ? (
              <Pressable
                onPress={() => {
                  const uri = mediaUri;
                  if (ephemeralUri) {
                    Linking.openURL(uri).finally(() => setEphemeralUri(null));
                    return;
                  }
                  Linking.openURL(uri);
                }}
              >
                <Image
                  source={{ uri: mediaUri }}
                  style={styles.image}
                  resizeMode="cover"
                />
                {message.viewOnce ? (
                  <Text style={styles.viewOnceHint}>
                    {isMine ? 'Enviada · una vez' : 'Una sola vista'}
                  </Text>
                ) : null}
              </Pressable>
            ) : null}

            {!message.deletedAt &&
            message.mediaType === 'audio' &&
            viewOncePending ? (
              <Pressable style={styles.viewOnceBtn} onPress={openViewOnce}>
                <Feather name="headphones" size={22} color={colors.accent} />
                <Text
                  style={[styles.text, isMine ? styles.textMine : styles.textTheirs]}
                >
                  Audio · escuchar una vez
                </Text>
              </Pressable>
            ) : null}

            {!message.deletedAt &&
            message.mediaType === 'audio' &&
            mediaUri ? (
              <Pressable
                style={styles.audioRow}
                onPress={() => void playAudio(mediaUri)}
              >
                <Feather
                  name={playing ? 'pause' : 'play'}
                  size={20}
                  color={isMine ? colors.textInverse : colors.accent}
                />
                <Text
                  style={[styles.text, isMine ? styles.textMine : styles.textTheirs]}
                >
                  {message.viewOnce ? 'Nota de voz · una vez' : 'Nota de voz'}
                </Text>
              </Pressable>
            ) : null}

            {!message.deletedAt && message.mediaType === 'file' && mediaUri ? (
              <Pressable
                style={styles.audioRow}
                onPress={() => Linking.openURL(mediaUri)}
              >
                <Feather
                  name="file-text"
                  size={20}
                  color={isMine ? colors.textInverse : colors.accent}
                />
                <Text
                  style={[
                    styles.text,
                    isMine ? styles.textMine : styles.textTheirs,
                  ]}
                  numberOfLines={2}
                >
                  {displayText.replace(/^📄\s*/, '') || 'Documento'}
                </Text>
              </Pressable>
            ) : null}

            {!message.deletedAt &&
            (!message.mediaType ||
              message.mediaType === 'image' ||
              !['audio', 'file'].includes(message.mediaType)) &&
            !(message.mediaType === 'image' && !displayText.replace(/^📷\s*/, '')) ? (
              <Text style={[styles.text, isMine ? styles.textMine : styles.textTheirs]}>
                {message.mediaType === 'image' && displayText.startsWith('📷')
                  ? ''
                  : displayText}
              </Text>
            ) : null}

            {!message.deletedAt &&
            message.mediaType === 'image' &&
            displayText &&
            !displayText.startsWith('📷') ? (
              <Text style={[styles.text, isMine ? styles.textMine : styles.textTheirs]}>
                {displayText}
              </Text>
            ) : null}
          </View>
        </Pressable>

        {!message.deletedAt && reactions.length > 0 ? (
          <View
            style={[
              styles.reactionsRow,
              isMine ? styles.reactionsMine : styles.reactionsTheirs,
            ]}
          >
            {reactions.map((r) => (
              <Pressable
                key={r.emoji}
                style={[styles.reactionChip, r.me && styles.reactionChipMine]}
                onPress={() => onReact?.(message.id, r.emoji)}
              >
                <Text style={styles.reactionText}>
                  {r.emoji} {r.count > 1 ? r.count : ''}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {!message.deletedAt && translated && !isMine ? (
          <TranslationBadge
            fromLanguage={message.originalLanguage}
            onPress={handleShowOriginal}
          />
        ) : null}

        {!message.deletedAt && translated && isMine ? (
          <Pressable
            onPress={handleShowDelivered}
            style={({ pressed }) => [
              styles.deliveredBadge,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Ver cómo lo recibe el contacto"
          >
            <Text style={styles.deliveredText} numberOfLines={2}>
              🌐 Ellos ven: {message.translatedText}
            </Text>
          </Pressable>
        ) : null}

        <View
          style={[
            styles.metaRow,
            isMine ? styles.timestampMine : styles.timestampTheirs,
          ]}
        >
          <Text style={styles.timestamp}>
            {message.editedAt ? 'editado · ' : ''}
            {formatTime(message.createdAt)}
          </Text>
          {isMine && !message.deletedAt ? (
            <Text
              style={[
                styles.ticks,
                peerReadAt &&
                new Date(peerReadAt).getTime() >=
                  new Date(message.createdAt).getTime()
                  ? styles.ticksRead
                  : styles.ticksSent,
              ]}
            >
              {message.id.startsWith('__optimistic__') ? '✓' : '✓✓'}
            </Text>
          ) : null}
        </View>
      </View>

      <Modal
        visible={pickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerOpen(false)}>
          <View style={styles.emojiBar}>
            {REACTION_EMOJIS.map((emoji) => (
              <Pressable
                key={emoji}
                style={styles.emojiBtn}
                onPress={() => {
                  setPickerOpen(false);
                  onReact?.(message.id, emoji);
                }}
              >
                <Text style={styles.emojiGlyph}>{emoji}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={editOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setEditOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setEditOpen(false)}>
          <Pressable style={styles.editSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.editTitle}>Editar mensaje</Text>
            <TextInput
              style={styles.editInput}
              value={editText}
              onChangeText={setEditText}
              multiline
              autoFocus
              maxLength={4000}
            />
            <View style={styles.editActions}>
              <Pressable onPress={() => setEditOpen(false)}>
                <Text style={styles.editCancel}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  const next = editText.trim();
                  if (!next || next === message.originalText) {
                    setEditOpen(false);
                    return;
                  }
                  setEditOpen(false);
                  onEdit?.(message.id, next);
                }}
              >
                <Text style={styles.editSave}>Guardar</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = themed((colors) => ({
  row: {
    width: '100%',
    paddingHorizontal: spacing.xl,
    marginVertical: spacing.xs,
  },
  rowMine: { alignItems: 'flex-end' },
  rowTheirs: { alignItems: 'flex-start' },
  column: {
    maxWidth: MAX_BUBBLE_WIDTH,
    flexDirection: 'column',
  },
  bubble: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.chatBubbleBorder,
  },
  bubbleMine: {
    backgroundColor: colors.chatBubbleMine,
    borderTopRightRadius: radius.sm,
  },
  bubbleTheirs: {
    backgroundColor: colors.chatBubbleTheirs,
    borderTopLeftRadius: radius.sm,
  },
  bubbleDeleted: {
    opacity: 0.75,
  },
  deletedText: {
    fontStyle: 'italic',
  },
  replyQuote: {
    borderLeftWidth: 2,
    paddingLeft: spacing.sm,
    marginBottom: spacing.sm,
    opacity: 0.9,
  },
  replyQuoteMine: {
    borderLeftColor: colors.chatNeon,
  },
  replyQuoteTheirs: {
    borderLeftColor: colors.chatNeonDim,
  },
  replyAuthor: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
    marginBottom: 2,
  },
  replyAuthorMine: { color: colors.chatNeon },
  replyAuthorTheirs: { color: colors.chatNeon },
  replyBody: {
    fontSize: fontSize.caption,
  },
  replyBodyMine: { color: colors.chatNeonDim },
  replyBodyTheirs: { color: colors.chatNeonDim },
  image: {
    width: MAX_BUBBLE_WIDTH - spacing.md * 2,
    height: 200,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.border,
  },
  audioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  pollBox: {
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  pollOpt: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginTop: 4,
  },
  viewOnceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
  },
  viewOnceHint: {
    fontSize: fontSize.caption,
    color: colors.chatNeonDim,
    marginTop: -4,
    marginBottom: spacing.sm,
  },
  text: {
    fontSize: fontSize.bodyLg,
    lineHeight: fontSize.bodyLg * 1.4,
    letterSpacing: 0.2,
  },
  textMine: { color: colors.chatNeon },
  textTheirs: { color: colors.chatNeon },
  reactionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: -6,
    marginBottom: 2,
  },
  reactionsMine: { alignSelf: 'flex-end' },
  reactionsTheirs: { alignSelf: 'flex-start' },
  reactionChip: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  reactionChipMine: {
    borderColor: colors.accent,
    backgroundColor: colors.badgeBackground,
  },
  reactionText: {
    fontSize: fontSize.caption,
  },
  deliveredBadge: {
    alignSelf: 'flex-end',
    backgroundColor: colors.badgeBackground,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginTop: spacing.xs,
    maxWidth: '100%',
  },
  pressed: { opacity: 0.7 },
  deliveredText: {
    color: colors.badgeText,
    fontSize: fontSize.caption,
    fontWeight: fontWeight.medium,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xs,
  },
  timestamp: {
    fontSize: fontSize.caption,
    color: colors.chatNeonDim,
  },
  timestampMine: { alignSelf: 'flex-end' },
  timestampTheirs: { alignSelf: 'flex-start' },
  ticks: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
  },
  ticksSent: { color: colors.chatNeonDim },
  ticksRead: { color: colors.chatNeon },
  modalBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  emojiBar: {
    alignSelf: 'center',
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  emojiBtn: {
    padding: spacing.sm,
  },
  emojiGlyph: {
    fontSize: 28,
  },
  editSheet: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
  },
  editTitle: {
    fontSize: fontSize.bodyLg,
    fontWeight: fontWeight.semibold,
    color: colors.chatNeon,
    marginBottom: spacing.md,
  },
  editInput: {
    minHeight: 88,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.chatBubbleBorder,
    borderRadius: radius.md,
    padding: spacing.md,
    color: colors.chatNeon,
    fontSize: fontSize.bodyLg,
    textAlignVertical: 'top',
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.xl,
    marginTop: spacing.lg,
  },
  editCancel: {
    color: colors.textSecondary,
    fontSize: fontSize.bodyLg,
  },
  editSave: {
    color: colors.accent,
    fontWeight: fontWeight.semibold,
    fontSize: fontSize.bodyLg,
  },
}));

export default ChatBubble;
