/**
 * ContactsScreen — agenda del teléfono.
 * Lista TODOS los contactos locales (buscables).
 * Si el email coincide con un usuario Synap → chat.
 * Si no → Invitar.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  Share,
  Linking,
  Platform,
  ListRenderItem,
} from 'react-native';
import * as Contacts from 'expo-contacts';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import colors, { themed } from '../theme/colors';
import { fontSize, fontWeight, radius, spacing } from '../theme/spacing';
import { useChatsStore } from '../store/chats';
import { RootStackParamList, User } from '../types';
import { UserAvatar } from '../components/UserAvatar';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/auth';

export type PhoneContact = {
  id: string;
  name: string;
  emails: string[];
  phones: string[];
  synapUser?: User;
};

function normalizeEmail(e: string): string {
  return e.trim().toLowerCase();
}

async function matchEmails(emails: string[]): Promise<User[]> {
  if (!emails.length) return [];
  const unique = Array.from(new Set(emails.map(normalizeEmail).filter((e) => e.includes('@'))));
  const all: User[] = [];
  for (let i = 0; i < unique.length; i += 150) {
    const chunk = unique.slice(i, i + 150);
    try {
      const { data } = await apiClient.post<{ users: User[] }>('/users/match', {
        emails: chunk,
      });
      all.push(...(data.users ?? []));
    } catch {
      /* ignore chunk errors */
    }
  }
  return all;
}

