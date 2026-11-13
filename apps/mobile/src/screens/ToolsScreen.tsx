/**
 * Herramientas — acciones rápidas (no cuenta/seguridad).
 * Ajustes vive en el engranaje superior de Chats.
 */

import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Share,
  Linking,
  Alert,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import colors, { themed } from '../theme/colors';
import { fontSize, fontWeight, radius, spacing } from '../theme/spacing';
import { useAuthStore } from '../store/auth';
import { API_BASE_URL } from '../api/client';
import { RootStackParamList } from '../types';

function ToolRow(props: {
  icon: React.ComponentProps<typeof Feather>['name'];
  title: string;
  subtitle: string;
  onPress: () => void;
}): JSX.Element {
  return (
    <Pressable
      style={styles.row}
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={props.title}
    >
      <View style={styles.iconWrap}>
        <Feather name={props.icon} size={20} color={colors.accent} />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{props.title}</Text>
        <Text style={styles.rowSub}>{props.subtitle}</Text>
      </View>
      <Feather name="chevron-right" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

export function ToolsScreen(): JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const [botUser, setBotUser] = useState('');
  const [botBusy, setBotBusy] = useState(false);

  const createBot = useCallback(async () => {
    if (!token) return;
    const username = botUser.trim().toLowerCase();
    if (!username) {
      Alert.alert('Bot', 'Escribí un username (ej. soporte).');
      return;
    }
    setBotBusy(true);
    try {
      const res = await fetch(`${API_BASE_URL}/bots`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ username, name: `Bot ${username}` }),
      });
      const data = (await res.json()) as {
        error?: string;
        bot?: { username: string; token: string };
        hint?: string;
      };
      if (!res.ok) {
        Alert.alert('Bot', data.error || 'No se pudo crear.');
        return;
      }
      setBotUser('');
      Alert.alert(
        'Bot creado',
        `@${data.bot?.username}\n\nToken:\n${data.bot?.token}\n\n${data.hint || ''}`,
      );
    } catch {
      Alert.alert('Bot', 'Error de red.');
    } finally {
      setBotBusy(false);
    }
  }, [token, botUser]);

  const invite = useCallback(async () => {
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

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <Feather name="arrow-left" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Herramientas</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingBottom: insets.bottom + spacing.xxxl,
          paddingHorizontal: spacing.xl,
        }}
      >
        <Text style={styles.section}>Chat</Text>
        <ToolRow
          icon="edit-3"
          title="Nuevo chat"
          subtitle="Buscar por email o Private Number"
          onPress={() => navigation.push('NewChat')}
        />
        <ToolRow
          icon="users"
          title="Nuevo grupo"
          subtitle="Crear un grupo con varios contactos"
          onPress={() => navigation.push('NewGroup')}
        />
        <ToolRow
          icon="book"
          title="Contactos"
          subtitle="Agenda del teléfono y quién está en Synap"
          onPress={() => navigation.push('Contacts')}
        />

        <Text style={styles.section}>Compartir</Text>
        <ToolRow
          icon="share-2"
          title="Invitar a un amigo"
          subtitle="Link de descarga + tu @usuario"
          onPress={() => {
            void invite();
          }}
        />
        <ToolRow
          icon="download"
          title="Descargar Android"
          subtitle="APK oficial de Synap"
          onPress={() => {
            void Linking.openURL(
              'https://media.synapmsg.ai/downloads/synap-android.apk',
            );
          }}
        />

        <Text style={styles.section}>Bots (API)</Text>
        <Text style={styles.botHint}>
          Creá un bot cloud (no lee chats E2E). Token para sendMessage /
          getUpdates en api.synapmsg.ai/bots
        </Text>
        <TextInput
          value={botUser}
          onChangeText={(t) =>
            setBotUser(t.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 28))
          }
          placeholder="username (ej. soporte)"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.botInput}
        />
        <Pressable
          style={styles.botBtn}
          onPress={() => {
            void createBot();
          }}
          disabled={botBusy}
        >
          {botBusy ? (
            <ActivityIndicator color={colors.textInverse} />
          ) : (
            <Text style={styles.botBtnText}>Crear bot</Text>
          )}
        </Pressable>
        <ToolRow
          icon="book-open"
          title="Cómo usar Bot API"
          subtitle="Guía corta en la app + docs web"
          onPress={() => {
            Alert.alert(
              'Synap Bot API',
              [
                '1) Creá un bot arriba → te da un token synbot_…',
                '2) Enviar mensaje:',
                'POST /bots/{token}/sendMessage',
                '{ "user_id":"UUID", "text":"Hola" }',
                '3) Leer entrantes: GET /bots/{token}/getUpdates',
                '4) Solo chats cloud (nunca E2E plaintext).',
                '',
                'Docs legibles: api.synapmsg.ai/bots/capabilities',
              ].join('\n'),
              [
                { text: 'Cerrar', style: 'cancel' },
                {
                  text: 'Abrir docs',
                  onPress: () => {
                    void Linking.openURL(
                      'https://api.synapmsg.ai/bots/capabilities',
                    );
                  },
                },
              ],
            );
          }}
        />

        <Text style={styles.section}>Ayuda</Text>
        <ToolRow
          icon="help-circle"
          title="Soporte"
          subtitle="Preguntas y contacto · soporte@synapmsg.ai"
          onPress={() => {
            void Linking.openURL('https://synapmsg.ai/support');
          }}
        />
        <ToolRow
          icon="mail"
          title="Correo de soporte"
          subtitle="soporte@synapmsg.ai"
          onPress={() => {
            void Linking.openURL('mailto:soporte@synapmsg.ai');
          }}
        />
      </ScrollView>
    </View>
  );
}

const styles = themed((colors) => ({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  section: {
    color: colors.accent,
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1 },
  rowTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  rowSub: {
    color: colors.textMuted,
    fontSize: fontSize.caption,
    marginTop: 2,
  },
  botHint: {
    color: colors.textMuted,
    fontSize: fontSize.caption,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  botInput: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  botBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  botBtnText: {
    color: colors.textInverse,
    fontWeight: fontWeight.semibold,
    fontSize: fontSize.md,
  },
}));

export default ToolsScreen;
