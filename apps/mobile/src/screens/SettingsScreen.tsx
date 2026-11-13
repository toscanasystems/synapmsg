/**
 * Settings — menú estilo WhatsApp:
 * Perfil grande → Cuenta / Chats / Notificaciones / Privacidad / Ayuda / Invitar / Salir
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  FlatList,
  Switch,
  Alert,
  AppState,
  Linking,
  Share,
  ScrollView,
  TextInput,
  type AppStateStatus,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import colors, { themed } from '../theme/colors';
import { fontSize, fontWeight, radius, spacing } from '../theme/spacing';
import { useAuthStore } from '../store/auth';
import { useAppLockStore } from '../store/appLock';
import { useThemeStore, type ThemeMode } from '../store/theme';
import { usersApi } from '../api/messages';
import {
  LANGUAGES,
  LanguageCode,
  RootStackParamList,
  TranslateMode,
} from '../types';
import { UserAvatar } from '../components/UserAvatar';
import type { FeatherIconName } from '../types/iconNames';
import type { BillingPlanInfo } from '../types';
import { ensureSignalBundle } from '../crypto/signalSession';
import { LEGACY_PQ_RATCHET_DISABLED_FOR_NEW } from '../crypto/legacyPqFlags';
import { publishKtlIfNeeded } from '../crypto/ktlPublish';
import { hydrateGlossary } from '../i18n/glossaryCache';
import { securityApi } from '../api/security';
import { useSmartFoldersStore } from '../store/smartFolders';
import { assessDeviceRiskAsync, type DeviceRisk } from '../security/deviceGuard';
import {
  activateVpn,
  deactivateVpn,
  fetchVpnProfile,
  isVpnPreferred,
  VPN_STATUS,
} from '../security/vpnController';
import {
  ensureWhisperModel,
  getWhisperStatus,
} from '../i18n/whisperOnDevice';
import { SQLCIPHER_STATUS } from '../security/sqlcipherStore';
import { sqlCipherNativeStatus } from 'synap-sqlcipher';
import { libsignalNativeStatus } from 'synap-libsignal';
import {
  mlkitAvailable,
  mlkitDownloadModel,
  mlkitEngine,
  mlkitIsModelDownloaded,
} from 'synap-mlkit-translate';
import { PRIVATE_GLOSSARY_MAX } from '../i18n/privateOnDeviceMt';
import {
  loadIdentityChangeLog,
  type IdentityChangeLogEntry,
} from '../crypto/identityTrust';
import { useChatsStore } from '../store/chats';

const NOTIF_KEY = '@Synap/notifications_enabled';
const READ_KEY = '@Synap/read_receipts';
const PENDING_CHECKOUT_KEY = '@Synap/pending_recurrente_checkout';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

type RowProps = {
  icon: FeatherIconName;
  iconBg?: string;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  danger?: boolean;
  last?: boolean;
};

function SettingsRow({
  icon,
  iconBg = colors.accent,
  title,
  subtitle,
  onPress,
  right,
  danger,
  last,
}: RowProps): JSX.Element {
  const content = (
    <>
      <View style={[styles.iconBubble, { backgroundColor: danger ? colors.error : iconBg }]}>
        <Feather name={icon} size={18} color="#fff" />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, danger && styles.dangerText]}>{title}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {right ?? (
        onPress ? (
          <Feather name="chevron-right" size={18} color={colors.textSecondary} />
        ) : null
      )}
    </>
  );

  return (
    <>
      {onPress ? (
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={onPress}
        >
          {content}
        </Pressable>
      ) : (
        <View style={styles.row}>{content}</View>
      )}
      {!last ? <View style={styles.divider} /> : null}
    </>
  );
}

export function SettingsScreen(): JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList, 'Settings'>>();

  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const logout = useAuthStore((s) => s.logout);
  const setUser = useAuthStore((s) => s.setUser);
  const themeMode = useThemeStore((s) => s.mode);
  const setThemeMode = useThemeStore((s) => s.setMode);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [editNameOpen, setEditNameOpen] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailDraft, setEmailDraft] = useState('');
  const [nameDraft, setNameDraft] = useState(user?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [notificationsOn, setNotificationsOn] = useState(true);
  const [readReceipts, setReadReceipts] = useState(true);
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const [glossary, setGlossary] = useState<
    Array<{ id: string; source: string; target: string }>
  >([]);
  const [gSource, setGSource] = useState('');
  const [gTarget, setGTarget] = useState('');
  const [pinOpen, setPinOpen] = useState(false);
  const [pinDraft, setPinDraft] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [bioAvailable, setBioAvailable] = useState(false);
  const [planInfo, setPlanInfo] = useState<BillingPlanInfo | null>(null);
  const [planBusy, setPlanBusy] = useState(false);
  const [e2eBusy, setE2eBusy] = useState(false);
  const [e2eDeviceCount, setE2eDeviceCount] = useState(0);
  const [deviceRisk, setDeviceRisk] = useState<DeviceRisk | null>(null);
  const [vpnOn, setVpnOn] = useState(false);
  const [whisperReady, setWhisperReady] = useState(false);
  const [identityLog, setIdentityLog] = useState<IdentityChangeLogEntry[]>(
    [],
  );

  const lockEnabled = useAppLockStore((s) => s.enabled);
  const bioEnabled = useAppLockStore((s) => s.bioEnabled);
  const setLockEnabled = useAppLockStore((s) => s.setEnabled);
  const setDuressPin = useAppLockStore((s) => s.setDuressPin);
  const setBioEnabled = useAppLockStore((s) => s.setBioEnabled);
  const hasHardwareBiometrics = useAppLockStore((s) => s.hasHardwareBiometrics);
  const [duressOpen, setDuressOpen] = useState(false);
  const [duressDraft, setDuressDraft] = useState('');
  const smartFoldersOn = useSmartFoldersStore((s) => s.enabled);
  const setSmartFolders = useSmartFoldersStore((s) => s.setEnabled);
  const hydrateSmart = useSmartFoldersStore((s) => s.hydrate);

  useEffect(() => {
    void hasHardwareBiometrics().then(setBioAvailable);
    void hydrateSmart();
    void assessDeviceRiskAsync().then(setDeviceRisk);
    void isVpnPreferred().then(setVpnOn);
    void getWhisperStatus().then((s) => setWhisperReady(s.modelReady));
    void loadIdentityChangeLog().then(setIdentityLog);
  }, [hasHardwareBiometrics, hydrateSmart]);

  useEffect(() => {
    void (async () => {
      const [n, r] = await Promise.all([
        AsyncStorage.getItem(NOTIF_KEY),
        AsyncStorage.getItem(READ_KEY),
      ]);
      if (n != null) setNotificationsOn(n === '1');
      if (r != null) setReadReceipts(r === '1');
    })();
  }, []);

  const refreshPlan = useCallback(async () => {
    try {
      const info = await usersApi.getPlan();
      setPlanInfo(info);
      if (user) {
        setUser({
          ...user,
          plan: info.plan,
          planExpiresAt: info.planExpiresAt,
          mediaBytesUsed: info.media.usedBytes,
          translationsToday: info.translations.usedToday,
        });
      }
    } catch {
      /* offline / older API */
    }
  }, [user, setUser]);

  const confirmPendingCheckout = useCallback(async () => {
    const checkoutId = await AsyncStorage.getItem(PENDING_CHECKOUT_KEY);
    if (!checkoutId) return;
    try {
      const result = await usersApi.confirmCheckout(checkoutId);
      if (result.granted) {
        await AsyncStorage.removeItem(PENDING_CHECKOUT_KEY);
        if (result.user) setUser(result.user);
        await refreshPlan();
        Alert.alert('Premium activo', 'Tu suscripción Recurrente quedó aplicada.');
      } else if (result.status === 'expired') {
        await AsyncStorage.removeItem(PENDING_CHECKOUT_KEY);
      }
    } catch {
      // silent — user may still be on unpaid checkout
    }
  }, [refreshPlan, setUser]);

  useEffect(() => {
    void refreshPlan();
    void confirmPendingCheckout();
    void usersApi
      .listE2eDevices()
      .then((d) => setE2eDeviceCount(d.length))
      .catch(() => setE2eDeviceCount(0));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state === 'active') void confirmPendingCheckout();
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [confirmPendingCheckout]);

  const handleRegisterE2e = useCallback(() => {
    Alert.alert(
      'Cifrado Privado (Signal)',
      'Registra claves públicas Signal (libsignal). Las privadas quedan en este teléfono. El ratchet propio synapmsg-pq-v1 está apagado para chats nuevos.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Registrar dispositivo',
          onPress: () => {
            void (async () => {
              setE2eBusy(true);
              try {
                const bundle = await ensureSignalBundle();
                await usersApi.registerE2eDevice({
                  deviceId: bundle.deviceId,
                  identityKeyPub: bundle.identityKeyPub,
                  signedPreKeyPub: bundle.signedPreKeyPub,
                  signedPreKeyId: bundle.signedPreKeyId,
                  signedPreKeySig: bundle.signedPreKeySig,
                  registrationId: bundle.registrationId,
                  preKeys: bundle.preKeys,
                  protocol: bundle.protocol,
                });
                const devices = await usersApi.listE2eDevices();
                const ktl = await publishKtlIfNeeded();
                setE2eDeviceCount(devices.length);
                Alert.alert(
                  'Listo',
                  `Dispositivo ${bundle.deviceId} (libsignal, ${bundle.preKeys.length} prekeys).` +
                    (LEGACY_PQ_RATCHET_DISABLED_FOR_NEW
                      ? ' Legacy PQ apagado para chats nuevos.'
                      : '') +
                    (ktl.published
                      ? ` KTL #${ktl.seq}.`
                      : ktl.seq
                        ? ` KTL al día (#${ktl.seq}).`
                        : ''),
                );
              } catch {
                Alert.alert('Error', 'No se pudo registrar el dispositivo Signal.');
              } finally {
                setE2eBusy(false);
              }
            })();
          },
        },
      ],
    );
  }, []);

  const runStubTrial = useCallback(() => {
    void (async () => {
      setPlanBusy(true);
      try {
        const updated = await usersApi.upgradeStub(30);
        setUser(updated);
        await refreshPlan();
        Alert.alert('Listo', 'Premium activo 30 días (prueba).');
      } catch {
        Alert.alert('Error', 'No se pudo activar Premium.');
      } finally {
        setPlanBusy(false);
      }
    })();
  }, [refreshPlan, setUser]);

  const handleUpgrade = useCallback(() => {
    void (async () => {
      setPlanBusy(true);
      try {
        const cfg = await usersApi.getBillingConfig();
        const buttons: Array<{
          text: string;
          style?: 'cancel' | 'destructive';
          onPress?: () => void;
        }> = [{ text: 'Cancelar', style: 'cancel' }];

        const payEnabled = Boolean(
          cfg.paymentsEnabled || cfg.recurrenteEnabled || cfg.stripeEnabled,
        );
        if (payEnabled) {
          const cur = (cfg.premiumCurrency || 'usd').toUpperCase();
          const price =
            cur === 'USD'
              ? `$${(cfg.premiumPriceCents / 100).toFixed(2)}/mes`
              : cur === 'GTQ'
                ? `Q${(cfg.premiumPriceCents / 100).toFixed(2)}/mes`
                : `${(cfg.premiumPriceCents / 100).toFixed(2)} ${cur}/mes`;
          const label =
            cfg.provider === 'recurrente' || cfg.recurrenteEnabled
              ? `Pagar con Recurrente ${price}`
              : `Tarjeta ${price}`;
          buttons.push({
            text: label,
            onPress: () => {
              void (async () => {
                setPlanBusy(true);
                try {
                  const { url, sessionId } = await usersApi.createCheckout();
                  if (sessionId) {
                    await AsyncStorage.setItem(
                      PENDING_CHECKOUT_KEY,
                      sessionId,
                    );
                  }
                  if (url) await Linking.openURL(url);
                } catch {
                  Alert.alert('Error', 'No se pudo abrir el checkout.');
                } finally {
                  setPlanBusy(false);
                }
              })();
            },
          });
        }

        if (cfg.playBillingEnabled) {
          buttons.push({
            text: 'Google Play',
            onPress: () => {
              Alert.alert(
                'Play Billing',
                `Producto ${cfg.playProductId || 'premium'}. Disponible cuando la app esté en Play Store.`,
              );
            },
          });
        }

        buttons.push({ text: 'Prueba 30 días', onPress: runStubTrial });

        Alert.alert(
          'Synap Premium',
          payEnabled
            ? 'Más cuota de media (objetivo 100 GB), archivos grandes y sin anuncios. $4.99/mes vía Recurrente.'
            : 'Pagos Recurrente aún sin keys en el servidor. Puedes probar 30 días.',
          buttons,
        );
        return;
      } catch {
        Alert.alert(
          'Synap Premium',
          '¿Activar 30 días de prueba?',
          [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Probar', onPress: runStubTrial },
          ],
        );
      } finally {
        setPlanBusy(false);
      }
    })();
  }, [runStubTrial]);

  const handleDowngrade = useCallback(() => {
    const paidViaGateway = Boolean(
      (planInfo?.recurrenteEnabled || planInfo?.stripeEnabled) &&
        user?.plan === 'premium',
    );
    Alert.alert(
      paidViaGateway ? 'Administrar Premium' : 'Volver a Gratis',
      paidViaGateway
        ? planInfo?.recurrenteEnabled
          ? 'Para cancelar la suscripción Recurrente, usa el portal de tu cuenta Recurrente o escribe a soporte. También puedes bajar a Gratis aquí (prueba/QA).'
          : 'Abre el portal de Stripe para cancelar o cambiar tarjeta.'
        : '¿Quitar Premium de prueba?',
      [
        { text: 'Cancelar', style: 'cancel' },
        ...(planInfo?.stripeEnabled && !planInfo?.recurrenteEnabled
          ? [
              {
                text: 'Abrir portal',
                onPress: () => {
                  void (async () => {
                    setPlanBusy(true);
                    try {
                      const { url } = await usersApi.openBillingPortal();
                      if (url) await Linking.openURL(url);
                    } catch {
                      Alert.alert('Error', 'No se pudo abrir el portal.');
                    } finally {
                      setPlanBusy(false);
                    }
                  })();
                },
              } as const,
            ]
          : []),
        {
          text: paidViaGateway ? 'Bajar a Gratis (QA)' : 'Sí',
          style: 'destructive' as const,
          onPress: () => {
            void (async () => {
              setPlanBusy(true);
              try {
                const updated = await usersApi.downgradeStub();
                setUser(updated);
                await refreshPlan();
              } catch {
                Alert.alert('Error', 'No se pudo cambiar el plan.');
              } finally {
                setPlanBusy(false);
              }
            })();
          },
        },
      ],
    );
  }, [
    planInfo?.recurrenteEnabled,
    planInfo?.stripeEnabled,
    refreshPlan,
    setUser,
    user?.plan,
  ]);

  const currentLang = useMemo(
    () =>
      LANGUAGES.find((l) => l.code === user?.preferredLanguage) ?? LANGUAGES[0],
    [user?.preferredLanguage],
  );

  const handleBack = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('ChatList');
  }, [navigation]);

  const handleSelectLang = useCallback(
    async (code: LanguageCode) => {
      setPickerOpen(false);
      if (!user || code === user.preferredLanguage) return;
      setSaving(true);
      try {
        const updated = await usersApi.updateMe({ preferredLanguage: code });
        setUser(updated);
      } catch {
        Alert.alert('Error', 'No se pudo actualizar el idioma.');
      } finally {
        setSaving(false);
      }
    },
    [user, setUser],
  );

  const handleSaveName = useCallback(async () => {
    if (!user) return;
    const next = nameDraft.trim();
    if (!next || next === user.name) {
      setEditNameOpen(false);
      return;
    }
    setSaving(true);
    try {
      const updated = await usersApi.updateMe({ name: next });
      setUser(updated);
      setEditNameOpen(false);
    } catch {
      Alert.alert('Error', 'No se pudo actualizar el nombre.');
    } finally {
      setSaving(false);
    }
  }, [user, nameDraft, setUser]);

  const handleToggleTranslateMode = useCallback(
    async (nextCloud: boolean) => {
      if (!user) return;
      const next: TranslateMode = nextCloud ? 'cloud' : 'on-device';
      if (next === user.preferredTranslateMode) return;
      setUser({ ...user, preferredTranslateMode: next });
      try {
        const updated = await usersApi.updateMe({ preferredTranslateMode: next });
        setUser(updated);
      } catch {
        setUser({ ...user, preferredTranslateMode: user.preferredTranslateMode });
        Alert.alert('Error', 'No se pudo cambiar el modo de traducción.');
      }
    },
    [user, setUser],
  );

  const handleNotifications = useCallback(async (v: boolean) => {
    setNotificationsOn(v);
    await AsyncStorage.setItem(NOTIF_KEY, v ? '1' : '0');
  }, []);

  const handleReadReceipts = useCallback(async (v: boolean) => {
    setReadReceipts(v);
    await AsyncStorage.setItem(READ_KEY, v ? '1' : '0');
  }, []);

  const handleInvite = useCallback(async () => {
    try {
      await Share.share({
        message:
          'Únete a Synap — chat Privado sin texto legible en el servidor.\n' +
          'https://synapmsg.ai\n' +
          'Android: https://media.synapmsg.ai/downloads/synap-android.apk\n\n' +
          (user ? `Búscame como @${user.username}` : ''),
      });
    } catch {
      /* cancelled */
    }
  }, [user]);

  const handleLogout = useCallback(() => {
    Alert.alert('Cerrar sesión', '¿Salir de Synap?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Salir',
        style: 'destructive',
        onPress: () => {
          void logout();
        },
      },
    ]);
  }, [logout]);

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
        <Text style={styles.headerTitle}>Ajustes</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxxl }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.hint}>
          Cuenta, seguridad, privacidad y plan. Las acciones rápidas (nuevo chat,
          invitar, bots) están en la pestaña Herramientas.
        </Text>

        {/* Perfil estilo WhatsApp */}
        <Pressable
          style={styles.profileCard}
          onPress={() => {
            setNameDraft(user.name);
            setEditNameOpen(true);
          }}
        >
          <UserAvatar name={user.name} size={72} />
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{user.name}</Text>
            <Text style={styles.profileMeta}>@{user.username}</Text>
            {user.privateNumberFormatted ? (
              <Text style={[styles.profileMeta, { color: colors.accent }]}>
                Número · {user.privateNumberFormatted}
              </Text>
            ) : null}
            {user.email ? (
              <Text style={styles.profileMeta} numberOfLines={1}>
                {user.email}
              </Text>
            ) : (
              <Text style={styles.profileMeta}>Sin correo de recuperación</Text>
            )}
          </View>
          <Feather name="edit-2" size={20} color={colors.accent} />
        </Pressable>

        <Text style={styles.hint}>Toca el perfil para editar tu nombre</Text>

        {user.privateNumberFormatted ? (
          <View style={styles.card}>
            <SettingsRow
              icon="hash"
              iconBg="#30B0B0"
              title="Tu número"
              subtitle={`${user.privateNumberFormatted} · 10 dígitos, no es un teléfono`}
              onPress={() => {
                void Share.share({
                  message: `Mi número Synap: ${user.privateNumberFormatted}\nAgregame en Synap con ese número (no es un celular).`,
                });
              }}
            />
            <SettingsRow
              icon="eye"
              iconBg="#2090A0"
              title="Compartir número en búsquedas"
              subtitle={
                user.privateNumberShared
                  ? 'Otros pueden encontrarte si saben el número'
                  : 'Nadie te encuentra por número hasta que lo actives'
              }
              right={
                <Switch
                  value={Boolean(user.privateNumberShared)}
                  onValueChange={(next) => {
                    void (async () => {
                      try {
                        const updated = await usersApi.updateMe({
                          privateNumberShared: next,
                        });
                        setUser(updated);
                      } catch {
                        Alert.alert('Error', 'No se pudo actualizar.');
                      }
                    })();
                  }}
                  trackColor={{ false: colors.border, true: colors.accent }}
                  thumbColor="#fff"
                />
              }
              last={!user.email ? false : true}
            />
            {!user.email ? (
              <SettingsRow
                icon="mail"
                iconBg="#107090"
                title="Agregar correo para recuperar"
                subtitle="Opcional. Si perdés el teléfono sin correo, no hay recuperación."
                onPress={() => {
                  setEmailDraft('');
                  setEmailModalOpen(true);
                }}
                last
              />
            ) : null}
          </View>
        ) : !user.email ? (
          <View style={styles.card}>
            <SettingsRow
              icon="mail"
              iconBg="#107090"
              title="Agregar correo para recuperar"
              subtitle="Opcional. Si perdés el teléfono sin correo, no hay recuperación."
              onPress={() => {
                setEmailDraft('');
                setEmailModalOpen(true);
              }}
              last
            />
          </View>
        ) : null}

        {/* Plan */}
        <View style={styles.card}>
          <SettingsRow
            icon="star"
            iconBg="#F5A623"
            title={
              (planInfo?.plan ?? user.plan ?? 'free') === 'premium'
                ? 'Premium'
                : 'Plan Gratis'
            }
            subtitle={
              planInfo
                ? `${planInfo.translations.usedToday}/${planInfo.translations.limitPerDay} traducciones hoy · ${formatBytes(planInfo.media.usedBytes)} / ${formatBytes(planInfo.media.limitBytes)}`
                : 'Cargando uso…'
            }
            onPress={
              (planInfo?.plan ?? user.plan ?? 'free') === 'premium'
                ? handleDowngrade
                : handleUpgrade
            }
            right={
              planBusy ? (
                <Text style={styles.rowSubtitle}>…</Text>
              ) : (planInfo?.plan ?? user.plan ?? 'free') === 'premium' ? (
                <Text style={[styles.rowSubtitle, { color: colors.accent }]}>
                  Activo
                </Text>
              ) : (
                <Text style={[styles.rowSubtitle, { color: colors.accent }]}>
                  Mejorar
                </Text>
              )
            }
            last
          />
        </View>

        {/* Cuenta */}
        <View style={styles.card}>
          <SettingsRow
            icon="globe"
            iconBg="#53BDEB"
            title="Idioma preferido"
            subtitle={`${currentLang.flag} ${currentLang.label}`}
            onPress={() => setPickerOpen(true)}
          />
          <SettingsRow
            icon="cloud"
            iconBg="#25D366"
            title="Traducción en la nube"
            subtitle={
              translateModeIsCloud
                ? 'DeepL solo en chat Nube. Privado = ML Kit en el teléfono.'
                : 'Preferencia local. Privado siempre traduce en el teléfono (ML Kit).'
            }
            right={
              <Switch
                value={translateModeIsCloud}
                onValueChange={handleToggleTranslateMode}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor="#fff"
              />
            }
          />
          <SettingsRow
            icon="download-cloud"
            iconBg="#30B0B0"
            title="Idiomas en el teléfono (ML Kit)"
            subtitle="Se baja una vez. Después no sale del teléfono."
            last
            onPress={() => {
              if (!mlkitAvailable()) {
                Alert.alert(
                  'ML Kit',
                  'Hace falta un development build (expo run:android). No funciona en Expo Go.',
                );
                return;
              }
              const eng = mlkitEngine();
              Alert.alert(
                'Bajar idioma',
                `Motor: ${eng.name} (${eng.platform}). Se baja una vez. Después no sale del teléfono.\nElegí un idioma:`,
                [
                  ...(['es', 'en', 'pt', 'fr', 'de', 'it'] as const).map((code) => ({
                    text: code,
                    onPress: () => {
                      void (async () => {
                        try {
                          const already = await mlkitIsModelDownloaded(code);
                          if (already) {
                            Alert.alert('ML Kit', `“${code}” ya está en el teléfono.`);
                            return;
                          }
                          Alert.alert('ML Kit', `Bajando “${code}”…`);
                          await mlkitDownloadModel(code);
                          Alert.alert(
                            'ML Kit',
                            `“${code}” listo. Se baja una vez. Después no sale del teléfono.`,
                          );
                        } catch (err) {
                          Alert.alert(
                            'ML Kit',
                            err instanceof Error ? err.message : 'No se pudo bajar',
                          );
                        }
                      })();
                    },
                  })),
                  { text: 'Cancelar', style: 'cancel' },
                ],
              );
            }}
          />
        </View>

        {/* Apariencia */}
        <View style={styles.card}>
          <SettingsRow
            icon="moon"
            iconBg="#5856D6"
            title="Apariencia"
            subtitle={
              themeMode === 'light'
                ? 'Claro'
                : themeMode === 'system'
                  ? 'Igual que el sistema'
                  : 'Oscuro'
            }
            onPress={() => {
              const pick = (mode: ThemeMode) => {
                void setThemeMode(mode);
              };
              Alert.alert('Apariencia', 'Elige el tema de Synapmsg', [
                { text: 'Oscuro', onPress: () => pick('dark') },
                { text: 'Claro', onPress: () => pick('light') },
                { text: 'Sistema', onPress: () => pick('system') },
                { text: 'Cancelar', style: 'cancel' },
              ]);
            }}
            last
          />
        </View>

        {/* Chats */}
        <View style={styles.card}>
          <SettingsRow
            icon="book"
            iconBg="#FF9500"
            title="Glosario personalizado"
            subtitle={
              glossary.length
                ? `${Math.min(glossary.length, PRIVATE_GLOSSARY_MAX)}/${PRIVATE_GLOSSARY_MAX} (no se traducen)`
                : `Hasta ${PRIVATE_GLOSSARY_MAX} palabras que no se traducen`
            }
            onPress={() => {
              setGlossaryOpen(true);
              void usersApi
                .listGlossary()
                .then(setGlossary)
                .catch(() => setGlossary([]));
            }}
          />
          <SettingsRow
            icon="check-circle"
            iconBg="#53BDEB"
            title="Confirmaciones de lectura"
            subtitle={readReceipts ? 'Activadas' : 'Desactivadas'}
            right={
              <Switch
                value={readReceipts}
                onValueChange={handleReadReceipts}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor="#fff"
              />
            }
            last
          />
        </View>

        {/* Notificaciones */}
        <View style={styles.card}>
          <SettingsRow
            icon="bell"
            iconBg="#FF3B30"
            title="Notificaciones"
            subtitle={notificationsOn ? 'Mensajes y avisos' : 'Silenciadas'}
            right={
              <Switch
                value={notificationsOn}
                onValueChange={handleNotifications}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor="#fff"
              />
            }
            last
          />
        </View>

        {/* Privacidad */}
        <View style={styles.card}>
          <SettingsRow
            icon="lock"
            iconBg="#128C7E"
            title="Bloqueo de app"
            subtitle={lockEnabled ? 'PIN activo' : 'Desactivado'}
            right={
              <Switch
                value={lockEnabled}
                onValueChange={(on) => {
                  if (on) {
                    setPinDraft('');
                    setPinConfirm('');
                    setPinOpen(true);
                    return;
                  }
                  void setLockEnabled(false);
                }}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor="#fff"
              />
            }
          />
          {lockEnabled && bioAvailable ? (
            <SettingsRow
              icon="smartphone"
              iconBg="#34C759"
              title="Desbloqueo biométrico"
              subtitle={bioEnabled ? 'Huella / Face ID' : 'Solo PIN'}
              right={
                <Switch
                  value={bioEnabled}
                  onValueChange={(v) => void setBioEnabled(v)}
                  trackColor={{ false: colors.border, true: colors.accent }}
                  thumbColor="#fff"
                />
              }
            />
          ) : null}
          <SettingsRow
            icon="shield"
            iconBg="#5856D6"
            title="Privacidad"
            subtitle="Cifrado y política"
            onPress={() => Linking.openURL('https://synapmsg.ai/privacy')}
          />
          <SettingsRow
            icon="shield"
            iconBg="#30B0B0"
            title="Enclave / almacén de claves"
            subtitle={
              deviceRisk
                ? `${deviceRisk.native ? 'Nativo' : 'JS'} · ${
                    deviceRisk.strongBox ? 'StrongBox/SE' : 'Keystore'
                  } · ${
                    deviceRisk.reasons.includes('root')
                      ? 'root detectado'
                      : deviceRisk.risky
                        ? `riesgo: ${deviceRisk.reasons.slice(0, 3).join(',')}`
                        : 'OK'
                  }`
                : 'Sondeando…'
            }
            onPress={() => {
              void (async () => {
                const r = await assessDeviceRiskAsync();
                setDeviceRisk(r);
                const sql = await sqlCipherNativeStatus();
                const sig = await libsignalNativeStatus();
                const { getVaultStatus, ensureNaclPrng } = await import(
                  '../security/secureVault'
                );
                try {
                  ensureNaclPrng();
                } catch {
                  /* status recorded */
                }
                const vault = await getVaultStatus();
                const rooted = r.reasons.includes('root');
                Alert.alert(
                  'Almacén e integridad',
                  [
                    `Almacén usado: ${vault.backend}`,
                    `PRNG: ${vault.prngOk ? 'ok' : 'FALLÓ'}`,
                    vault.lastError ? `Error vault: ${vault.lastError}` : null,
                    vault.note,
                    `Enclave nativo: ${r.native ? 'sí' : 'no'}`,
                    `StrongBox/SE: ${r.strongBox ? 'sí' : 'no'}`,
                    rooted
                      ? 'Root detectado: el almacén del sistema puede ser eludible. No prometemos que sea imposible de saltar.'
                      : 'Sin root reportado por el sondeo.',
                    `SQLCipher NDK: ${sql.native ? sql.engine + ' ' + sql.version : 'fallback file'}`,
                    `libsignal JNI: ${sig.native ? sig.implementation + ' ' + sig.version : 'TS protocol'}`,
                    `Razones: ${r.reasons.join(', ') || 'ninguna'}`,
                  ]
                    .filter(Boolean)
                    .join('\n'),
                );
              })();
            }}
          />
          <SettingsRow
            icon="wifi"
            iconBg="#34C759"
            title="Túnel / VPN anti-censura"
            subtitle={
              vpnOn
                ? `On · ${VPN_STATUS.tunnelHost} (IP API oculta)`
                : 'Off · oculta IP del servidor'
            }
            onPress={() => {
              void (async () => {
                const next = !vpnOn;
                if (!next) {
                  await deactivateVpn();
                  setVpnOn(false);
                  Alert.alert(
                    'Túnel',
                    'Desactivado. Tráfico directo a api.synapmsg.ai.',
                  );
                  return;
                }
                const profile = await fetchVpnProfile(token);
                const result = await activateVpn(profile);
                setVpnOn(true);
                Alert.alert('Túnel anti-censura', result.detail);
              })();
            }}
          />
          <SettingsRow
            icon="mic"
            iconBg="#FF2D55"
            title="Whisper on-device"
            subtitle={
              whisperReady
                ? 'Modelo listo (ASR local)'
                : 'Descargar ggml-tiny (sin cloud)'
            }
            onPress={() => {
              void (async () => {
                Alert.alert('Whisper', 'Descargando modelo local…');
                const ok = await ensureWhisperModel();
                setWhisperReady(ok);
                Alert.alert(
                  'Whisper',
                  ok
                    ? 'Modelo en dispositivo. Binder nativo whisper.cpp pendiente de link.'
                    : 'No se pudo descargar (subí ggml-tiny a media.synapmsg.ai/models/).',
                );
              })();
            }}
          />
          <SettingsRow
            icon="key"
            iconBg="#F5A623"
            title="Dispositivo E2E"
            subtitle={
              e2eBusy
                ? 'Registrando…'
                : e2eDeviceCount > 0
                  ? `${e2eDeviceCount} dispositivo(s)`
                  : 'Registrar claves públicas'
            }
            onPress={e2eBusy ? undefined : handleRegisterE2e}
          />
          <SettingsRow
            icon="shield"
            iconBg="#FF9500"
            title="Cambios de llave"
            subtitle={
              identityLog.length === 0
                ? 'Sin cambios registrados'
                : `${identityLog.length} registro(s) · último: ${identityLog[0]?.peerLabel ?? ''}`
            }
            onPress={() => {
              void (async () => {
                const entries = await loadIdentityChangeLog();
                setIdentityLog(entries);
                if (entries.length === 0) {
                  Alert.alert(
                    'Cambios de llave',
                    'Todavía no hay cambios de identidad registrados.',
                  );
                  return;
                }
                const { describePeerKtl } = await import('../crypto/ktlPublish');
                const chunks: string[] = [];
                for (const e of entries.slice(0, 8)) {
                  const when = new Date(e.at).toLocaleString();
                  const decision = e.trusted ? 'Confío' : 'No enviar';
                  const ktl = await describePeerKtl(e.peerUserId);
                  chunks.push(
                    `${when}\n${e.peerLabel} · ${decision}\nllave ${e.newKeyPrefix}…\n${ktl}`,
                  );
                }
                Alert.alert('Cambios de llave', chunks.join('\n\n'));
              })();
            }}
          />
          {lockEnabled ? (
            <SettingsRow
              icon="alert-triangle"
              iconBg="#FF9500"
              title="PIN de coacción"
              subtitle="Wipe + abre cuenta señuelo inocua"
              onPress={() => {
                setDuressDraft('');
                setDuressOpen(true);
              }}
            />
          ) : null}
          <SettingsRow
            icon="user-x"
            iconBg="#AF52DE"
            title="Cuenta señuelo"
            subtitle="Preparar perfil inocuo para coacción"
            onPress={() => {
              void securityApi
                .ensureDecoy()
                .then(() =>
                  Alert.alert(
                    'Señuelo listo',
                    'Si usás el PIN de coacción, este dispositivo entra a la cuenta inocua.',
                  ),
                )
                .catch(() =>
                  Alert.alert('Error', 'No se pudo preparar la cuenta señuelo.'),
                );
            }}
          />
          <SettingsRow
            icon="trash-2"
            iconBg="#FF3B30"
            title="Borrado remoto"
            subtitle="Vaciar este y otros dispositivos de la cuenta"
            danger
            onPress={() => {
              Alert.alert(
                'Borrado remoto',
                'Se enviará una orden de wipe a tus dispositivos conectados.',
                [
                  { text: 'Cancelar', style: 'cancel' },
                  {
                    text: 'Vaciar ahora',
                    style: 'destructive',
                    onPress: () => {
                      void securityApi
                        .wipe()
                        .then(() =>
                          Alert.alert(
                            'Enviado',
                            'Orden de borrado enviada. Este dispositivo se vaciará al recibirla.',
                          ),
                        )
                        .catch(() =>
                          Alert.alert('Error', 'No se pudo enviar el wipe.'),
                        );
                    },
                  },
                ],
              );
            }}
          />
          <SettingsRow
            icon="clock"
            iconBg="#5856D6"
            title="Aviso de inactividad"
            subtitle="Si no abres la app en X días"
            onPress={() => {
              void (async () => {
                try {
                  const dms = await securityApi.getDms();
                  const meId = useAuthStore.getState().user?.id;
                  const peers = useChatsStore
                    .getState()
                    .chats.flatMap((c) =>
                      (c.participants || [])
                        .filter((p) => p.userId && p.userId !== meId)
                        .map((p) => ({
                          id: p.userId as string,
                          label:
                            p.user?.displayName ||
                            p.user?.privateNumber ||
                            p.userId,
                        })),
                    );
                  const uniq = new Map(peers.map((p) => [p.id, p]));
                  const contactList = [...uniq.values()].slice(0, 8);

                  const save = (
                    idleDays: number,
                    action: string,
                    notifyContactIds: string[],
                  ) => {
                    void securityApi
                      .setDms({
                        enabled: true,
                        idleDays,
                        action,
                        notifyContactIds,
                      })
                      .then(() =>
                        Alert.alert(
                          'Listo',
                          `Inactividad: ${idleDays} día(s). Acción: ${action}.` +
                            (notifyContactIds.length
                              ? ` Avisa a ${notifyContactIds.length} contacto(s).`
                              : ''),
                        ),
                      )
                      .catch(() =>
                        Alert.alert('Error', 'No se pudo guardar.'),
                      );
                  };

                  const pickContactsThen = (
                    idleDays: number,
                    action: string,
                  ) => {
                    if (
                      action !== 'notify' &&
                      action !== 'wipe_and_notify'
                    ) {
                      save(idleDays, action, []);
                      return;
                    }
                    if (contactList.length === 0) {
                      Alert.alert(
                        'Sin contactos',
                        'No hay chats para avisar. Se avisará solo en este teléfono.',
                        [
                          {
                            text: 'Continuar',
                            onPress: () => save(idleDays, action, []),
                          },
                        ],
                      );
                      return;
                    }
                    const first = contactList[0];
                    Alert.alert(
                      'Contactos a avisar',
                      first
                        ? `¿Avisar a ${String(first.label).slice(0, 40)}?`
                        : 'Sin contactos en chats.',
                      [
                        { text: 'Cancelar', style: 'cancel' },
                        {
                          text: 'Solo este teléfono',
                          onPress: () => save(idleDays, action, []),
                        },
                        first
                          ? {
                              text: 'Sí, avisar',
                              onPress: () =>
                                save(idleDays, action, [first.id]),
                            }
                          : {
                              text: 'Continuar',
                              onPress: () => save(idleDays, action, []),
                            },
                      ],
                    );
                  };

                  const pickAction = (idleDays: number) => {
                    setTimeout(() => {
                      Alert.alert(
                        'Acción al vencer',
                        'Elige una. Nunca se hacen las dos salvo «Ambos».',
                        [
                          {
                            text: 'Borrar sensibles',
                            onPress: () =>
                              pickContactsThen(idleDays, 'wipe'),
                          },
                          {
                            text: 'Avisar contactos',
                            onPress: () =>
                              pickContactsThen(idleDays, 'notify'),
                          },
                          {
                            text: 'Ambos…',
                            onPress: () => {
                              setTimeout(() => {
                                Alert.alert(
                                  'Confirmar ambos',
                                  '¿Borrar datos sensibles Y avisar contactos?',
                                  [
                                    { text: 'Cancelar', style: 'cancel' },
                                    {
                                      text: 'Sí, ambos',
                                      style: 'destructive',
                                      onPress: () =>
                                        pickContactsThen(
                                          idleDays,
                                          'wipe_and_notify',
                                        ),
                                    },
                                  ],
                                );
                              }, 320);
                            },
                          },
                        ],
                      );
                    }, 320);
                  };

                  const status =
                    (dms.enabled
                      ? `Activo · ${dms.idleDays} día(s) · ${dms.action}`
                      : 'Desactivado') +
                    (dms.lastFiredAt
                      ? `\nÚltimo disparo: ${new Date(dms.lastFiredAt).toLocaleString()}`
                      : '');

                  Alert.alert('Aviso de inactividad', status, [
                    { text: 'Cerrar', style: 'cancel' },
                    dms.enabled
                      ? {
                          text: 'Desactivar',
                          style: 'destructive' as const,
                          onPress: () => {
                            void securityApi
                              .setDms({
                                enabled: false,
                                idleDays: dms.idleDays || 30,
                                action: dms.action || 'notify',
                                notifyContactIds: [],
                              })
                              .then(() =>
                                Alert.alert('Listo', 'Desactivado.'),
                              );
                          },
                        }
                      : {
                          text: 'Configurar',
                          onPress: () => {
                            setTimeout(() => {
                              Alert.alert(
                                'Días sin abrir la app',
                                'Tras ese plazo se ejecuta solo la acción que elijas.',
                                [
                                  { text: 'Cancelar', style: 'cancel' },
                                  {
                                    text: '1 día',
                                    onPress: () => pickAction(1),
                                  },
                                  {
                                    text: 'Más…',
                                    onPress: () => {
                                      setTimeout(() => {
                                        Alert.alert(
                                          'Plazo',
                                          'Elige 7 o 30 días.',
                                          [
                                            {
                                              text: '7 días',
                                              onPress: () => pickAction(7),
                                            },
                                            {
                                              text: '30 días',
                                              onPress: () => pickAction(30),
                                            },
                                            {
                                              text: 'Cancelar',
                                              style: 'cancel',
                                            },
                                          ],
                                        );
                                      }, 320);
                                    },
                                  },
                                ],
                              );
                            }, 320);
                          },
                        },
                  ]);
                } catch {
                  Alert.alert('Error', 'No se pudo cargar el aviso.');
                }
              })();
            }}
          />
          <SettingsRow
            icon="git-branch"
            iconBg="#30B0B0"
            title="Registro público de claves"
            subtitle="Ver historial KTL y publicar identidad"
            onPress={() => {
              void (async () => {
                const me = useAuthStore.getState().user;
                if (!me?.id) {
                  Alert.alert('KTL', 'Inicia sesión primero.');
                  return;
                }
                try {
                  await publishKtlIfNeeded();
                  const entries = await securityApi.getKtlPublic(me.id);
                  if (entries.length === 0) {
                    Alert.alert(
                      'Registro público',
                      'Sin entradas. Publica tras registrar el dispositivo E2E.',
                    );
                    return;
                  }
                  const lines = entries.map((e, i) => {
                    const prev = i > 0 ? entries[i - 1] : null;
                    const rotated =
                      prev && prev.identityKeyPub !== e.identityKeyPub
                        ? ' · CAMBIÓ'
                        : '';
                    return `#${e.seq} ${new Date(e.at).toLocaleString()}${rotated}\n${e.identityKeyPub.slice(0, 20)}…`;
                  });
                  Alert.alert(
                    'Registro público de claves',
                    lines.slice(-12).join('\n\n'),
                  );
                } catch {
                  Alert.alert(
                    'KTL',
                    'Registra el dispositivo E2E antes de publicar.',
                  );
                }
              })();
            }}
          />
          <SettingsRow
            icon="cpu"
            iconBg="#AF52DE"
            title="2FA FIDO2 / Passkey"
            subtitle="YubiKey / llave de plataforma"
            onPress={() => {
              void (async () => {
                try {
                  const list = await securityApi.listWebauthn();
                  Alert.alert(
                    'FIDO2',
                    list.length
                      ? `Credenciales: ${list.map((c) => c.label).join(', ')}`
                      : 'Sin passkeys. Abrí el enrolamiento web (origen api.synapmsg.ai).',
                    [
                      { text: 'Cerrar', style: 'cancel' },
                      {
                        text: 'Abrir enrolamiento',
                        onPress: () => {
                          void (async () => {
                            const { getDeviceInstallId } = await import(
                              '../security/deviceInstallId'
                            );
                            const device = await getDeviceInstallId();
                            const t = useAuthStore.getState().token || '';
                            void Linking.openURL(
                              `https://api.synapmsg.ai/security/webauthn.html?token=${encodeURIComponent(t)}&device=${encodeURIComponent(device)}`,
                            );
                          })();
                        },
                      },
                      {
                        text: 'Generar recovery codes',
                        onPress: () => {
                          void securityApi
                            .generateRecoveryCodes()
                            .then((codes) =>
                              Alert.alert(
                                'Recovery codes',
                                codes.join('\n') +
                                  '\n\nGuárdalos. Activan FIDO2 obligatorio.',
                              ),
                            )
                            .catch(() =>
                              Alert.alert('Error', 'No se pudieron generar.'),
                            );
                        },
                      },
                    ],
                  );
                } catch {
                  void Linking.openURL(
                    'https://api.synapmsg.ai/security/webauthn.html',
                  );
                }
              })();
            }}
          />
          <SettingsRow
            icon="folder"
            iconBg="#007AFF"
            title="Carpetas inteligentes"
            subtitle={smartFoldersOn ? 'Activas' : 'Heurística local off'}
            right={
              <Switch
                value={smartFoldersOn}
                onValueChange={(v) => void setSmartFolders(v)}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor="#fff"
              />
            }
            last
          />
        </View>

        {/* Ayuda / Invitar */}
        <View style={styles.card}>
          <SettingsRow
            icon="help-circle"
            iconBg="#34C759"
            title="Ayuda"
            subtitle="Soporte y preguntas"
            onPress={() => Linking.openURL('https://synapmsg.ai/support')}
          />
          <SettingsRow
            icon="mail"
            iconBg="#30B0B0"
            title="Correo de soporte"
            subtitle="soporte@synapmsg.ai"
            onPress={() =>
              void Linking.openURL('mailto:soporte@synapmsg.ai')
            }
          />
          <SettingsRow
            icon="share-2"
            iconBg="#007AFF"
            title="Invitar a un amigo"
            subtitle="Comparte Synap"
            onPress={() => {
              void handleInvite();
            }}
          />
          <SettingsRow
            icon="info"
            iconBg={colors.textSecondary}
            title="Acerca de"
            subtitle="Android GA 1.1.1 · JNI+SQLCipher NDK · iOS pendiente"
            onPress={() => Linking.openURL('https://synapmsg.ai')}
            last
          />
        </View>

        <View style={styles.card}>
          <SettingsRow
            icon="log-out"
            title="Cerrar sesión"
            onPress={handleLogout}
            danger
            last
          />
        </View>
      </ScrollView>

      {/* Language picker */}
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
            <Text style={styles.modalTitle}>Idioma preferido</Text>
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
                  disabled={saving}
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

      <Modal
        visible={duressOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDuressOpen(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setDuressOpen(false)}
        >
          <Pressable
            style={styles.editCard}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={styles.modalTitle}>PIN de coacción</Text>
            <Text style={styles.rowSubtitle}>
              Si lo usás al desbloquear: wipe del vault real y cambio a la
              cuenta señuelo (chats inocuos).
            </Text>
            <TextInput
              value={duressDraft}
              onChangeText={(t) =>
                setDuressDraft(t.replace(/\D/g, '').slice(0, 8))
              }
              keyboardType="number-pad"
              secureTextEntry
              placeholder="PIN coacción (≠ PIN normal)"
              placeholderTextColor={colors.textSecondary}
              style={styles.nameInput}
              maxLength={8}
            />
            <View style={styles.editActions}>
              <Pressable
                onPress={() => setDuressOpen(false)}
                style={styles.editBtn}
              >
                <Text style={styles.editBtnText}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={styles.editBtn}
                onPress={() => {
                  void (async () => {
                    try {
                      await setDuressPin(duressDraft);
                      setDuressOpen(false);
                      Alert.alert('Listo', 'PIN de coacción guardado.');
                    } catch (err) {
                      Alert.alert(
                        'PIN',
                        err instanceof Error ? err.message : 'Error',
                      );
                    }
                  })();
                }}
              >
                <Text style={styles.editBtnPrimaryText}>Guardar</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={pinOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPinOpen(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setPinOpen(false)}>
          <Pressable
            style={styles.editCard}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={styles.modalTitle}>Crear PIN</Text>
            <TextInput
              value={pinDraft}
              onChangeText={(t) => setPinDraft(t.replace(/\D/g, '').slice(0, 8))}
              keyboardType="number-pad"
              secureTextEntry
              placeholder="PIN (4–8 dígitos)"
              placeholderTextColor={colors.textSecondary}
              style={styles.nameInput}
              maxLength={8}
            />
            <TextInput
              value={pinConfirm}
              onChangeText={(t) =>
                setPinConfirm(t.replace(/\D/g, '').slice(0, 8))
              }
              keyboardType="number-pad"
              secureTextEntry
              placeholder="Confirmar PIN"
              placeholderTextColor={colors.textSecondary}
              style={styles.nameInput}
              maxLength={8}
            />
            <View style={styles.editActions}>
              <Pressable
                onPress={() => setPinOpen(false)}
                style={styles.editBtn}
              >
                <Text style={styles.editBtnText}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={styles.editBtn}
                onPress={() => {
                  void (async () => {
                    if (pinDraft.length < 4) {
                      Alert.alert('PIN', 'Mínimo 4 dígitos.');
                      return;
                    }
                    if (pinDraft !== pinConfirm) {
                      Alert.alert('PIN', 'No coinciden.');
                      return;
                    }
                    try {
                      await setLockEnabled(true, pinDraft);
                      setPinOpen(false);
                      Alert.alert(
                        'Listo',
                        'La app se bloqueará al salir a segundo plano.',
                      );
                    } catch (err) {
                      Alert.alert(
                        'PIN',
                        err instanceof Error ? err.message : 'Error',
                      );
                    }
                  })();
                }}
              >
                <Text style={styles.editBtnPrimaryText}>Activar</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={glossaryOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setGlossaryOpen(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setGlossaryOpen(false)}
        >
          <Pressable
            style={[styles.modalCard, { marginBottom: insets.bottom + spacing.md }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={styles.modalTitle}>Glosario</Text>
            <Text style={styles.glossaryHint}>
              Hasta {PRIVATE_GLOSSARY_MAX} palabras que no se traducen (nombres,
              jerga). En Privado se dejan igual.
            </Text>
            <TextInput
              value={gSource}
              onChangeText={setGSource}
              placeholder="Palabra (ej. Synap)"
              placeholderTextColor={colors.textSecondary}
              style={styles.nameInput}
            />
            <TextInput
              value={gTarget}
              onChangeText={setGTarget}
              placeholder="Igual que arriba (queda sin traducir)"
              placeholderTextColor={colors.textSecondary}
              style={[styles.nameInput, { marginTop: spacing.sm }]}
            />
            <Pressable
              style={styles.glossaryAdd}
              onPress={() => {
                void (async () => {
                  const src = gSource.trim();
                  if (!src) return;
                  const tgt = gTarget.trim() || src;
                  if (glossary.length >= PRIVATE_GLOSSARY_MAX) {
                    Alert.alert(
                      'Glosario',
                      `Máximo ${PRIVATE_GLOSSARY_MAX} palabras.`,
                    );
                    return;
                  }
                  try {
                    const entry = await usersApi.addGlossary(src, tgt);
                    setGlossary((prev) => [
                      entry,
                      ...prev.filter((e) => e.id !== entry.id),
                    ]);
                    await hydrateGlossary(true);
                    setGSource('');
                    setGTarget('');
                  } catch (err) {
                    Alert.alert(
                      'Glosario',
                      err instanceof Error ? err.message : 'Error',
                    );
                  }
                })();
              }}
            >
              <Text style={styles.glossaryAddText}>Agregar</Text>
            </Pressable>
            <FlatList
              data={glossary}
              keyExtractor={(item) => item.id}
              style={{ maxHeight: 220, marginTop: spacing.md }}
              ListEmptyComponent={
                <Text style={styles.glossaryHint}>Sin términos aún.</Text>
              }
              renderItem={({ item }) => (
                <View style={styles.glossaryRow}>
                  <Text style={styles.optionLabel} numberOfLines={1}>
                    {item.source} → {item.target}
                  </Text>
                  <Pressable
                    onPress={() => {
                      void usersApi.deleteGlossary(item.id).then(() => {
                        setGlossary((prev) =>
                          prev.filter((e) => e.id !== item.id),
                        );
                      });
                    }}
                    hitSlop={8}
                  >
                    <Feather name="trash-2" size={16} color={colors.error} />
                  </Pressable>
                </View>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Edit name */}
      <Modal
        visible={editNameOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setEditNameOpen(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setEditNameOpen(false)}>
          <Pressable
            style={styles.editCard}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={styles.modalTitle}>Tu nombre</Text>
            <TextInput
              value={nameDraft}
              onChangeText={setNameDraft}
              style={styles.nameInput}
              placeholder="Nombre"
              placeholderTextColor={colors.textSecondary}
              maxLength={60}
              autoFocus
            />
            <View style={styles.editActions}>
              <Pressable onPress={() => setEditNameOpen(false)} style={styles.editBtn}>
                <Text style={styles.editBtnText}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  void handleSaveName();
                }}
                style={[styles.editBtn, styles.editBtnPrimary]}
                disabled={saving}
              >
                <Text style={[styles.editBtnText, styles.editBtnPrimaryText]}>
                  Guardar
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Optional recovery email */}
      <Modal
        visible={emailModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setEmailModalOpen(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setEmailModalOpen(false)}
        >
          <Pressable
            style={styles.editCard}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={styles.modalTitle}>Agregar correo para recuperar</Text>
            <Text style={{ color: colors.textSecondary, marginBottom: spacing.md }}>
              Opcional. Solo para recuperar la cuenta más adelante.
            </Text>
            <TextInput
              value={emailDraft}
              onChangeText={setEmailDraft}
              style={styles.nameInput}
              placeholder="correo@ejemplo.com"
              placeholderTextColor={colors.textSecondary}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
            />
            <View style={styles.editActions}>
              <Pressable
                onPress={() => setEmailModalOpen(false)}
                style={styles.editBtn}
              >
                <Text style={styles.editBtnText}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  void (async () => {
                    const next = emailDraft.trim().toLowerCase();
                    if (!next.includes('@')) {
                      Alert.alert('Correo', 'Ingresá un correo válido.');
                      return;
                    }
                    setSaving(true);
                    try {
                      const updated = await usersApi.updateMe({ email: next });
                      setUser(updated);
                      setEmailModalOpen(false);
                    } catch {
                      Alert.alert(
                        'Error',
                        'No se pudo guardar el correo. ¿Ya está en uso?',
                      );
                    } finally {
                      setSaving(false);
                    }
                  })();
                }}
                style={[styles.editBtn, styles.editBtnPrimary]}
                disabled={saving}
              >
                <Text style={[styles.editBtnText, styles.editBtnPrimaryText]}>
                  Guardar
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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
  backBtn: { padding: spacing.xs, marginRight: spacing.sm },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.h2,
    fontWeight: fontWeight.bold,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.xl,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
  },
  profileInfo: { flex: 1, marginLeft: spacing.lg, marginRight: spacing.md },
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
  hint: {
    color: colors.textMuted,
    fontSize: fontSize.caption,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.md,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    minHeight: 56,
  },
  rowPressed: { opacity: 0.75 },
  iconBubble: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  rowText: { flex: 1 },
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
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: 48,
  },
  dangerText: { color: colors.error },
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
    paddingTop: spacing.lg,
    maxHeight: '70%',
  },
  modalTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.title,
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
    marginBottom: spacing.md,
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
  optionFlag: { fontSize: fontSize.h3, marginRight: spacing.lg },
  optionLabel: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: fontSize.bodyLg,
  },
  editCard: {
    marginHorizontal: spacing.xl,
    marginBottom: 'auto',
    marginTop: 'auto',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
  },
  nameInput: {
    backgroundColor: colors.inputBackground,
    borderRadius: radius.md,
    color: colors.textPrimary,
    fontSize: 16,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginTop: spacing.md,
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  editBtn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  editBtnPrimary: {},
  editBtnText: { color: colors.textSecondary, fontWeight: fontWeight.semibold },
  editBtnPrimaryText: { color: colors.accent },
  glossaryHint: {
    color: colors.textSecondary,
    fontSize: fontSize.caption,
    marginBottom: spacing.sm,
  },
  glossaryAdd: {
    marginTop: spacing.md,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  glossaryAddText: {
    color: colors.textInverse,
    fontWeight: fontWeight.bold,
  },
  glossaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
}));

export default SettingsScreen;