export function ContactsScreen(): JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const me = useAuthStore((s) => s.user);
  const startChat = useChatsStore((s) => s.startChat);

  const [permission, setPermission] = useState<Contacts.PermissionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [matching, setMatching] = useState(false);
  const [contacts, setContacts] = useState<PhoneContact[]>([]);
  const [query, setQuery] = useState('');
  const [startingId, setStartingId] = useState<string | null>(null);

  const loadContacts = useCallback(async () => {
    setLoading(true);
    try {
      const current = await Contacts.getPermissionsAsync();
      let status = current.status;
      if (status !== 'granted') {
        const asked = await Contacts.requestPermissionsAsync();
        status = asked.status;
      }
      setPermission(status);
      if (status !== 'granted') {
        setContacts([]);
        setLoading(false);
        return;
      }

      const raw: Contacts.Contact[] = [];
      let pageOffset = 0;
      const pageSize = 300;
      // Paginate until the agenda is exhausted (hundreds of contacts).
      for (;;) {
        const page = await Contacts.getContactsAsync({
          fields: [
            Contacts.Fields.Emails,
            Contacts.Fields.PhoneNumbers,
            Contacts.Fields.Name,
          ],
          sort: Contacts.SortTypes.FirstName,
          pageSize,
          pageOffset,
        });
        const batch = page.data ?? [];
        raw.push(...batch);
        if (batch.length < pageSize || !page.hasNextPage) break;
        pageOffset += pageSize;
        if (pageOffset > 20000) break;
      }

      const mapped: PhoneContact[] = raw
        .map((c) => {
          const name =
            c.name?.trim() ||
            [c.firstName, c.lastName].filter(Boolean).join(' ').trim() ||
            'Sin nombre';
          const emails = (c.emails ?? [])
            .map((e) => e.email)
            .filter((e): e is string => Boolean(e && e.includes('@')))
            .map(normalizeEmail);
          const phones = (c.phoneNumbers ?? [])
            .map((p) => p.number)
            .filter((n): n is string => Boolean(n && n.trim()))
            .map((n) => n.trim());
          return {
            id: c.id || `${name}-${emails[0] || phones[0] || Math.random()}`,
            name,
            emails,
            phones,
          };
        })
        .filter((c) => c.name !== 'Sin nombre' || c.emails.length || c.phones.length)
        .sort((a, b) => a.name.localeCompare(b.name, 'es'));

      setContacts(mapped);
      setLoading(false);

      // Match Synap users by email in background
      setMatching(true);
      const emails = mapped.flatMap((c) => c.emails);
      const users = await matchEmails(emails);
      const byEmail = new Map(users.map((u) => [normalizeEmail(u.email), u]));
      setContacts((prev) =>
        prev.map((c) => {
          const hit = c.emails.map((e) => byEmail.get(e)).find(Boolean);
          return hit ? { ...c, synapUser: hit } : c;
        }),
      );
    } catch (err) {
      Alert.alert(
        'Contactos',
        err instanceof Error ? err.message : 'No se pudieron leer los contactos.',
      );
      setContacts([]);
    } finally {
      setLoading(false);
      setMatching(false);
    }
  }, []);

  useEffect(() => {
    void loadContacts();
  }, [loadContacts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) => {
      if (c.name.toLowerCase().includes(q)) return true;
      if (c.emails.some((e) => e.includes(q))) return true;
      if (c.phones.some((p) => p.replace(/\s/g, '').includes(q.replace(/\s/g, '')))) {
        return true;
      }
      if (c.synapUser?.username?.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [contacts, query]);

  const onSynap = useMemo(
    () => filtered.filter((c) => c.synapUser).length,
    [filtered],
  );

  const openChat = useCallback(
    async (c: PhoneContact) => {
      if (!c.synapUser) return;
      if (c.synapUser.id === me?.id) {
        Alert.alert('Ese eres tú', 'No puedes chatear contigo mismo.');
        return;
      }
      setStartingId(c.id);
      try {
        const chat = await startChat(c.synapUser.id);
        navigation.replace('Chat', {
          chatId: chat.id,
          contactName: c.synapUser.name || c.name,
          contactLanguage: c.synapUser.preferredLanguage,
        });
      } catch (err) {
        Alert.alert(
          'Chat',
          err instanceof Error ? err.message : 'No se pudo abrir el chat.',
        );
      } finally {
        setStartingId(null);
      }
    },
    [startChat, navigation, me],
  );

  const invite = useCallback(async (c: PhoneContact) => {
    const phone = c.phones[0];
    const msg =
      `Hola${c.name ? ` ${c.name.split(' ')[0]}` : ''}, únete a Synap ` +
      `(chat Privado: el servidor no lee el mensaje).\nhttps://synapmsg.ai` +
      (me ? `\nBúscame como @${me.username}` : '');
    try {
      if (phone && Platform.OS === 'android') {
        const url = `sms:${phone.replace(/\s/g, '')}?body=${encodeURIComponent(msg)}`;
        const can = await Linking.canOpenURL(url);
        if (can) {
          await Linking.openURL(url);
          return;
        }
      }
      await Share.share({ message: msg });
    } catch {
      /* cancelled */
    }
  }, [me]);

  const renderItem: ListRenderItem<PhoneContact> = useCallback(
    ({ item }) => {
      const onApp = Boolean(item.synapUser);
      const subtitle = onApp
        ? `@${item.synapUser!.username} · en Synap`
        : item.phones[0] || item.emails[0] || 'Sin teléfono/email';

      return (
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => {
            if (onApp) void openChat(item);
            else void invite(item);
          }}
          disabled={startingId !== null}
        >
          <UserAvatar name={item.name} size={44} />
          <View style={styles.rowMain}>
            <Text style={styles.name} numberOfLines={1}>
              {item.name}
            </Text>
            <Text
              style={[styles.meta, onApp && styles.metaOnApp]}
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          </View>
          {startingId === item.id ? (
            <ActivityIndicator color={colors.accent} />
          ) : onApp ? (
            <View style={styles.chatPill}>
              <Text style={styles.chatPillText}>Chat</Text>
            </View>
          ) : (
            <View style={styles.invitePill}>
              <Text style={styles.invitePillText}>Invitar</Text>
            </View>
          )}
        </Pressable>
      );
    },
    [openChat, invite, startingId],
  );

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
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Contactos</Text>
          <Text style={styles.headerSub}>
            {loading
              ? 'Leyendo agenda…'
              : `${filtered.length} contactos` +
                (matching ? ' · buscando en Synap…' : ` · ${onSynap} en Synap`)}
          </Text>
        </View>
        <Pressable onPress={() => void loadContacts()} hitSlop={12} style={styles.backBtn}>
          <Feather name="refresh-cw" size={20} color={colors.textPrimary} />
        </Pressable>
      </View>

      {permission && permission !== 'granted' ? (
        <View style={styles.permBox}>
          <Text style={styles.permTitle}>Permiso de contactos</Text>
          <Text style={styles.permBody}>
            Synap necesita acceso a tu agenda para mostrar con quién puedes hablar
            e invitar al resto.
          </Text>
          <Pressable style={styles.permBtn} onPress={() => void loadContacts()}>
            <Text style={styles.permBtnText}>Permitir contactos</Text>
          </Pressable>
          <Pressable
            style={styles.permLink}
            onPress={() => Linking.openSettings()}
          >
            <Text style={styles.permLinkText}>Abrir ajustes del sistema</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.searchWrap}>
            <Feather
              name="search"
              size={18}
              color={colors.textSecondary}
              style={styles.searchIcon}
            />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Buscar en tu agenda…"
              placeholderTextColor={colors.textSecondary}
              style={styles.searchInput}
              autoCorrect={false}
            />
            {query.length > 0 ? (
              <Pressable onPress={() => setQuery('')} hitSlop={8}>
                <Feather name="x-circle" size={18} color={colors.textSecondary} />
              </Pressable>
            ) : null}
          </View>

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={colors.accent} />
              <Text style={styles.loadingText}>Cargando cientos de contactos…</Text>
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              initialNumToRender={24}
              windowSize={12}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                paddingBottom: insets.bottom + spacing.xl,
                paddingHorizontal: spacing.md,
              }}
              ListEmptyComponent={
                <View style={styles.center}>
                  <Text style={styles.emptyTitle}>Sin resultados</Text>
                  <Text style={styles.emptySub}>
                    Prueba otro nombre o recarga la agenda.
                  </Text>
                </View>
              }
              ListHeaderComponent={
                filtered.length > 0 ? (
                  <Text style={styles.hint}>
                    En Synap → Chat. El resto → Invitar por SMS/compartir.
                  </Text>
                ) : null
              }
            />
          )}
        </>
      )}
    </View>
  );
}

