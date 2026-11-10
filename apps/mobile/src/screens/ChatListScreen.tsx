/**
 * ChatListScreen — main inbox.
 *
 * Header: "Synapmsg" title + settings icon (top right)
 * List rows: avatar + contact name + last-message preview + timestamp + unread badge
 * Pull-to-refresh
 * FAB (+) bottom right → NewChatScreen
 * Empty state: "No chats yet. Tap + to start a conversation!"
 *
 * Real-time: the chats store is updated by the global WebSocket listener
 * registered in App.tsx, so we just subscribe to the store.
 */

import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  ListRenderItem,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import colors from '../theme/colors';
import { fontSize, fontWeight, radius, spacing } from '../theme/spacing';
import { useAuthStore } from '../store/auth';
import { useChatsStore } from '../store/chats';
import { Chat, RootStackParamList } from '../types';
import { UserAvatar } from '../components/UserAvatar';
import { EmptyState } from '../components/EmptyState';

function formatPreviewTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  // Within the last 7 days → weekday; older → date.
  const diffMs = now.getTime() - d.getTime();
  const oneDayMs = 24 * 60 * 60 * 1000;
  if (diffMs < 7 * oneDayMs) {
    return d.toLocaleDateString([], { weekday: 'short' });
  }
  return d.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
}

export function ChatListScreen(): JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList, 'ChatList'>>();

  const me = useAuthStore((s) => s.user);
  const chats = useChatsStore((s) => s.chats);
  const unreadByChat = useChatsStore((s) => s.unreadByChat);
  const isLoading = useChatsStore((s) => s.isLoading);
  const fetchChats = useChatsStore((s) => s.fetchChats);
  const clearUnread = useChatsStore((s) => s.clearUnread);

  const onRefresh = useCallback(() => {
    void fetchChats();
  }, [fetchChats]);

  const openChat = useCallback(
    (chat: Chat) => {
      const other = chat.participants.find((p) => p.userId !== me?.id);
      const contactName = other?.user.name ?? 'Chat';
      const contactLanguage = other?.user.preferredLanguage;
      clearUnread(chat.id);
      navigation.navigate('Chat', {
        chatId: chat.id,
        contactName,
        contactLanguage,
      });
    },
    [me, navigation, clearUnread],
  );

  const openSettings = useCallback(() => {
    navigation.navigate('Settings');
  }, [navigation]);

  const startNewChat = useCallback(() => {
    navigation.navigate('NewChat');
  }, [navigation]);

  const renderItem: ListRenderItem<Chat> = useCallback(
    ({ item }) => {
      const other = item.participants.find((p) => p.userId !== me?.id);
      const contactName = other?.user.name ?? 'Unknown';
      const preview = item.lastMessage?.text ?? 'No messages yet';
      const unread = unreadByChat[item.id] ?? 0;

      return (
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => openChat(item)}
        >
          <UserAvatar name={contactName} size={48} />
          <View style={styles.rowMain}>
            <View style={styles.rowHeader}>
              <Text style={styles.contactName} numberOfLines={1}>
                {contactName}
              </Text>
              <Text style={styles.timestamp}>
                {formatPreviewTime(item.lastMessage?.createdAt ?? item.updatedAt)}
              </Text>
            </View>
            <View style={styles.rowFooter}>
              <Text
                style={[styles.preview, unread > 0 && styles.previewUnread]}
                numberOfLines={1}
              >
                {preview}
              </Text>
              {unread > 0 ? (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadText}>
                    {unread > 99 ? '99+' : unread}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </Pressable>
      );
    },
    [me, unreadByChat, openChat],
  );

  const list = useMemo(() => chats, [chats]);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Text style={styles.headerTitle}>Synapmsg</Text>
        <Pressable onPress={openSettings} hitSlop={12} style={styles.iconBtn}>
          <Feather name="settings" size={22} color={colors.textPrimary} />
        </Pressable>
      </View>

      <FlatList
        data={list}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[
          styles.list,
          list.length === 0 && styles.emptyList,
          { paddingBottom: insets.bottom + 80 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={onRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <EmptyState
            icon="message-square"
            title="No chats yet"
            subtitle="Tap + to start a conversation!"
          />
        }
      />

      <Pressable
        style={({ pressed }) => [
          styles.fab,
          pressed && styles.fabPressed,
          { bottom: insets.bottom + spacing.xl },
        ]}
        onPress={startNewChat}
        accessibilityRole="button"
        accessibilityLabel="Start new chat"
      >
        <Feather name="plus" size={26} color={colors.textInverse} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    backgroundColor: colors.background,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.h2,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.5,
  },
  iconBtn: { padding: spacing.xs },
  list: { paddingHorizontal: spacing.md },
  emptyList: { flexGrow: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.background,
  },
  rowPressed: { backgroundColor: colors.ripple },
  rowMain: {
    flex: 1,
    marginLeft: spacing.md,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  contactName: {
    color: colors.textPrimary,
    fontSize: fontSize.bodyLg,
    fontWeight: fontWeight.semibold,
    flex: 1,
    marginRight: spacing.sm,
  },
  timestamp: {
    color: colors.textSecondary,
    fontSize: fontSize.caption,
  },
  rowFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  preview: {
    color: colors.textSecondary,
    fontSize: fontSize.body,
    flex: 1,
    marginRight: spacing.sm,
  },
  previewUnread: {
    color: colors.textPrimary,
    fontWeight: fontWeight.medium,
  },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadText: {
    color: colors.textInverse,
    fontSize: fontSize.caption,
    fontWeight: fontWeight.bold,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginHorizontal: spacing.md + 48 + spacing.md,
  },
  fab: {
    position: 'absolute',
    right: spacing.xl,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  fabPressed: { opacity: 0.85 },
});

export default ChatListScreen;
