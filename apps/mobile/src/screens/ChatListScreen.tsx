/**
 * ChatListScreen — inbox.
 * Uses ScrollView (not FlatList) to avoid Android removeClippedSubviews
 * eating taps on some Samsung devices.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  Image,
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import colors, { themed } from '../theme/colors';
import { fontSize, fontWeight, radius, spacing } from '../theme/spacing';
import { useAuthStore } from '../store/auth';
import { useChatsStore } from '../store/chats';
import { useChatPrefsStore } from '../store/chatPrefs';
import { useSmartFoldersStore } from '../store/smartFolders';
import { useHiddenChatsStore } from '../store/hiddenChats';
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
  const sessionOffline = useAuthStore((s) => s.sessionOffline);
  const retrySession = useAuthStore((s) => s.retrySession);
  const pendingRecoveryCode = useAuthStore((s) => s.pendingRecoveryCode);
  const chats = useChatsStore((s) => s.chats);
  const unreadByChat = useChatsStore((s) => s.unreadByChat);
  const isLoading = useChatsStore((s) => s.isLoading);
  const fetchChats = useChatsStore((s) => s.fetchChats);
  const clearUnread = useChatsStore((s) => s.clearUnread);
  const archivedChatIds = useChatPrefsStore((s) => s.archivedChatIds);
  const toggleArchive = useChatPrefsStore((s) => s.toggleArchive);
  const smartOn = useSmartFoldersStore((s) => s.enabled);
  const smartGroup = useSmartFoldersStore((s) => s.group);
  const hiddenIds = useHiddenChatsStore((s) => s.hiddenChatIds);
  const hiddenUnlocked = useHiddenChatsStore((s) => s.unlocked);
  const unlockHidden = useHiddenChatsStore((s) => s.unlockWithPin);
  const lockHidden = useHiddenChatsStore((s) => s.lockFolder);
  const [showArchived, setShowArchived] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [pinDraft, setPinDraft] = useState('');

  // After signup/rotate: show code screen on top of ChatList so hardware back works.
  useEffect(() => {
    if (pendingRecoveryCode) {
      navigation.navigate('RecoveryCode');
    }
  }, [pendingRecoveryCode, navigation]);

  const { activeChats, archivedChats, hiddenChats } = useMemo(() => {
    const hidden = chats.filter((c) => hiddenIds.includes(c.id));
    const archived = chats.filter(
      (c) => archivedChatIds.includes(c.id) && !hiddenIds.includes(c.id),
    );
    const active = chats.filter(
      (c) =>
        !archivedChatIds.includes(c.id) && !hiddenIds.includes(c.id),
    );
    return { activeChats: active, archivedChats: archived, hiddenChats: hidden };
  }, [chats, archivedChatIds, hiddenIds]);

  const visibleChats = showHidden
    ? hiddenChats
    : showArchived
      ? archivedChats
      : activeChats;
  const smartGrouped = useMemo(
    () => (smartOn && !showArchived ? smartGroup(visibleChats) : null),
    [smartOn, showArchived, smartGroup, visibleChats],
  );
  const openChat = useCallback(
    (chat: Chat) => {
      try {
        if (!chat?.id) {
          Alert.alert('Chat', 'Chat inválido.');
          return;
        }
        const other =
          chat.participants?.find((p) => p.userId !== me?.id) ??
          chat.participants?.find((p) => p.user?.id !== me?.id);
        const contactName =
          chat.type === 'group'
            ? chat.name || 'Grupo'
            : other?.user?.name ?? other?.user?.username ?? 'Chat';
        const contactLanguage = other?.user?.preferredLanguage;
        clearUnread(chat.id);
        navigation.push('Chat', {
          chatId: chat.id,
          contactName,
          contactLanguage,
        });
      } catch (err) {
        Alert.alert(
          'No se pudo abrir',
          err instanceof Error ? err.message : 'Error desconocido',
        );
      }
    },
    [me, navigation, clearUnread],
  );

  const findDemoEnglish = useCallback((): Chat | undefined => {
    return chats.find((c) =>
      c.participants?.some(
        (p) =>
          p.userId !== me?.id &&
          (p.user?.username === 'demo_en' ||
            (p.user?.name || '').toLowerCase().includes('english')),
      ),
    );
  }, [chats, me]);

  const openDemoEnglish = useCallback(() => {
    const demo = findDemoEnglish();
    if (demo) {
      openChat(demo);
      return;
    }
    navigation.push('NewChat');
  }, [findDemoEnglish, openChat, navigation]);

  const onRefresh = useCallback(() => {
    void fetchChats();
  }, [fetchChats]);

  return (
    <View style={styles.container} collapsable={false}>
      {sessionOffline ? (
        <View
          style={[
            styles.offlineBanner,
            { paddingTop: insets.top + spacing.sm },
          ]}
        >
          <Text style={styles.offlineText}>Sin conexión con el servidor</Text>
          <Pressable
            onPress={() => {
              void retrySession();
            }}
            style={styles.offlineBtn}
          >
            <Text style={styles.offlineBtnLabel}>Reintentar</Text>
          </Pressable>
        </View>
      ) : null}
      <View
        style={[
          styles.header,
          {
            paddingTop: sessionOffline
              ? spacing.md
              : insets.top + spacing.md,
          },
        ]}
      >
        <View style={styles.brandRow}>
          <Image
            source={require('../../assets/logo.png')}
            style={styles.brandLogo}
            accessibilityLabel="Synap"
          />
          <View>
            <Text style={styles.headerTitle}>Synap</Text>
            {me?.privateNumberFormatted || me?.privateNumber ? (
              <Text style={styles.myNumber}>
                {me.privateNumberFormatted ?? me.privateNumber}
              </Text>
            ) : null}
          </View>
          <View
            style={[
              styles.planChip,
              me?.plan === 'premium' ? styles.planChipPremium : null,
            ]}
          >
            <Text style={styles.planChipText}>
              {me?.plan === 'premium' ? 'Premium' : 'Gratis'}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {hiddenIds.length > 0 ? (
            <Pressable
              onPress={() => {
                if (hiddenUnlocked && showHidden) {
                  setShowHidden(false);
                  lockHidden();
                  return;
                }
                if (hiddenUnlocked) {
                  setShowHidden(true);
                  return;
                }
                setPinDraft('');
                setPinOpen(true);
              }}
              hitSlop={12}
              style={styles.iconBtn}
              accessibilityLabel="Chats ocultos"
            >
              <Feather
                name={showHidden ? 'eye' : 'eye-off'}
                size={22}
                color={showHidden ? colors.accent : colors.textPrimary}
              />
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => navigation.push('Settings')}
            hitSlop={16}
            style={styles.iconBtn}
            accessibilityRole="button"
            accessibilityLabel="Ajustes"
          >
            <Feather name="settings" size={22} color={colors.textPrimary} />
          </Pressable>
        </View>
      </View>

      <Pressable
        style={styles.demoBanner}
        onPress={() => navigation.push('Settings')}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Abrir seguridad en Ajustes"
      >
        <Text style={styles.demoBannerTitle}>Modo Privado por defecto</Text>
        <Text style={styles.demoBannerSub}>
          En Privado el servidor no guarda texto legible. Nube = el servidor puede
          leer — tocá Ajustes / privacidad del chat.
        </Text>
      </Pressable>

      {archivedChats.length > 0 && !showHidden ? (
        <Pressable
          style={styles.archiveToggle}
          onPress={() => setShowArchived((v) => !v)}
        >
          <Feather
            name="archive"
            size={16}
            color={colors.textSecondary}
          />
          <Text style={styles.archiveToggleText}>
            {showArchived
              ? 'Ver chats'
              : `Archivados (${archivedChats.length})`}
          </Text>
        </Pressable>
      ) : null}
      {showHidden ? (
        <View style={styles.archiveToggle}>
          <Feather name="eye-off" size={16} color={colors.accent} />
          <Text style={[styles.archiveToggleText, { color: colors.accent }]}>
            Chats ocultos ({hiddenChats.length})
          </Text>
        </View>
      ) : null}

      <Modal visible={pinOpen} transparent animationType="fade">
        <Pressable
          style={styles.pinOverlay}
          onPress={() => setPinOpen(false)}
        >
          <Pressable
            style={styles.pinCard}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={styles.pinTitle}>Chats ocultos</Text>
            <Text style={styles.pinSub}>Ingresá tu PIN de app</Text>
            <TextInput
              value={pinDraft}
              onChangeText={(t) => setPinDraft(t.replace(/\D/g, '').slice(0, 8))}
              secureTextEntry
              keyboardType="number-pad"
              style={styles.pinInput}
              placeholder="PIN"
              placeholderTextColor={colors.textSecondary}
              maxLength={8}
            />
            <Pressable
              style={styles.pinBtn}
              onPress={() => {
                void (async () => {
                  const ok = await unlockHidden(pinDraft);
                  if (!ok) {
                    Alert.alert('PIN', 'PIN incorrecto.');
                    return;
                  }
                  setPinOpen(false);
                  setShowHidden(true);
                  setPinDraft('');
                })();
              }}
            >
              <Text style={styles.pinBtnText}>Abrir</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.list,
          visibleChats.length === 0 && styles.emptyList,
          { paddingBottom: insets.bottom + 140 },
        ]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={onRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
      >
        {visibleChats.length === 0 ? (
          <EmptyState
            icon="message-square"
            title={showArchived ? 'Sin archivados' : 'Sin chats todavía'}
            subtitle={
              showArchived
                ? 'Los chats archivados aparecen aquí.'
                : 'Toca + y busca demo_en para probar chat + traducción.'
            }
          />
        ) : smartGrouped ? (
          (
            [
              ['urgente', 'Urgente'],
              ['trabajo', 'Trabajo'],
              ['personal', 'Personal'],
              ['otros', 'Otros'],
            ] as const
          ).map(([id, label]) => {
            const items = smartGrouped[id];
            if (!items.length) return null;
            return (
              <View key={id}>
                <Text style={styles.smartHeader}>{label}</Text>
                {items.map((item) => {
                  const other =
                    item.participants?.find((p) => p.userId !== me?.id) ??
                    item.participants?.find((p) => p.user?.id !== me?.id);
                  const isGroup = item.type === 'group';
                  const contactName = isGroup
                    ? item.name || 'Grupo'
                    : other?.user?.name ?? other?.user?.username ?? 'Unknown';
                  const preview = item.lastMessage?.text ?? 'Sin mensajes';
                  const unread = unreadByChat[item.id] ?? 0;
                  return (
                    <Pressable
                      key={item.id}
                      style={({ pressed }) => [
                        styles.row,
                        pressed && styles.rowPressed,
                      ]}
                      onPress={() => openChat(item)}
                      accessibilityRole="button"
                      accessibilityLabel={`Abrir chat con ${contactName}`}
                      hitSlop={4}
                    >
                      <UserAvatar name={contactName} size={48} />
                      <View style={styles.rowMain}>
                        <View style={styles.rowHeader}>
                          <Text style={styles.contactName} numberOfLines={1}>
                            {isGroup ? `👥 ${contactName}` : contactName}
                          </Text>
                          <Text style={styles.timestamp}>
                            {formatPreviewTime(
                              item.lastMessage?.createdAt ?? item.updatedAt,
                            )}
                          </Text>
                        </View>
                        <View style={styles.rowFooter}>
                          <Text
                            style={[
                              styles.preview,
                              unread > 0 && styles.previewUnread,
                            ]}
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
                })}
              </View>
            );
          })
        ) : (
          visibleChats.map((item) => {
            const other =
              item.participants?.find((p) => p.userId !== me?.id) ??
              item.participants?.find((p) => p.user?.id !== me?.id);
            const isGroup = item.type === 'group';
            const contactName = isGroup
              ? item.name || 'Grupo'
              : other?.user?.name ?? other?.user?.username ?? 'Unknown';
            const preview = item.lastMessage?.text ?? 'Sin mensajes';
            const unread = unreadByChat[item.id] ?? 0;

            return (
              <Pressable
                key={item.id}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                onPress={() => openChat(item)}
                onLongPress={() => {
                  if (!showArchived) return;
                  toggleArchive(item.id);
                  Alert.alert('Desarchivado', `${contactName} volvió a Chats.`);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Abrir chat con ${contactName}`}
                hitSlop={4}
              >
                <UserAvatar name={contactName} size={48} />
                <View style={styles.rowMain}>
                  <View style={styles.rowHeader}>
                    <Text style={styles.contactName} numberOfLines={1}>
                      {isGroup ? `👥 ${contactName}` : contactName}
                    </Text>
                    <Text style={styles.timestamp}>
                      {formatPreviewTime(
                        item.lastMessage?.createdAt ?? item.updatedAt,
                      )}
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
          })
        )}
      </ScrollView>

      <Pressable
        style={[styles.fabSecondary, { bottom: insets.bottom + 140 }]}
        onPress={() => navigation.push('NewGroup')}
        accessibilityRole="button"
        accessibilityLabel="Nuevo grupo"
        hitSlop={12}
      >
        <Feather name="users" size={22} color={colors.textInverse} />
      </Pressable>
      <Pressable
        style={[styles.fab, { bottom: insets.bottom + 72 }]}
        onPress={() => navigation.push('NewChat')}
        accessibilityRole="button"
        accessibilityLabel="Start new chat"
        hitSlop={12}
      >
        <Feather name="plus" size={26} color={colors.textInverse} />
      </Pressable>

      {/* Barra inferior estilo WhatsApp */}
      <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <Pressable style={styles.tabItem} onPress={() => { /* ya en chats */ }}>
          <Feather name="message-circle" size={22} color={colors.accent} />
          <Text style={[styles.tabLabel, styles.tabLabelActive]}>Chats</Text>
        </Pressable>
        <Pressable
          style={styles.tabItem}
          onPress={() => navigation.push('Contacts')}
          accessibilityRole="button"
          accessibilityLabel="Contactos"
        >
          <Feather name="users" size={22} color={colors.textSecondary} />
          <Text style={styles.tabLabel}>Contactos</Text>
        </Pressable>
        <Pressable
          style={styles.tabItem}
          onPress={() => navigation.push('Tools')}
          accessibilityRole="button"
          accessibilityLabel="Herramientas"
        >
          <Feather name="grid" size={22} color={colors.textSecondary} />
          <Text style={styles.tabLabel}>Herramientas</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = themed((colors) => ({
  container: { flex: 1, backgroundColor: colors.background },
  archiveToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  archiveToggleText: {
    color: colors.textSecondary,
    fontSize: fontSize.caption,
    fontWeight: fontWeight.medium,
  },
  pinOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    padding: spacing.xxl,
  },
  pinCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  pinTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.title,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.sm,
  },
  pinSub: {
    color: colors.textSecondary,
    fontSize: fontSize.caption,
    marginBottom: spacing.lg,
  },
  pinInput: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: colors.textPrimary,
    fontSize: 18,
    marginBottom: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  pinBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  pinBtnText: {
    color: colors.textInverse,
    fontWeight: fontWeight.semibold,
    fontSize: fontSize.body,
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  offlineText: {
    flex: 1,
    color: colors.warning ?? '#F5A623',
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
  },
  offlineBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  offlineBtnLabel: {
    color: '#000',
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    backgroundColor: colors.background,
    zIndex: 2,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandLogo: {
    width: 32,
    height: 32,
    borderRadius: 8,
    marginRight: spacing.sm,
  },
  smartHeader: {
    color: colors.accent,
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  headerTitle: {
    color: colors.chatNeon,
    fontSize: fontSize.h2,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.5,
  },
  myNumber: {
    color: colors.accent,
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  planChip: {
    marginLeft: spacing.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  planChipPremium: {
    backgroundColor: 'rgba(48,176,176,0.18)',
    borderColor: colors.accent,
  },
  planChipText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: fontWeight.semibold,
  },
  iconBtn: { padding: spacing.xs },
  demoBanner: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
    zIndex: 2,
  },
  demoBannerTitle: {
    color: colors.textInverse,
    fontSize: fontSize.bodyLg,
    fontWeight: fontWeight.bold,
  },
  demoBannerSub: {
    color: colors.textInverse,
    opacity: 0.85,
    fontSize: fontSize.caption,
    marginTop: spacing.xs,
  },
  scroll: { flex: 1 },
  list: { paddingHorizontal: spacing.md },
  emptyList: { flexGrow: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.background,
    minHeight: 76,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
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
    color: colors.chatNeon,
    fontSize: fontSize.bodyLg,
    fontWeight: fontWeight.semibold,
    flex: 1,
    marginRight: spacing.sm,
  },
  timestamp: {
    color: colors.chatNeonDim,
    fontSize: fontSize.caption,
  },
  rowFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  preview: {
    color: colors.chatNeonDim,
    fontSize: fontSize.body,
    flex: 1,
    marginRight: spacing.sm,
  },
  previewUnread: {
    color: colors.chatNeon,
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
  fab: {
    position: 'absolute',
    right: spacing.xl,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    zIndex: 5,
  },
  fabSecondary: {
    position: 'absolute',
    right: spacing.xl,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accentDark,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    zIndex: 5,
  },
  tabBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 8,
    zIndex: 6,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  tabLabel: {
    marginTop: 2,
    fontSize: 11,
    color: colors.textSecondary,
  },
  tabLabelActive: {
    color: colors.accent,
    fontWeight: fontWeight.semibold,
  },
}));

export default ChatListScreen;
