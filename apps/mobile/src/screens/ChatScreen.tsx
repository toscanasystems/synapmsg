/**
 * ChatScreen — WhatsApp-like header + clip + acciones reales.
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
  TextInput,
  ImageBackground,
  Share,
  Linking,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Contacts from 'expo-contacts';
import * as Location from 'expo-location';
import { Audio } from 'expo-av';
import colors from '../theme/colors';
import { fontSize, fontWeight, radius, spacing } from '../theme/spacing';
import { useAuthStore } from '../store/auth';
import { useChatsStore } from '../store/chats';
import { useChatPrefsStore } from '../store/chatPrefs';
import { useAppLockStore } from '../store/appLock';
import { useHiddenChatsStore } from '../store/hiddenChats';
import chatsApi from '../api/chats';
import messagesApi from '../api/messages';
import { uploadLocalFile } from '../api/media';
import wsManager from '../api/websocket';
import type { DisappearHours } from '../store/chatPrefs';
import {
  Message,
  RootStackParamList,
  User,
  languageFlag,
  languageLabel,
} from '../types';
import { ChatBubble } from '../components/ChatBubble';
import { MessageInput } from '../components/MessageInput';
import { UserAvatar } from '../components/UserAvatar';
import { Loading } from '../components/Loading';
import { ChatHeaderMenu, ChatMenuAction } from '../components/ChatHeaderMenu';
import { AttachAction } from '../components/AttachSheet';
import { ApiError } from '../api/client';
import {
  getSignalIdentityPub,
  signalSafetyNumber,
  safetyQrPayload,
} from '../crypto/signalSession';
import { consumeKeyChanged, getPeerIdentityPub } from '../crypto/peerCache';

export function ChatScreen(): JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList, 'Chat'>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Chat'>>();
  const {
    chatId,
    contactName: initialContactName,
    contactLanguage: initialContactLang,
  } = route.params;

  const me = useAuthStore((s) => s.user);
  const messages = useChatsStore((s) => s.messagesByChat[chatId] ?? []);
  const sendingChatId = useChatsStore((s) => s.sendingChatId);
  const fetchMessages = useChatsStore((s) => s.fetchMessages);
  const sendMessage = useChatsStore((s) => s.sendMessage);
  const scheduleMessage = useChatsStore((s) => s.scheduleMessage);
  const clearChat = useChatsStore((s) => s.clearChat);
  const setEncryptionMode = useChatsStore((s) => s.setEncryptionMode);
  const chatMeta = useChatsStore((s) => s.chats.find((c) => c.id === chatId));
  const reactToMessage = useChatsStore((s) => s.reactToMessage);
  const editMessage = useChatsStore((s) => s.editMessage);
  const deleteMessage = useChatsStore((s) => s.deleteMessage);
  const leaveGroup = useChatsStore((s) => s.leaveGroup);
  const addMembers = useChatsStore((s) => s.addMembers);

  const lists = useChatPrefsStore((s) => s.lists);
  const addList = useChatPrefsStore((s) => s.addList);
  const addChatToList = useChatPrefsStore((s) => s.addChatToList);
  const wallpaper = useChatPrefsStore((s) => s.wallpaperByChat[chatId]);
  const setWallpaper = useChatPrefsStore((s) => s.setWallpaper);
  const mutedChatIds = useChatPrefsStore((s) => s.mutedChatIds);
  const toggleMute = useChatPrefsStore((s) => s.toggleMute);
  const toggleArchive = useChatPrefsStore((s) => s.toggleArchive);
  const blockUser = useChatPrefsStore((s) => s.blockUser);
  const isBlocked = useChatPrefsStore((s) => s.isBlocked);
  const disappearHours = useChatPrefsStore(
    (s) => s.disappearByChat[chatId] ?? 0,
  );
  const disappearTypes = useChatPrefsStore(
    (s) =>
      s.disappearTypesByChat[chatId] ?? {
        text: true,
        image: true,
        audio: true,
      },
  );
  const setDisappear = useChatPrefsStore((s) => s.setDisappear);
  const [viewOnceNext, setViewOnceNext] = useState(false);

  const [contactName, setContactName] = useState(initialContactName ?? 'Chat');
  const [contactLanguage, setContactLanguage] = useState(
    initialContactLang ?? '',
  );
  const [otherUserId, setOtherUserId] = useState<string | null>(null);
  const [isGroup, setIsGroup] = useState(false);
  const [participantNames, setParticipantNames] = useState<string[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [listModal, setListModal] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const [addMembersOpen, setAddMembersOpen] = useState(false);
  const [memberQuery, setMemberQuery] = useState('');
  const [memberResults, setMemberResults] = useState<User[]>([]);
  const [memberSelected, setMemberSelected] = useState<User[]>([]);
  const [memberSearching, setMemberSearching] = useState(false);
  const [memberSaving, setMemberSaving] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [forwardMsg, setForwardMsg] = useState<Message | null>(null);
  const [peerTyping, setPeerTyping] = useState(false);
  const [peerOnline, setPeerOnline] = useState(false);
  const [peerLastSeen, setPeerLastSeen] = useState<string | null>(null);
  const [peerReadAt, setPeerReadAt] = useState<string | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSent = useRef(0);

  const chats = useChatsStore((s) => s.chats);
  const muted = mutedChatIds.includes(chatId);
  const blocked = otherUserId ? isBlocked(otherUserId) : false;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const detail = await chatsApi.detail(chatId);
        if (cancelled) return;
        setIsGroup(detail.chat?.type === 'group');
        setParticipantNames(
          detail.participants.map((p) =>
            p.userId === me?.id ? `${p.user.name} (tú)` : p.user.name,
          ),
        );
        const hoursRaw = Number(detail.chat?.disappearHours ?? 0);
        const hours = ([0, 1, 6, 12, 24] as const).includes(
          hoursRaw as 0 | 1 | 6 | 12 | 24,
        )
          ? (hoursRaw as 0 | 1 | 6 | 12 | 24)
          : 0;
        setDisappear(chatId, hours, {
          text: detail.chat?.disappearText !== false,
          image: detail.chat?.disappearImage !== false,
          audio: detail.chat?.disappearAudio !== false,
        });
        const other = detail.participants.find((p) => p.userId !== me?.id);
        if (other) {
          setContactName(other.user.name);
          setContactLanguage(other.user.preferredLanguage);
          setOtherUserId(other.userId);
          setPeerOnline(Boolean(other.user.online));
          setPeerLastSeen(other.user.lastSeenAt ?? null);
          setPeerReadAt(other.lastReadAt ?? null);
        } else if (detail.chat?.type === 'group') {
          setContactName(detail.chat.name || 'Grupo');
        }
      } catch {
        /* route params */
      } finally {
        if (!cancelled) setLoadingMessages(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chatId, me]);

  useEffect(() => {
    void fetchMessages(chatId).finally(() => setLoadingMessages(false));
    void chatsApi.markRead(chatId).catch(() => undefined);
  }, [chatId, fetchMessages]);

  useEffect(() => {
    if (!otherUserId) return;
    void (async () => {
      try {
        await getPeerIdentityPub(otherUserId);
        if (consumeKeyChanged(otherUserId)) {
          Alert.alert(
            'Clave cambiada',
            'Key Transparency detectó un cambio en la identidad E2E del contacto. Verifica el código de seguridad.',
          );
        }
      } catch {
        /* peer sin E2E aún */
      }
    })();
  }, [otherUserId]);

  useEffect(() => {
    const unsub = wsManager.onMessage((msg) => {
      if (
        (msg.type === 'typing' || msg.type === 'typing_stop') &&
        msg.chatId === chatId
      ) {
        if (msg.type === 'typing_stop') {
          setPeerTyping(false);
          return;
        }
        setPeerTyping(true);
        if (typingTimer.current) clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => setPeerTyping(false), 3500);
        return;
      }
      if (
        msg.type === 'messages_read' &&
        msg.chatId === chatId &&
        msg.userId !== me?.id
      ) {
        setPeerReadAt(msg.readAt);
        return;
      }
      if (msg.type === 'presence' && msg.userId === otherUserId) {
        setPeerOnline(Boolean(msg.online));
        if (msg.lastSeenAt) setPeerLastSeen(msg.lastSeenAt);
        return;
      }
      if (msg.type === 'message' && msg.chatId === chatId) {
        void chatsApi.markRead(chatId).catch(() => undefined);
      }
    });
    return () => {
      unsub();
      if (typingTimer.current) clearTimeout(typingTimer.current);
      wsManager.send('typing_stop', { chatId });
    };
  }, [chatId, me?.id, otherUserId]);

  const filteredMessages = useMemo(() => {
    const now = Date.now();
    let list = messages.filter((m) => {
      if (m.expiresAt && new Date(m.expiresAt).getTime() <= now) return false;
      return true;
    });
    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (m) =>
        m.originalText?.toLowerCase().includes(q) ||
        m.translatedText?.toLowerCase().includes(q),
    );
  }, [messages, searchQuery]);

  const invertedMessages = useMemo(
    () => [...filteredMessages].reverse(),
    [filteredMessages],
  );

  const handleReact = useCallback(
    (messageId: string, emoji: string) => {
      void reactToMessage(chatId, messageId, emoji).catch((err) => {
        Alert.alert(
          'Reacción',
          err instanceof ApiError ? err.message : 'No se pudo reaccionar.',
        );
      });
    },
    [chatId, reactToMessage],
  );

  const handleEdit = useCallback(
    (messageId: string, text: string) => {
      void editMessage(chatId, messageId, text).catch((err) => {
        Alert.alert(
          'Editar',
          err instanceof ApiError ? err.message : 'No se pudo editar.',
        );
      });
    },
    [chatId, editMessage],
  );

  const handleDelete = useCallback(
    (messageId: string) => {
      void deleteMessage(chatId, messageId).catch((err) => {
        Alert.alert(
          'Eliminar',
          err instanceof ApiError ? err.message : 'No se pudo eliminar.',
        );
      });
    },
    [chatId, deleteMessage],
  );

  const handleReply = useCallback((message: Message) => {
    setReplyTo(message);
  }, []);

  const handleForward = useCallback((message: Message) => {
    setForwardMsg(message);
  }, []);

  const handleOpenViewOnce = useCallback(
    async (message: Message) => {
      const res = await messagesApi.openViewOnce(chatId, message.id);
      return res;
    },
    [chatId],
  );

  const renderItem: ListRenderItem<Message> = useCallback(
    ({ item }) => (
      <ChatBubble
        message={item}
        isMine={item.senderId === me?.id}
        peerReadAt={peerReadAt}
        onReact={handleReact}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onReply={handleReply}
        onForward={handleForward}
        onOpenViewOnce={handleOpenViewOnce}
      />
    ),
    [
      me,
      peerReadAt,
      handleReact,
      handleEdit,
      handleDelete,
      handleReply,
      handleForward,
      handleOpenViewOnce,
    ],
  );

  const searchMembers = useCallback(async (q: string) => {
    setMemberQuery(q);
    if (q.trim().length < 2) {
      setMemberResults([]);
      return;
    }
    setMemberSearching(true);
    try {
      const users = await chatsApi.searchUsers(q.trim());
      setMemberResults(users);
    } catch {
      setMemberResults([]);
    } finally {
      setMemberSearching(false);
    }
  }, []);

  const confirmAddMembers = useCallback(async () => {
    if (memberSelected.length === 0) {
      Alert.alert('Grupo', 'Elige al menos un contacto.');
      return;
    }
    setMemberSaving(true);
    try {
      await addMembers(
        chatId,
        memberSelected.map((u) => u.id),
      );
      try {
        const detail = await chatsApi.detail(chatId);
        setParticipantNames(
          detail.participants.map((p) =>
            p.userId === me?.id ? `${p.user.name} (tú)` : p.user.name,
          ),
        );
      } catch {
        /* keep previous names */
      }
      setAddMembersOpen(false);
      setMemberSelected([]);
      setMemberQuery('');
      setMemberResults([]);
      Alert.alert('Grupo', 'Participantes agregados.');
    } catch (err) {
      Alert.alert(
        'Grupo',
        err instanceof ApiError ? err.message : 'No se pudo agregar.',
      );
    } finally {
      setMemberSaving(false);
    }
  }, [addMembers, chatId, memberSelected, me?.id]);

  const handleSend = useCallback(
    (text: string) => {
      if (blocked) {
        Alert.alert('Bloqueado', 'Desbloquea el contacto para enviar mensajes.');
        return;
      }
      const replyId = replyTo?.id;
      setReplyTo(null);
      wsManager.send('typing_stop', { chatId });
      void sendMessage(chatId, text, replyId ? { replyToId: replyId } : undefined);
    },
    [blocked, chatId, sendMessage, replyTo],
  );

  const handleComposerChange = useCallback(
    (text: string) => {
      if (!text.trim()) {
        wsManager.send('typing_stop', { chatId });
        return;
      }
      const now = Date.now();
      if (now - lastTypingSent.current < 1800) return;
      lastTypingSent.current = now;
      wsManager.send('typing', { chatId });
    },
    [chatId],
  );

  const handleSchedule = useCallback(
    (text: string, sendAt: string) => {
      if (blocked) {
        Alert.alert('Bloqueado', 'Desbloquea el contacto para programar.');
        return;
      }
      if (chatMeta?.encryptionMode === 'e2e') {
        Alert.alert(
          'Privado E2E',
          'No se pueden programar mensajes en chats E2E (evitarían texto plano en el servidor).',
        );
        return;
      }
      void scheduleMessage(chatId, text, sendAt)
        .then(() => {
          Alert.alert(
            'Programado',
            `Se enviará a las ${new Date(sendAt).toLocaleString()}.`,
          );
        })
        .catch((err) => {
          Alert.alert(
            'Programar',
            err instanceof Error ? err.message : 'No se pudo programar.',
          );
        });
    },
    [blocked, chatId, chatMeta?.encryptionMode, scheduleMessage],
  );

  const sendMedia = useCallback(
    async (
      uri: string,
      contentType: string,
      caption: string,
      mediaType: string,
      opts?: { viewOnce?: boolean },
    ) => {
      try {
        const uploaded = await uploadLocalFile(uri, contentType);
        if (!uploaded.url) {
          throw new Error('El servidor no devolvió URL de media');
        }
        await sendMessage(chatId, caption, {
          mediaUrl: uploaded.url,
          mediaType: uploaded.mediaType || mediaType,
          viewOnce: Boolean(opts?.viewOnce),
        });
        if (opts?.viewOnce) setViewOnceNext(false);
      } catch (err) {
        const msg =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'No se pudo subir el archivo.';
        // Diferir Alert tras picker (Android).
        setTimeout(() => Alert.alert('Adjunto', msg), 350);
      }
    },
    [chatId, sendMessage],
  );

  const applyDisappear = useCallback(
    (hours: DisappearHours, types?: { text: boolean; image: boolean; audio: boolean }) => {
      const nextTypes = types ?? disappearTypes;
      setDisappear(chatId, hours, nextTypes);
      void chatsApi
        .setDisappear(chatId, {
          hours,
          text: nextTypes.text,
          image: nextTypes.image,
          audio: nextTypes.audio,
        })
        .catch((err) => {
          Alert.alert(
            'Autodestrucción',
            err instanceof Error ? err.message : 'No se pudo sincronizar.',
          );
        });
    },
    [chatId, disappearTypes, setDisappear],
  );

  const openLists = useCallback(() => {
    setListModal(true);
  }, []);

  const handleMenuAction = useCallback(
    (action: ChatMenuAction) => {
      switch (action) {
        case 'info':
        case 'group_info':
          Alert.alert(
            isGroup ? 'Info. del grupo' : 'Info. del contacto',
            [
              contactName,
              isGroup
                ? `Participantes (${participantNames.length}):\n${
                    participantNames.join('\n') || '—'
                  }`
                : `Idioma: ${
                    contactLanguage ? languageLabel(contactLanguage) : '—'
                  }`,
              muted ? 'Silenciado' : '',
              disappearHours
                ? `Autodestruye: ${disappearHours}h`
                : '',
            ]
              .filter(Boolean)
              .join('\n'),
          );
          break;
        case 'e2e_mode': {
          const current = chatMeta?.encryptionMode === 'e2e' ? 'e2e' : 'cloud';
          Alert.alert(
            'Privacidad del chat',
            current === 'e2e'
              ? 'Modo actual: Privado E2E + PQ híbrido (ML-KEM768). El servidor solo ve ciphertext.'
              : 'Modo actual: Nube (traducción cloud + historial en servidor).',
            [
              { text: 'Cancelar', style: 'cancel' },
              {
                text: 'Nube sincronizada',
                onPress: () => {
                  Alert.alert(
                    'Avisо — modo Nube',
                    'En Nube el servidor puede leer y traducir este chat (p. ej. DeepL) y sincronizar el historial. No es Privado. ¿Continuar?',
                    [
                      { text: 'Cancelar', style: 'cancel' },
                      {
                        text: 'Activar Nube',
                        style: 'destructive',
                        onPress: () => {
                          void setEncryptionMode(chatId, 'cloud').catch((err) => {
                            Alert.alert(
                              'Privacidad',
                              err instanceof ApiError
                                ? err.message
                                : 'No se pudo cambiar.',
                            );
                          });
                        },
                      },
                    ],
                  );
                },
              },
              {
                text: 'Privado E2E',
                onPress: () => {
                  void setEncryptionMode(chatId, 'e2e').catch((err) => {
                    Alert.alert(
                      'Privacidad',
                      err instanceof ApiError ? err.message : 'Registra el dispositivo E2E en Ajustes.',
                    );
                  });
                },
              },
            ],
          );
          break;
        }
        case 'safety':
          void (async () => {
            try {
              const mine = await getSignalIdentityPub();
              if (!mine || !otherUserId || !me?.id) {
                Alert.alert(
                  'Código de seguridad',
                  'Registra el dispositivo Signal en Ajustes y asegurate de que el contacto también lo tenga.',
                );
                return;
              }
              const theirs = await getPeerIdentityPub(otherUserId);
              const code = await signalSafetyNumber(
                me.id,
                mine,
                otherUserId,
                theirs,
              );
              const qr = safetyQrPayload(code);
              Alert.alert(
                'Código de seguridad',
                `${code}\n\nQR (ambos deben ver el mismo):\n${qr}`,
              );
            } catch (err) {
              Alert.alert(
                'Código de seguridad',
                err instanceof ApiError
                  ? err.message
                  : 'El contacto aún no registró un dispositivo Signal.',
              );
            }
          })();
          break;
        case 'search':
          setSearchOpen(true);
          break;
        case 'mute': {
          const nowMuted = toggleMute(chatId);
          Alert.alert(
            nowMuted ? 'Chat silenciado' : 'Notificaciones activadas',
            nowMuted
              ? 'No recibirás avisos de este chat.'
              : 'Volverás a recibir avisos.',
          );
          break;
        }
        case 'hide': {
          void (async () => {
            const lockOn = useAppLockStore.getState().enabled;
            if (!lockOn) {
              Alert.alert(
                'Chats ocultos',
                'Activá un PIN de app en Ajustes para ocultar chats.',
              );
              return;
            }
            const hidden = await useHiddenChatsStore
              .getState()
              .toggleHidden(chatId);
            Alert.alert(
              hidden ? 'Chat oculto' : 'Chat visible',
              hidden
                ? 'Desaparece de la lista. En Chats: tocá el ojo para revelar con tu PIN.'
                : 'El chat volvió a la lista principal.',
            );
            if (hidden) navigation.goBack();
          })();
          break;
        }
        case 'archive': {
          const archived = toggleArchive(chatId);
          Alert.alert(
            archived ? 'Chat archivado' : 'Chat desarchivado',
            archived
              ? 'Lo verás en Archivados en la lista.'
              : 'Volvió a la bandeja principal.',
          );
          if (archived) navigation.navigate('ChatList');
          break;
        }
        case 'disappearing': {
          const pickTypes = (hours: DisappearHours) => {
            Alert.alert(
              'Autodestrucción · tipos',
              'Qué se borra en ambos dispositivos',
              [
                {
                  text: 'Todo (texto, fotos, audios)',
                  onPress: () =>
                    applyDisappear(hours, {
                      text: true,
                      image: true,
                      audio: true,
                    }),
                },
                {
                  text: 'Solo texto',
                  onPress: () =>
                    applyDisappear(hours, {
                      text: true,
                      image: false,
                      audio: false,
                    }),
                },
                {
                  text: 'Solo fotos',
                  onPress: () =>
                    applyDisappear(hours, {
                      text: false,
                      image: true,
                      audio: false,
                    }),
                },
                {
                  text: 'Solo audios',
                  onPress: () =>
                    applyDisappear(hours, {
                      text: false,
                      image: false,
                      audio: true,
                    }),
                },
                {
                  text: 'Fotos + audios',
                  onPress: () =>
                    applyDisappear(hours, {
                      text: false,
                      image: true,
                      audio: true,
                    }),
                },
                { text: 'Cancelar', style: 'cancel' },
              ],
            );
          };
          Alert.alert(
            'Autodestrucción',
            'Se elimina en emisor y receptor',
            [
              {
                text: 'Desactivado',
                onPress: () => applyDisappear(0),
              },
              { text: 'Cada 1 hora', onPress: () => pickTypes(1) },
              { text: 'Cada 6 horas', onPress: () => pickTypes(6) },
              { text: 'Cada 12 horas', onPress: () => pickTypes(12) },
              { text: 'Cada 24 horas', onPress: () => pickTypes(24) },
              { text: 'Cancelar', style: 'cancel' },
            ],
          );
          break;
        }
        case 'wallpaper':
          Alert.alert('Fondo de pantalla', undefined, [
            {
              text: 'Elegir de galería',
              onPress: () => {
                void (async () => {
                  const perm =
                    await ImagePicker.requestMediaLibraryPermissionsAsync();
                  if (!perm.granted) {
                    Alert.alert('Permiso', 'Activa acceso a fotos.');
                    return;
                  }
                  const res = await ImagePicker.launchImageLibraryAsync({
                    mediaTypes: ImagePicker.MediaTypeOptions.Images,
                    quality: 0.7,
                  });
                  if (!res.canceled && res.assets[0]) {
                    setWallpaper(chatId, res.assets[0].uri);
                  }
                })();
              },
            },
            {
              text: 'Quitar fondo',
              style: 'destructive',
              onPress: () => setWallpaper(chatId, null),
            },
            { text: 'Cancelar', style: 'cancel' },
          ]);
          break;
        case 'add_list':
          openLists();
          break;
        case 'export':
          void (async () => {
            const lines = messages.map((m) => {
              const who = m.senderId === me?.id ? 'Yo' : m.sender?.name || 'Ellos';
              const t = new Date(m.createdAt).toLocaleString();
              return `[${t}] ${who}: ${m.originalText}`;
            });
            await Share.share({
              message: `Chat Synap · ${contactName}\n\n${lines.join('\n')}`,
            });
          })();
          break;
        case 'clear':
          Alert.alert(
            'Vaciar chat',
            'Se vaciará el chat solo para ti. Los demás conservan su historial.',
            [
              { text: 'Cancelar', style: 'cancel' },
              {
                text: 'Vaciar',
                style: 'destructive',
                onPress: () => {
                  void clearChat(chatId).catch((err) => {
                    Alert.alert(
                      'Vaciar chat',
                      err instanceof ApiError
                        ? err.message
                        : 'No se pudo vaciar el chat.',
                    );
                  });
                },
              },
            ],
          );
          break;
        case 'block':
          if (!otherUserId) break;
          Alert.alert('Bloquear', `¿Bloquear a ${contactName}?`, [
            { text: 'Cancelar', style: 'cancel' },
            {
              text: 'Bloquear',
              style: 'destructive',
              onPress: () => {
                blockUser(otherUserId);
                Alert.alert('Bloqueado', `${contactName} fue bloqueado.`);
              },
            },
          ]);
          break;
        case 'report':
          void Linking.openURL(
            `mailto:soporte@synapmsg.ai?subject=${encodeURIComponent(
              `Reporte chat ${chatId}`,
            )}&body=${encodeURIComponent(
              `Quiero reportar el chat con ${contactName} (${chatId}).`,
            )}`,
          );
          break;
        case 'group_media': {
          const media = messages.filter((m) => m.mediaUrl);
          Alert.alert(
            'Multimedia',
            media.length
              ? `${media.length} archivo(s) en este chat.`
              : 'Aún no hay fotos, docs ni audio.',
          );
          break;
        }
        case 'add_members':
          setMemberSelected([]);
          setMemberQuery('');
          setMemberResults([]);
          setAddMembersOpen(true);
          break;
        case 'exit_group':
          Alert.alert('Salir del grupo', 'Dejarás de recibir mensajes de este grupo.', [
            { text: 'Cancelar', style: 'cancel' },
            {
              text: 'Salir',
              style: 'destructive',
              onPress: () => {
                void leaveGroup(chatId)
                  .then(() => navigation.navigate('ChatList'))
                  .catch((err) => {
                    Alert.alert(
                      'Grupo',
                      err instanceof ApiError
                        ? err.message
                        : 'No se pudo salir del grupo.',
                    );
                  });
              },
            },
          ]);
          break;
        default:
          break;
      }
    },
    [
      isGroup,
      contactName,
      contactLanguage,
      participantNames,
      muted,
      disappearHours,
      toggleMute,
      toggleArchive,
      chatId,
      applyDisappear,
      setWallpaper,
      openLists,
      messages,
      me,
      clearChat,
      setEncryptionMode,
      chatMeta?.encryptionMode,
      otherUserId,
      blockUser,
      navigation,
      leaveGroup,
    ],
  );

  const startCall = useCallback(
    (callType: 'voice' | 'video') => {
      navigation.navigate('Call', {
        chatId,
        contactName,
        callType,
        incoming: false,
      });
    },
    [navigation, chatId, contactName],
  );

  const pickAndAnnounce = useCallback(
    async (action: AttachAction) => {
      if (blocked) {
        Alert.alert('Bloqueado', 'Desbloquea el contacto para enviar.');
        return;
      }
      try {
        if (action === 'gallery' || action === 'camera') {
          const perm =
            action === 'camera'
              ? await ImagePicker.requestCameraPermissionsAsync()
              : await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!perm.granted) {
            Alert.alert('Permiso necesario', 'Activa cámara/galería en Ajustes.');
            return;
          }
          const result =
            action === 'camera'
              ? await ImagePicker.launchCameraAsync({
                  mediaTypes: ImagePicker.MediaTypeOptions.Images,
                  quality: 0.55,
                  base64: false,
                })
              : await ImagePicker.launchImageLibraryAsync({
                  mediaTypes: ImagePicker.MediaTypeOptions.Images,
                  quality: 0.55,
                });
          if (result.canceled || !result.assets?.[0]) return;
          const asset = result.assets[0];
          const mime = asset.mimeType || 'image/jpeg';
          // No Alert tras el picker (Android: Modal/picker race → el envío nunca corre).
          // "Una vez" = toggle del ojo en el composer (viewOnceNext).
          await sendMedia(asset.uri, mime, '📷 Foto', 'image', {
            viewOnce: viewOnceNext,
          });
          return;
        }

        if (action === 'document') {
          const doc = await DocumentPicker.getDocumentAsync({
            copyToCacheDirectory: true,
            multiple: false,
          });
          if (doc.canceled || !doc.assets?.[0]) return;
          const file = doc.assets[0];
          const mime = file.mimeType || 'application/octet-stream';
          await sendMedia(file.uri, mime, `📄 ${file.name}`, 'file');
          return;
        }

        if (action === 'audio') {
          if (recordingRef.current) {
            await recordingRef.current.stopAndUnloadAsync();
            const uri = recordingRef.current.getURI();
            recordingRef.current = null;
            setRecording(null);
            if (uri) {
              await sendMedia(uri, 'audio/m4a', '🎵 Nota de voz', 'audio', {
                viewOnce: viewOnceNext,
              });
            }
            return;
          }
          const perm = await Audio.requestPermissionsAsync();
          if (!perm.granted) {
            Alert.alert('Micrófono', 'Activa el micrófono en Ajustes.');
            return;
          }
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: true,
            playsInSilentModeIOS: true,
          });
          const rec = new Audio.Recording();
          await rec.prepareToRecordAsync(
            Audio.RecordingOptionsPresets.HIGH_QUALITY,
          );
          await rec.startAsync();
          recordingRef.current = rec;
          setRecording(rec);
          Alert.alert(
            'Grabando…',
            'Pulsa de nuevo Audio en el clip para detener y enviar.',
          );
          return;
        }

        if (action === 'location') {
          const perm = await Location.requestForegroundPermissionsAsync();
          if (!perm.granted) {
            Alert.alert('Ubicación', 'Activa la ubicación en Ajustes.');
            return;
          }
          const pos = await Location.getCurrentPositionAsync({});
          const { latitude, longitude } = pos.coords;
          const link = `https://maps.google.com/?q=${latitude},${longitude}`;
          await sendMessage(chatId, `📍 Mi ubicación\n${link}`);
          return;
        }

        if (action === 'contact') {
          const { status } = await Contacts.requestPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Contactos', 'Activa el permiso de contactos.');
            return;
          }
          // SDK 51+: picker nativo si existe
          const anyContacts = Contacts as typeof Contacts & {
            presentContactPickerAsync?: () => Promise<Contacts.Contact | null>;
          };
          if (anyContacts.presentContactPickerAsync) {
            const c = await anyContacts.presentContactPickerAsync();
            if (!c) return;
            const phone = c.phoneNumbers?.[0]?.number || '';
            const email = c.emails?.[0]?.email || '';
            await sendMessage(
              chatId,
              `👤 ${c.name || 'Contacto'}${phone ? `\n${phone}` : ''}${
                email ? `\n${email}` : ''
              }`,
            );
            return;
          }
          const { data } = await Contacts.getContactsAsync({
            fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails],
            pageSize: 30,
          });
          const first = data.find((c) => c.name);
          if (!first) {
            Alert.alert('Contactos', 'No hay contactos para compartir.');
            return;
          }
          Alert.alert('Compartir contacto', `¿Enviar a ${first.name}?`, [
            { text: 'Cancelar', style: 'cancel' },
            {
              text: 'Enviar',
              onPress: () => {
                const phone = first.phoneNumbers?.[0]?.number || '';
                void sendMessage(
                  chatId,
                  `👤 ${first.name}${phone ? `\n${phone}` : ''}`,
                );
              },
            },
          ]);
        }
      } catch (err) {
        Alert.alert(
          'Adjunto',
          err instanceof Error ? err.message : 'No se pudo completar.',
        );
      }
    },
    [blocked, sendMedia, sendMessage, chatId, viewOnceNext],
  );

  const goBack = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('ChatList');
  }, [navigation]);

  const langIndicator = useMemo(() => {
    const left = contactLanguage ? languageFlag(contactLanguage) : '🌐';
    const right = me ? languageFlag(me.preferredLanguage) : '🌐';
    return `${left} → ${right}`;
  }, [contactLanguage, me]);

  const isSending = sendingChatId === chatId;

  const body = (
    <>
      {searchOpen ? (
        <View style={styles.searchBar}>
          <Feather name="search" size={18} color={colors.textSecondary} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Buscar en el chat…"
            placeholderTextColor={colors.textSecondary}
            style={styles.searchInput}
            autoFocus
          />
          <Pressable
            onPress={() => {
              setSearchOpen(false);
              setSearchQuery('');
            }}
            hitSlop={8}
          >
            <Feather name="x" size={20} color={colors.textPrimary} />
          </Pressable>
        </View>
      ) : null}

      {loadingMessages && messages.length === 0 ? (
        <Loading label="Cargando mensajes…" />
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
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>
                {searchQuery
                  ? 'Sin resultados en este chat'
                  : `¡Saluda a ${contactName}!`}
              </Text>
            </View>
          }
        />
      )}
    </>
  );

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top }]}>
          <Pressable onPress={goBack} hitSlop={12} style={styles.iconBtn}>
            <Feather name="arrow-left" size={22} color={colors.textPrimary} />
          </Pressable>

          <Pressable
            style={styles.identity}
            onPress={() => handleMenuAction(isGroup ? 'group_info' : 'info')}
          >
            <UserAvatar name={contactName} size={36} />
            <View style={styles.headerText}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {contactName}
              </Text>
              <Text style={styles.headerLang} numberOfLines={1}>
                {peerTyping
                  ? 'escribiendo…'
                  : !isGroup && peerOnline
                    ? 'en línea'
                    : !isGroup && peerLastSeen
                      ? `últ. vez ${new Date(peerLastSeen).toLocaleString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          day: '2-digit',
                          month: '2-digit',
                        })}`
                      : `${recording ? '🎙 Grabando… · ' : ''}${
                          muted ? 'Silenciado · ' : ''
                        }${blocked ? 'Bloqueado · ' : ''}${langIndicator}`}
              </Text>
            </View>
          </Pressable>

          <Pressable onPress={openLists} hitSlop={8} style={styles.iconBtn}>
            <Feather name="list" size={20} color={colors.textPrimary} />
          </Pressable>
          <Pressable
            onPress={() => startCall('video')}
            hitSlop={8}
            style={styles.iconBtn}
          >
            <Feather name="video" size={20} color={colors.textPrimary} />
          </Pressable>
          <Pressable
            onPress={() => startCall('voice')}
            hitSlop={8}
            style={styles.iconBtn}
          >
            <Feather name="phone" size={20} color={colors.textPrimary} />
          </Pressable>
          <Pressable
            onPress={() => setMenuOpen(true)}
            hitSlop={8}
            style={styles.iconBtn}
          >
            <Feather name="more-vertical" size={20} color={colors.textPrimary} />
          </Pressable>
        </View>

        {wallpaper ? (
          <ImageBackground source={{ uri: wallpaper }} style={styles.flex} imageStyle={styles.wallpaper}>
            {body}
          </ImageBackground>
        ) : (
          <View style={styles.flex}>{body}</View>
        )}

        {isSending ? (
          <View style={styles.sendingRow}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={styles.sendingText}>Enviando…</Text>
          </View>
        ) : null}

        <MessageInput
          onSend={handleSend}
          onSchedule={
            chatMeta?.encryptionMode === 'e2e' ? undefined : handleSchedule
          }
          onAttach={pickAndAnnounce}
          onChangeText={handleComposerChange}
          replyPreview={
            replyTo
              ? {
                  author: replyTo.sender?.name || 'Mensaje',
                  text: replyTo.originalText,
                }
              : null
          }
          onCancelReply={() => setReplyTo(null)}
          disabled={blocked}
          placeholder={
            blocked
              ? 'Contacto bloqueado'
              : viewOnceNext
                ? 'Foto/audio · una vez…'
                : 'Mensaje…'
          }
          viewOnce={viewOnceNext}
          onToggleViewOnce={() => setViewOnceNext((v) => !v)}
        />

        <ChatHeaderMenu
          visible={menuOpen}
          isGroup={isGroup}
          onClose={() => setMenuOpen(false)}
          onAction={handleMenuAction}
        />

        <Modal visible={Boolean(forwardMsg)} transparent animationType="fade">
          <Pressable
            style={styles.modalBg}
            onPress={() => setForwardMsg(null)}
          >
            <Pressable
              style={styles.modalCard}
              onPress={(e) => e.stopPropagation()}
            >
              <Text style={styles.modalTitle}>Reenviar a…</Text>
              {chats
                .filter((c) => c.id !== chatId)
                .slice(0, 12)
                .map((c) => {
                  const label =
                    c.name ||
                    c.participants.find((p) => p.userId !== me?.id)?.user
                      .name ||
                    'Chat';
                  return (
                    <Pressable
                      key={c.id}
                      style={styles.listRow}
                      onPress={() => {
                        const msg = forwardMsg;
                        setForwardMsg(null);
                        if (!msg) return;
                        const text =
                          msg.originalText || msg.translatedText || '';
                        void sendMessage(c.id, `↪ ${text}`).then(() => {
                          Alert.alert('Reenviado', `Enviado a ${label}.`);
                        });
                      }}
                    >
                      <UserAvatar name={label} size={28} />
                      <Text style={styles.listRowText}>{label}</Text>
                    </Pressable>
                  );
                })}
              {chats.filter((c) => c.id !== chatId).length === 0 ? (
                <Text style={styles.memberHint}>No hay otros chats.</Text>
              ) : null}
            </Pressable>
          </Pressable>
        </Modal>

        <Modal visible={addMembersOpen} transparent animationType="fade">
          <Pressable
            style={styles.modalBg}
            onPress={() => setAddMembersOpen(false)}
          >
            <Pressable
              style={styles.modalCard}
              onPress={(e) => e.stopPropagation()}
            >
              <Text style={styles.modalTitle}>Agregar participantes</Text>
              <TextInput
                value={memberQuery}
                onChangeText={(t) => void searchMembers(t)}
                placeholder="Buscar por nombre o usuario"
                placeholderTextColor={colors.textSecondary}
                style={styles.memberSearch}
                autoCapitalize="none"
              />
              {memberSearching ? (
                <ActivityIndicator color={colors.accent} style={{ marginVertical: 8 }} />
              ) : null}
              {memberResults.map((u) => {
                const selected = memberSelected.some((s) => s.id === u.id);
                return (
                  <Pressable
                    key={u.id}
                    style={styles.listRow}
                    onPress={() => {
                      setMemberSelected((prev) =>
                        selected
                          ? prev.filter((x) => x.id !== u.id)
                          : [...prev, u],
                      );
                    }}
                  >
                    <UserAvatar name={u.name} size={28} />
                    <Text style={styles.listRowText}>
                      {selected ? '✓ ' : ''}
                      {u.name}
                    </Text>
                  </Pressable>
                );
              })}
              {memberSelected.length > 0 ? (
                <Text style={styles.memberHint}>
                  {memberSelected.length} seleccionado(s)
                </Text>
              ) : null}
              <Pressable
                style={styles.memberSave}
                disabled={memberSaving}
                onPress={() => void confirmAddMembers()}
              >
                {memberSaving ? (
                  <ActivityIndicator color={colors.textInverse} />
                ) : (
                  <Text style={styles.memberSaveText}>Agregar</Text>
                )}
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>

        <Modal visible={listModal} transparent animationType="fade">
          <Pressable style={styles.modalBg} onPress={() => setListModal(false)}>
            <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.modalTitle}>Agregar a lista</Text>
              {lists.map((l) => (
                <Pressable
                  key={l.id}
                  style={styles.modalRow}
                  onPress={() => {
                    addChatToList(l.id, chatId);
                    setListModal(false);
                    Alert.alert('Listo', `Añadido a «${l.name}».`);
                  }}
                >
                  <Text style={styles.modalRowText}>{l.name}</Text>
                </Pressable>
              ))}
              <TextInput
                value={newListName}
                onChangeText={setNewListName}
                placeholder="Nueva lista…"
                placeholderTextColor={colors.textSecondary}
                style={styles.modalInput}
              />
              <Pressable
                style={styles.modalBtn}
                onPress={() => {
                  if (!newListName.trim()) return;
                  addList(newListName.trim());
                  const created = useChatPrefsStore.getState().lists.slice(-1)[0];
                  if (created) addChatToList(created.id, chatId);
                  setNewListName('');
                  setListModal(false);
                  Alert.alert('Lista creada', 'Chat agregado a la nueva lista.');
                }}
              >
                <Text style={styles.modalBtnText}>Crear y agregar</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1 },
  wallpaper: { opacity: 0.35 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  iconBtn: {
    padding: spacing.sm,
    minWidth: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: spacing.xs,
    minWidth: 0,
  },
  headerText: { flex: 1, marginLeft: spacing.sm, minWidth: 0 },
  headerTitle: {
    color: colors.chatNeon,
    fontSize: fontSize.bodyLg,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.3,
  },
  headerLang: {
    color: colors.chatNeonDim,
    fontSize: fontSize.caption,
    marginTop: 2,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 16,
    paddingVertical: spacing.sm,
  },
  list: { flexGrow: 1 },
  emptyWrap: { padding: spacing.xxl, alignItems: 'center' },
  emptyText: { color: colors.chatNeonDim, fontSize: fontSize.body },
  sendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
  },
  sendingText: { color: colors.textSecondary, fontSize: fontSize.caption },
  modalBg: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    padding: spacing.xxl,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
  },
  modalTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.title,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.md,
  },
  modalRow: {
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  modalRowText: { color: colors.textPrimary, fontSize: fontSize.bodyLg },
  modalInput: {
    marginTop: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    color: colors.textPrimary,
    fontSize: 16,
  },
  modalBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  modalBtnText: {
    color: colors.textInverse,
    fontWeight: fontWeight.bold,
  },
  memberSearch: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    color: colors.textPrimary,
    fontSize: 16,
    marginBottom: spacing.sm,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  listRowText: {
    color: colors.textPrimary,
    fontSize: fontSize.bodyLg,
    flex: 1,
  },
  memberHint: {
    color: colors.textSecondary,
    fontSize: fontSize.caption,
    marginTop: spacing.sm,
  },
  memberSave: {
    marginTop: spacing.lg,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  memberSaveText: {
    color: colors.textInverse,
    fontWeight: fontWeight.bold,
  },
});

export default ChatScreen;
