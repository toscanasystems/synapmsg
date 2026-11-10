/**
 * ChatScreen — the conversation thread.
 *
 * Header: back arrow + avatar + contact name + language indicator ("🇪🇸 → 🇬🇧")
 * Messages: inverted FlatList (newest at the bottom, auto-scrolled).
 *   • Sent:    mint green bubble, right-aligned, white text
 *   • Received: white bubble, left-aligned, dark text
 *   • Received + translated: TranslationBadge below; tap → Alert with original
 * Input bar: sticky at the bottom; KeyboardAvoidingView for iOS.
 *
 * Real-time: the chats store is updated by the global WS listener — we
 * simply subscribe to messagesByChat[chatId].
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Alert,
  Platform,
  KeyboardAvoidingView,
  ListRenderItem,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import colors from '../theme/colors';
import { fontSize, fontWeight, radius, spacing } from '../theme/spacing';
import { useAuthStore } from '../store/auth';
import { useChatsStore } from '../store/chats';
import chatsApi from '../api/chats';
import { Message, RootStackParamList, languageFlag, languageLabel } from '../types';
import { ChatBubble } from '../components/ChatBubble';
import { MessageInput } from '../components/MessageInput';
import { UserAvatar } from '../components/UserAvatar';
import { Loading } from '../components/Loading';

export function ChatScreen(): JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList, 'Chat'>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Chat'>>();
  const { chatId, contactName: initialContactName, contactLanguage: initialContactLang } = route.params;

  const me = useAuthStore((s) => s.user);
  const messages = useChatsStore((s) => s.messagesByChat[chatId] ?? []);
  const sendingChatId = useChatsStore((s) => s.sendingChatId);
  const fetchMessages = useChatsStore((s) => s.fetchMessages);
  const sendMessage = useChatsStore((s) => s.sendMessage);

  const [contactName, setContactName] = useState(initialContactName ?? 'Chat');
  const [contactLanguage, setContactLanguage] = useState(initialContactLang ?? '');
  const [loadingMessages, setLoadingMessages] = useState(true);

  // Fetch chat detail on mount so we always know the contact + language,
  // even when arriving from a deep link without route params.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const detail = await chatsApi.detail(chatId);
        if (cancelled) return;
        const other = detail.participants.find((p) => p.userId !== me?.id);
        if (other) {
          setContactName(other.user.name);
          setContactLanguage(other.user.preferredLanguage);
        }
      } catch {
        // Fall back to route params (already set as initial state).
      } finally {
        if (!cancelled) setLoadingMessages(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chatId, me]);

  // Load messages (only if not already cached).
  useEffect(() => {
    void fetchMessages(chatId).finally(() => setLoadingMessages(false));
  }, [chatId, fetchMessages]);

  // FlatList is inverted, so we reverse the chronological array for display.
  const invertedMessages = useMemo(() => [...messages].reverse(), [messages]);

  const renderItem: ListRenderItem<Message> = useCallback(
    ({ item }) => {
      const isMine = item.senderId === me?.id;
      return <ChatBubble message={item} isMine={isMine} />;
    },
    [me],
  );

  const handleSend = useCallback(
    (text: string) => {
      void sendMessage(chatId, text);
    },
    [chatId, sendMessage],
  );

  const handleShowOriginal = useCallback((message: Message) => {
    Alert.alert(
      `Original · ${languageLabel(message.originalLanguage)}`,
      message.originalText,
      [{ text: 'OK' }],
    );
  }, []);

  const goBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('ChatList');
    }
  }, [navigation]);

  const langIndicator = useMemo(() => {
    const left = contactLanguage ? languageFlag(contactLanguage) : '🌐';
    const right = me ? languageFlag(me.preferredLanguage) : '🌐';
    return `${left} → ${right}`;
  }, [contactLanguage, me]);

  const isSending = sendingChatId === chatId;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.select({ ios: 0, android: undefined })}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top }]}>
          <Pressable onPress={goBack} hitSlop={12} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color={colors.textPrimary} />
          </Pressable>
          <UserAvatar name={contactName} size={36} />
          <View style={styles.headerText}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {contactName}
            </Text>
            <Text style={styles.headerLang}>{langIndicator}</Text>
          </View>
        </View>

        {/* Message list (inverted so newest appears at the bottom) */}
        {loadingMessages && messages.length === 0 ? (
          <Loading label="Loading messages…" />
        ) : (
          <FlatList
            data={invertedMessages}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            inverted
            contentContainerStyle={[
              styles.list,
              { paddingTop: spacing.md, paddingBottom: spacing.md },
            ]}
            onEndReachedThreshold={0.3}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>
                  Say hi to {contactName}! 👋
                </Text>
              </View>
            }
          />
        )}

        {/* Sending indicator above the input */}
        {isSending ? (
          <View style={styles.sendingRow}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={styles.sendingText}>Sending…</Text>
          </View>
        ) : null}

        <MessageInput onSend={handleSend} disabled={false} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  backBtn: { padding: spacing.xs },
  headerText: {
    flex: 1,
    flexDirection: 'column',
    marginLeft: spacing.sm,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.bodyLg,
    fontWeight: fontWeight.semibold,
  },
  headerLang: {
    color: colors.textSecondary,
    fontSize: fontSize.caption,
    marginTop: 2,
  },
  list: {
    flexGrow: 1,
  },
  emptyWrap: {
    padding: spacing.xxl,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: fontSize.body,
  },
  sendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
  },
  sendingText: {
    color: colors.textSecondary,
    fontSize: fontSize.caption,
  },
});

export default ChatScreen;
