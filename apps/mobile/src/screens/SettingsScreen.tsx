/**
 * SettingsScreen — profile + preferences + account + app info.
 *
 * Sections:
 *   Profile         — large avatar, name, email, username
 *   Preferences     — Preferred Language dropdown, Translate Mode toggle
 *   Account         — Logout button (red)
 *   App info        — Version 1.0.0, synapmsg.com
 *
 * Updating language / translate-mode calls PATCH /users/me and updates
 * the auth store user object.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  FlatList,
  Switch,
  Alert,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import colors from '../theme/colors';
import { fontSize, fontWeight, radius, spacing } from '../theme/spacing';
import { useAuthStore } from '../store/auth';
import { usersApi } from '../api/messages';
import {
  LANGUAGES,
  LanguageCode,
  RootStackParamList,
  TranslateMode,
} from '../types';
import { UserAvatar } from '../components/UserAvatar';

export function SettingsScreen(): JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList, 'Settings'>>();

  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const setUser = useAuthStore((s) => s.setUser);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [savingLang, setSavingLang] = useState(false);
  const [savingMode, setSavingMode] = useState(false);

  const currentLang = useMemo(
    () =>
      LANGUAGES.find((l) => l.code === user?.preferredLanguage) ?? LANGUAGES[0],
    [user?.preferredLanguage],
  );

  const handleSelectLang = useCallback(
    async (code: LanguageCode) => {
      setPickerOpen(false);
      if (!user || code === user.preferredLanguage) return;
      setSavingLang(true);
      try {
        const updated = await usersApi.updateMe({ preferredLanguage: code });
        setUser(updated);
      } catch {
        Alert.alert('Could not update language', 'Please try again.');
      } finally {
        setSavingLang(false);
      }
    },
    [user, setUser],
  );

  const handleToggleTranslateMode = useCallback(
    async (nextCloud: boolean) => {
      if (!user) return;
      const next: TranslateMode = nextCloud ? 'cloud' : 'on-device';
      if (next === user.preferredTranslateMode) return;
      setSavingMode(true);
      // Optimistically flip the UI.
      setUser({ ...user, preferredTranslateMode: next });
      try {
        const updated = await usersApi.updateMe({ preferredTranslateMode: next });
        setUser(updated);
      } catch {
        // Revert on failure.
        setUser({ ...user, preferredTranslateMode: user.preferredTranslateMode });
        Alert.alert('Could not update translate mode', 'Please try again.');
      } finally {
        setSavingMode(false);
      }
    },
    [user, setUser],
  );

  const handleLogout = useCallback(() => {
    Alert.alert(
      'Log out of Synapmsg?',
      'You can log back in any time.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log out',
          style: 'destructive',
          onPress: () => {
            void logout();
          },
        },
      ],
      { cancelable: true },
    );
  }, [logout]);

  const handleBack = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('ChatList');
  }, [navigation]);

  if (!user) {
    return <View style={styles.container} />;
  }

  const translateModeIsCloud = user.preferredTranslateMode === 'cloud';

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Pressable onPress={handleBack} hitSlop={12} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <FlatList
        data={[1]} // single cell — we render everything via ListHeaderComponent
        keyExtractor={() => 'settings'}
        renderItem={() => null}
        ListHeaderComponent={
          <View style={styles.body}>
            {/* Profile */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Profile</Text>
              <View style={styles.card}>
                <UserAvatar name={user.name} size={64} />
                <View style={styles.profileInfo}>
                  <Text style={styles.profileName}>{user.name}</Text>
                  <Text style={styles.profileMeta}>{user.email}</Text>
                  <Text style={styles.profileMeta}>@{user.username}</Text>
                </View>
              </View>
            </View>

            {/* Preferences */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Preferences</Text>
              <View style={styles.card}>
                <Pressable
                  style={styles.row}
                  onPress={() => setPickerOpen(true)}
                  disabled={savingLang}
                >
                  <View style={styles.rowLeft}>
                    <Feather name="globe" size={20} color={colors.textSecondary} />
                    <View>
                      <Text style={styles.rowTitle}>Preferred Language</Text>
                      <Text style={styles.rowSubtitle}>{currentLang.label}</Text>
                    </View>
                  </View>
                  <View style={styles.rowRight}>
                    <Text style={styles.flag}>{currentLang.flag}</Text>
                    <Feather
                      name="chevron-right"
                      size={18}
                      color={colors.textSecondary}
                    />
                  </View>
                </Pressable>

                <View style={styles.divider} />

                <View style={styles.row}>
                  <View style={styles.rowLeft}>
                    <Feather name="cloud" size={20} color={colors.textSecondary} />
                    <View>
                      <Text style={styles.rowTitle}>Translate Mode</Text>
                      <Text style={styles.rowSubtitle}>
                        {translateModeIsCloud ? 'Cloud' : 'On-device'}
                      </Text>
                    </View>
                  </View>
                  <Switch
                    value={translateModeIsCloud}
                    onValueChange={handleToggleTranslateMode}
                    disabled={savingMode}
                    trackColor={{
                      false: colors.border,
                      true: colors.accent,
                    }}
                    thumbColor={colors.surface}
                    ios_backgroundColor={colors.border}
                  />
                </View>
              </View>
            </View>

            {/* Account */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Account</Text>
              <View style={styles.card}>
                <Pressable
                  style={({ pressed }) => [
                    styles.row,
                    pressed && styles.rowDangerPressed,
                  ]}
                  onPress={handleLogout}
                >
                  <View style={styles.rowLeft}>
                    <Feather name="log-out" size={20} color={colors.error} />
                    <Text style={[styles.rowTitle, styles.dangerText]}>
                      Log out
                    </Text>
                  </View>
                </Pressable>
              </View>
            </View>

            {/* App info */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>About</Text>
              <View style={styles.card}>
                <View style={styles.row}>
                  <Text style={styles.rowTitle}>Version</Text>
                  <Text style={styles.rowSubtitle}>1.0.0</Text>
                </View>
                <View style={styles.divider} />
                <Pressable
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                  onPress={() => Linking.openURL('https://synapmsg.com')}
                >
                  <Text style={styles.rowTitle}>Website</Text>
                  <View style={styles.rowRight}>
                    <Text style={styles.rowSubtitle}>synapmsg.com</Text>
                    <Feather
                      name="external-link"
                      size={16}
                      color={colors.textSecondary}
                    />
                  </View>
                </Pressable>
              </View>
            </View>
          </View>
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxxl }}
      />

      {/* Language picker modal */}
      <Modal
        visible={pickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerOpen(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setPickerOpen(false)}>
          <Pressable
            style={[styles.modalCard, { marginBottom: insets.bottom + spacing.md }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select your language</Text>
            </View>
            <FlatList
              data={LANGUAGES}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => (
                <Pressable
                  style={[
                    styles.optionRow,
                    item.code === currentLang.code && styles.optionRowActive,
                  ]}
                  onPress={() => handleSelectLang(item.code)}
                >
                  <Text style={styles.optionFlag}>{item.flag}</Text>
                  <Text style={styles.optionLabel}>{item.label}</Text>
                  {item.code === currentLang.code ? (
                    <Feather name="check" size={18} color={colors.accent} />
                  ) : null}
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
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
  body: { paddingHorizontal: spacing.xl },
  section: { marginBottom: spacing.xxl },
  sectionLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.lg,
  },
  rowPressed: { backgroundColor: colors.ripple },
  rowDangerPressed: { backgroundColor: 'rgba(192, 57, 43, 0.08)' },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  rowTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.bodyLg,
    fontWeight: fontWeight.medium,
  },
  rowSubtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.caption,
    marginTop: 2,
  },
  flag: {
    fontSize: fontSize.h3,
    marginRight: spacing.xs,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: 40, // align after the icon
  },
  dangerText: { color: colors.error },
  profileInfo: {
    flex: 1,
    marginLeft: spacing.lg,
  },
  profileName: {
    color: colors.textPrimary,
    fontSize: fontSize.h3,
    fontWeight: fontWeight.bold,
  },
  profileMeta: {
    color: colors.textSecondary,
    fontSize: fontSize.body,
    marginTop: 2,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlay,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    maxHeight: '70%',
  },
  modalHeader: { paddingVertical: spacing.md, alignItems: 'center' },
  modalTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.title,
    fontWeight: fontWeight.semibold,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  optionRowActive: {
    backgroundColor: colors.badgeBackground,
    borderRadius: radius.md,
  },
  optionFlag: {
    fontSize: fontSize.h3,
    marginRight: spacing.lg,
  },
  optionLabel: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: fontSize.bodyLg,
  },
});

export default SettingsScreen;
