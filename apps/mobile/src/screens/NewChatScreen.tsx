/**
 * NewChatScreen — search for a user and start a 1-on-1 chat.
 *
 * Header: back arrow + "New Chat"
 * Search bar at top (debounced 300ms)
 * Results list (same row layout as ChatListScreen)
 * Tap user → startChat(userId) → ChatScreen
 *
 * Empty state: "Search for someone to chat with"
 * No results state: "No users found"
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  Pressable,
  ActivityIndicator,
  ListRenderItem,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import colors from '../theme/colors';
import { fontSize, fontWeight, radius, spacing } from '../theme/spacing';
import { useChatsStore } from '../store/chats';
import { RootStackParamList, User } from '../types';
import { UserAvatar } from '../components/UserAvatar';
import { EmptyState } from '../components/EmptyState';
import chatsApi from '../api/chats';

const DEBOUNCE_MS = 300;

export function NewChatScreen(): JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList, 'NewChat'>>();

  const startChat = useChatsStore((s) => s.startChat);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [isStarting, setIsStarting] = useState<string | null>(null); // userId being started
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setHasSearched(false);
      return;
    }
    setIsSearching(true);
    try {
      const users = await chatsApi.searchUsers(q.trim());
      setResults(users);
      setHasSearched(true);
    } catch {
      setResults([]);
      setHasSearched(true);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Debounce search input.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runSearch(query);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, runSearch]);

  const handleSelectUser = useCallback(
    async (user: User) => {
      setIsStarting(user.id);
      try {
        const chat = await startChat(user.id);
        navigation.replace('Chat', {
          chatId: chat.id,
          contactName: user.name,
          contactLanguage: user.preferredLanguage,
        });
      } catch {
        // startChat sets store error; surface a quick alert.
      } finally {
        setIsStarting(null);
      }
    },
    [startChat, navigation],
  );

  const renderItem: ListRenderItem<User> = useCallback(
    ({ item }) => (
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        onPress={() => handleSelectUser(item)}
        disabled={isStarting !== null}
      >
        <UserAvatar name={item.name} size={44} />
        <View style={styles.rowMain}>
          <Text style={styles.name} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.username} numberOfLines={1}>
            @{item.username}
          </Text>
        </View>
        {isStarting === item.id ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <Feather name="chevron-right" size={20} color={colors.textSecondary} />
        )}
      </Pressable>
    ),
    [handleSelectUser, isStarting],
  );

  const renderEmpty = useCallback(() => {
    if (isSearching) return null;
    if (!hasSearched || !query.trim()) {
      return (
        <EmptyState
          icon="search"
          title="Search for someone"
          subtitle="Find people by name, username, or email to start a conversation."
        />
      );
    }
    return (
      <EmptyState
        icon="user-x"
        title="No users found"
        subtitle={`No matches for "${query.trim()}".`}
      />
    );
  }, [isSearching, hasSearched, query]);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          style={styles.backBtn}
        >
          <Feather name="arrow-left" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>New Chat</Text>
      </View>

      <View style={styles.searchWrap}>
        <Feather name="search" size={18} color={colors.textSecondary} style={styles.searchIcon} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search by name, @username, or email"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="default"
          returnKeyType="search"
          style={styles.searchInput}
          autoFocus
        />
        {query.length > 0 ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8} style={styles.clearBtn}>
            <Feather name="x-circle" size={18} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: insets.bottom + spacing.xl },
          results.length === 0 && styles.emptyList,
        ]}
        ListEmptyComponent={renderEmpty}
        keyboardShouldPersistTaps="handled"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  backBtn: { padding: spacing.xs },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.h2,
    fontWeight: fontWeight.bold,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  searchIcon: { marginRight: spacing.md },
  searchInput: {
    flex: 1,
    paddingVertical: spacing.md,
    color: colors.textPrimary,
    fontSize: 16,
  },
  clearBtn: { padding: spacing.xs },
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
  name: {
    color: colors.textPrimary,
    fontSize: fontSize.bodyLg,
    fontWeight: fontWeight.semibold,
  },
  username: {
    color: colors.textSecondary,
    fontSize: fontSize.caption,
    marginTop: 2,
  },
});

export default NewChatScreen;
