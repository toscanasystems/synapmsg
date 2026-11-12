/**
 * NewGroupScreen — crear grupo Synapmsg (norte: paridad WhatsApp/Telegram).
 */

import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import colors from '../theme/colors';
import { fontSize, fontWeight, radius, spacing } from '../theme/spacing';
import { useChatsStore } from '../store/chats';
import chatsApi from '../api/chats';
import { RootStackParamList, User } from '../types';
import { UserAvatar } from '../components/UserAvatar';

export function NewGroupScreen(): JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const createGroup = useChatsStore((s) => s.createGroup);

  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [selected, setSelected] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);

  const search = useCallback(async (q: string) => {
    setQuery(q);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const users = await chatsApi.searchUsers(q.trim());
      setResults(users);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const toggle = useCallback((user: User) => {
    setSelected((prev) => {
      if (prev.some((u) => u.id === user.id)) {
        return prev.filter((u) => u.id !== user.id);
      }
      return [...prev, user];
    });
  }, []);

  const onCreate = useCallback(async () => {
    if (!name.trim()) {
      Alert.alert('Grupo', 'Ponle un nombre al grupo.');
      return;
    }
    if (selected.length === 0) {
      Alert.alert('Grupo', 'Elige al menos un participante.');
      return;
    }
    setCreating(true);
    try {
      const chat = await createGroup(
        name.trim(),
        selected.map((u) => u.id),
      );
      navigation.replace('Chat', {
        chatId: chat.id,
        contactName: chat.name || name.trim(),
      });
    } catch (err) {
      Alert.alert(
        'Grupo',
        err instanceof Error ? err.message : 'No se pudo crear.',
      );
    } finally {
      setCreating(false);
    }
  }, [name, selected, createGroup, navigation]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Feather name="arrow-left" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>Nuevo grupo</Text>
        <Pressable
          onPress={() => void onCreate()}
          disabled={creating}
          hitSlop={8}
        >
          {creating ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <Text style={styles.create}>Crear</Text>
          )}
        </Pressable>
      </View>

      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Nombre del grupo"
        placeholderTextColor={colors.textSecondary}
        style={styles.nameInput}
        maxLength={80}
      />

      {selected.length > 0 ? (
        <View style={styles.chips}>
          {selected.map((u) => (
            <Pressable
              key={u.id}
              style={styles.chip}
              onPress={() => toggle(u)}
            >
              <Text style={styles.chipText}>{u.name}</Text>
              <Feather name="x" size={14} color={colors.textInverse} />
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.searchWrap}>
        <Feather name="search" size={18} color={colors.textSecondary} />
        <TextInput
          value={query}
          onChangeText={(t) => void search(t)}
          placeholder="Buscar personas…"
          placeholderTextColor={colors.textSecondary}
          style={styles.searchInput}
          autoCorrect={false}
        />
        {searching ? <ActivityIndicator color={colors.accent} /> : null}
      </View>

      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          const on = selected.some((u) => u.id === item.id);
          return (
            <Pressable
              style={[styles.row, on && styles.rowOn]}
              onPress={() => toggle(item)}
            >
              <UserAvatar name={item.name} size={40} />
              <View style={styles.rowMain}>
                <Text style={styles.rowName}>{item.name}</Text>
                <Text style={styles.rowMeta}>@{item.username}</Text>
              </View>
              <Feather
                name={on ? 'check-circle' : 'circle'}
                size={22}
                color={on ? colors.accent : colors.textSecondary}
              />
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {query.length < 2
              ? 'Escribe al menos 2 letras para buscar.'
              : 'Sin resultados.'}
          </Text>
        }
      />
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
    marginBottom: spacing.md,
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSize.h3,
    fontWeight: fontWeight.bold,
  },
  create: {
    color: colors.accent,
    fontWeight: fontWeight.bold,
    fontSize: fontSize.bodyLg,
  },
  nameInput: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: colors.textPrimary,
    fontSize: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  chipText: {
    color: colors.textInverse,
    fontWeight: fontWeight.semibold,
    fontSize: fontSize.caption,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    paddingVertical: spacing.md,
    color: colors.textPrimary,
    fontSize: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowOn: { backgroundColor: colors.ripple },
  rowMain: { flex: 1, marginLeft: spacing.md },
  rowName: {
    color: colors.textPrimary,
    fontWeight: fontWeight.semibold,
    fontSize: fontSize.bodyLg,
  },
  rowMeta: { color: colors.textSecondary, fontSize: fontSize.caption },
  empty: {
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xxl,
    paddingHorizontal: spacing.xxl,
  },
});

export default NewGroupScreen;