const styles = themed((colors) => ({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  backBtn: { padding: spacing.xs },
  headerText: { flex: 1, marginHorizontal: spacing.sm },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.h2,
    fontWeight: fontWeight.bold,
  },
  headerSub: {
    color: colors.textSecondary,
    fontSize: fontSize.caption,
    marginTop: 2,
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
  hint: {
    color: colors.textSecondary,
    fontSize: fontSize.caption,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    minHeight: 64,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowPressed: { backgroundColor: colors.ripple },
  rowMain: { flex: 1, marginLeft: spacing.md, marginRight: spacing.sm },
  name: {
    color: colors.textPrimary,
    fontSize: fontSize.bodyLg,
    fontWeight: fontWeight.semibold,
  },
  meta: { color: colors.textSecondary, fontSize: fontSize.caption, marginTop: 2 },
  metaOnApp: { color: colors.accent },
  chatPill: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  chatPillText: {
    color: colors.textInverse,
    fontWeight: fontWeight.bold,
    fontSize: fontSize.caption,
  },
  invitePill: {
    borderWidth: 1,
    borderColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  invitePillText: {
    color: colors.accent,
    fontWeight: fontWeight.semibold,
    fontSize: fontSize.caption,
  },
  center: { padding: spacing.xxl, alignItems: 'center' },
  loadingText: { color: colors.textSecondary, marginTop: spacing.md },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.title,
    fontWeight: fontWeight.semibold,
  },
  emptySub: { color: colors.textSecondary, marginTop: spacing.sm, textAlign: 'center' },
  permBox: { padding: spacing.xxl },
  permTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.h3,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.sm,
  },
  permBody: { color: colors.textSecondary, lineHeight: 22, marginBottom: spacing.xl },
  permBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  permBtnText: {
    color: colors.textInverse,
    fontWeight: fontWeight.bold,
    fontSize: fontSize.bodyLg,
  },
  permLink: { marginTop: spacing.lg, alignItems: 'center' },
  permLinkText: { color: colors.accent, fontSize: fontSize.body },
}));

export default ContactsScreen;
