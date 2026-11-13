/**
 * CallScreen — Synap signaling (invite/accept/end).
 * Media: P2P WebRTC only (DTLS-SRTP). Server never mixes audio.
 * Jitsi SFU is disabled here — not E2E for Private chats.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
  Alert,
  PermissionsAndroid,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import colors, { themed } from '../theme/colors';
import { fontSize, fontWeight, spacing } from '../theme/spacing';
import { RootStackParamList } from '../types';
import { useAuthStore } from '../store/auth';
import { DIRECT_API_BASE_URL } from '../api/client';
import wsManager from '../api/websocket';
import { callsApi } from '../api/calls';
import { UserAvatar } from '../components/UserAvatar';
import { startRingtone, stopRingtone } from '../calls/ringtone';

/** PIEZA 1: always P2P WebRTC — never route Private call media through an SFU. */
const MEDIA_ENGINE = 'webrtc' as const;

type CallPerm = 'ok' | 'audio-only' | 'denied';

/** Mic required. Camera optional for video: deny → continue audio-only. */
async function ensureCallPermissions(wantVideo: boolean): Promise<CallPerm> {
  try {
    if (Platform.OS === 'android') {
      const mic = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: 'Micrófono para la llamada',
          message:
            'Synap necesita el micrófono para la llamada cifrada. El audio no pasa por el servidor en claro.',
          buttonPositive: 'Permitir',
          buttonNegative: 'Ahora no',
        },
      );
      if (mic !== PermissionsAndroid.RESULTS.GRANTED) return 'denied';
      if (!wantVideo) return 'ok';
      const cam = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.CAMERA,
        {
          title: 'Cámara para la videollamada',
          message:
            'Synap usa la cámara solo mientras dura la videollamada. Si dices que no, la llamada sigue solo con audio cifrado.',
          buttonPositive: 'Permitir cámara',
          buttonNegative: 'Solo audio',
        },
      );
      return cam === PermissionsAndroid.RESULTS.GRANTED ? 'ok' : 'audio-only';
    }
    const audio = await Audio.requestPermissionsAsync();
    if (!audio.granted) return 'denied';
    return 'ok';
  } catch {
    return 'denied';
  }
}

export function CallScreen(): JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Call'>>();
  const {
    chatId,
    contactName,
    callType,
    incoming,
    callRoom: roomParam,
    isGroup: isGroupParam,
  } = route.params;
  const me = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);

  const [phase, setPhase] = useState<'perm' | 'ringing' | 'in_call' | 'ended'>(
    'perm',
  );
  const [elapsed, setElapsed] = useState(0);
  const [webLoading, setWebLoading] = useState(true);
  const [statusHint, setStatusHint] = useState('Preparando…');
  const [callRoom, setCallRoom] = useState(roomParam || '');
  const [isGroup, setIsGroup] = useState(Boolean(isGroupParam));
  const [rosterHint, setRosterHint] = useState('');
  /** If user denies camera, keep the call but force video=0 in WebRTC. */
  const [forceAudioOnly, setForceAudioOnly] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ringTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Group calls are voice-only mesh (Pieza 4).
  const isVideo = callType === 'video' && !forceAudioOnly && !isGroup;

  const callUrl = useMemo(() => {
    if (!callRoom) return '';
    // Calls keep the direct API path (not the message tunnel).
    const callApi = DIRECT_API_BASE_URL;
    const ws = callApi.replace(/^http/, 'ws') + '/ws';
    const q = new URLSearchParams({
      token: token || '',
      chatId,
      video: isVideo ? '1' : '0',
      name: me?.name || 'Synap',
      userId: me?.id || '',
      role: incoming ? 'callee' : 'caller',
      lang: me?.preferredLanguage || 'es',
      api: callApi,
      ws,
      engine: MEDIA_ENGINE,
      room: callRoom,
    });
    if (isGroup) q.set('group', '1');
    return `${callApi}/call?${q.toString()}`;
  }, [
    token,
    chatId,
    isVideo,
    isGroup,
    me?.id,
    me?.name,
    me?.preferredLanguage,
    incoming,
    callRoom,
  ]);

  const hangUp = useCallback(() => {
    void stopRingtone();
    if (isGroup) {
      // Leave without ending the call for everyone else.
      wsManager.send('call_leave', { chatId });
      void callsApi.leave(chatId).catch(() =>
        callsApi.end(chatId).catch(() => undefined),
      );
    } else {
      wsManager.send('call_end', { chatId });
      void callsApi.end(chatId).catch(() => undefined);
    }
    setPhase('ended');
    if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
    if (navigation.canGoBack()) navigation.goBack();
  }, [chatId, isGroup, navigation]);

  const enterCall = useCallback(() => {
    void stopRingtone();
    setPhase('in_call');
    setWebLoading(true);
    setStatusHint(
      callRoom ? 'Conectando audio cifrado…' : 'Esperando sala segura…',
    );
    if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
  }, [callRoom]);

  // Ringtone while ringing (incoming or outgoing).
  useEffect(() => {
    if (phase === 'ringing') {
      void startRingtone();
    } else {
      void stopRingtone();
    }
    return () => {
      void stopRingtone();
    };
  }, [phase]);

  // Keep screen awake during the call (video and voice).
  useEffect(() => {
    if (phase !== 'in_call' && phase !== 'ringing') return;
    void activateKeepAwakeAsync('synap-call');
    return () => {
      deactivateKeepAwake('synap-call');
    };
  }, [phase]);

  // Permisos → invitar / sonar
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const wantCam = callType === 'video';
      setStatusHint('Pidiendo micrófono' + (wantCam ? '/cámara' : '') + '…');
      const perm = await ensureCallPermissions(wantCam);
      if (cancelled) return;
      if (perm === 'denied') {
        Alert.alert(
          'Permiso necesario',
          wantCam
            ? 'Para llamar, Synap necesita al menos el micrófono. La cámara es opcional: sin ella la llamada sigue solo con audio cifrado.'
            : 'Para la llamada de voz Synap necesita el micrófono. El audio va cifrado entre los teléfonos; el servidor no lo oye.',
          [{ text: 'OK', onPress: () => navigation.goBack() }],
        );
        return;
      }
      if (perm === 'audio-only') {
        setForceAudioOnly(true);
        setStatusHint('Sin cámara · continuarás solo con audio cifrado');
      }

      setStatusHint('Conectando con Synap…');
      await wsManager.ensureConnected(token, 7000);

      if (incoming) {
        setPhase('ringing');
        setStatusHint('Te están llamando…');
        return;
      }

      // HTTP invite is authoritative (also fans out via WS + push + pending inbox).
      try {
        const ready = await callsApi.ready(chatId);
        if (!ready.meOnline) {
          await wsManager.ensureConnected(token, 5000);
        }
        const inv = await callsApi.invite({
          chatId,
          callType: isGroup ? 'voice' : callType,
          fromName: me?.name,
        });
        if (inv.callRoom) setCallRoom(inv.callRoom);
        if (inv.isGroup) setIsGroup(true);
        // Group: caller enters the mesh room immediately; others join as they answer.
        if (isGroup || inv.isGroup) {
          setIsGroup(true);
          enterCall();
          setStatusHint('Llamada de grupo · esperando que entren…');
        } else {
          setPhase('ringing');
          if (inv.peerOnline) {
            setStatusHint(
              `Llamando a ${contactName}…\nSonando en el otro Synap…`,
            );
          } else {
            const peerNames = inv.peers.map((p) => p.name).join(', ');
            setStatusHint(
              `Llamando a ${contactName}…\nAvisado por red.\nSi no suena: en el otro teléfono abrí Synap con la cuenta de ${peerNames || contactName} (mismo chat).`,
            );
          }
        }
      } catch {
        // Fallback: legacy WS-only invite
        const sent = wsManager.send('call_invite', {
          chatId,
          callType,
          fromName: me?.name,
        });
        if (!sent) {
          Alert.alert('Llamada', 'No se pudo avisar al otro usuario.');
          navigation.goBack();
          return;
        }
        setPhase('ringing');
        setStatusHint(`Llamando a ${contactName}…\nEsperando al otro Synap…`);
      }

      ringTimeoutRef.current = setTimeout(() => {
        Alert.alert(
          'Sin respuesta',
          `${contactName} no contestó.\n\nComprobá:\n• Misma cuenta en el otro teléfono que ves en este chat\n• Synap abierto en pantalla\n• Internet en ambos`,
          [{ text: 'OK', onPress: hangUp }],
        );
      }, 60000);
    })();

    return () => {
      cancelled = true;
      if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
    };
  }, [
    chatId,
    callType,
    contactName,
    enterCall,
    hangUp,
    incoming,
    isGroup,
    me?.name,
    navigation,
    token,
  ]);

  useEffect(() => {
    const unsub = wsManager.onMessage((msg) => {
      if (
        (msg.type === 'call_room' ||
          msg.type === 'call_invite' ||
          msg.type === 'call_accept' ||
          msg.type === 'call_ringing') &&
        msg.chatId === chatId &&
        'callRoom' in msg &&
        typeof msg.callRoom === 'string' &&
        msg.callRoom
      ) {
        setCallRoom(msg.callRoom);
      }
      if (msg.type === 'call_ringing' && msg.chatId === chatId && !incoming) {
        if (msg.peerOnline) {
          setStatusHint(
            `Llamando a ${contactName}…\nSonando en el otro Synap…`,
          );
        } else {
          // Don't hang up early — peer may reconnect; keep ringing.
          setStatusHint(
            `Llamando a ${contactName}…\nEl otro Synap aún no está en línea.\nPedile que abra Synap y toque la app.`,
          );
        }
      }
      if (
        (msg.type === 'call_room' || msg.type === 'call_invite') &&
        msg.chatId === chatId &&
        'isGroup' in msg &&
        msg.isGroup
      ) {
        setIsGroup(true);
      }
      if (msg.type === 'call_accept' && msg.chatId === chatId) {
        // 1:1: peer answered → enter. Group: already-in-call peers stay;
        // ringing local user enters on their own Accept button.
        if (!isGroup || !incoming) enterCall();
        if (isGroup && !incoming) {
          setStatusHint('Alguien entró a la llamada de grupo');
        }
      }
      if (msg.type === 'call_roster' && msg.chatId === chatId) {
        setIsGroup(true);
        const members = msg.members || [];
        const live = members.filter((m) => m.status !== 'ringing');
        setRosterHint(
          live.length
            ? `${live.length} en la llamada` +
                (live.some((m) => m.muted) ? ' · hay mic apagado' : '')
            : 'Esperando participantes…',
        );
      }
      if (msg.type === 'call_leave' && msg.chatId === chatId && isGroup) {
        setStatusHint('Alguien salió · la llamada sigue');
        return;
      }
      if (
        (msg.type === 'call_reject' || msg.type === 'call_end') &&
        msg.chatId === chatId
      ) {
        if (isGroup && msg.type === 'call_reject') return;
        if (phase !== 'ended') {
          setStatusHint(
            msg.type === 'call_reject' ? 'Rechazada' : 'Llamada finalizada',
          );
          setTimeout(() => hangUp(), 500);
        }
      }
    });
    return unsub;
  }, [chatId, contactName, enterCall, hangUp, incoming, isGroup, phase]);

  // Only open media WebView once opaque room is known.
  useEffect(() => {
    if (phase === 'in_call' && callRoom) {
      setStatusHint('Conectando audio/video…');
    }
  }, [phase, callRoom]);

  useEffect(() => {
    if (phase !== 'in_call') return;
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase]);

  const clock = useMemo(() => {
    const m = Math.floor(elapsed / 60)
      .toString()
      .padStart(2, '0');
    const s = (elapsed % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }, [elapsed]);

  const accept = useCallback(() => {
    wsManager.send('call_accept', { chatId, callType });
    void (async () => {
      try {
        const acc = await callsApi.accept(chatId);
        if (acc.callRoom) setCallRoom(acc.callRoom);
      } catch {
        /* WS accept may still work */
      }
      enterCall();
    })();
  }, [chatId, callType, enterCall]);

  const reject = useCallback(() => {
    wsManager.send('call_reject', { chatId });
    hangUp();
  }, [chatId, hangUp]);

  if (phase === 'in_call') {
    return (
      <View style={[styles.webRoot, { paddingTop: insets.top }]}>
        <View style={styles.webBar}>
          <Text style={styles.webTitle} numberOfLines={1}>
            {isGroup
              ? `Grupo · voz · ${clock} · E2E mesh`
              : `${isVideo ? 'Videollamada' : 'Llamada'} · ${contactName} · ${clock} · E2E`}
            {rosterHint ? ` · ${rosterHint}` : ''}
          </Text>
          <Pressable onPress={hangUp} style={styles.hangBtn} hitSlop={8}>
            <Feather name="phone-off" size={18} color="#fff" />
            <Text style={styles.hangText}>{isGroup ? 'Salir' : 'Colgar'}</Text>
          </Pressable>
        </View>

        {webLoading ? (
          <View style={styles.webLoading}>
            <ActivityIndicator color={colors.accent} size="large" />
            <Text style={styles.webLoadingText}>{statusHint}</Text>
          </View>
        ) : null}

        {callUrl ? (
          <WebView
            source={{ uri: callUrl }}
            style={styles.webview}
            onLoadEnd={() => setWebLoading(false)}
            javaScriptEnabled
            domStorageEnabled
            mediaPlaybackRequiresUserAction={false}
            allowsInlineMediaPlayback
            allowsFullscreenVideo
            setSupportMultipleWindows={false}
            // Always grant WebView capture: voice needs mic. Camera stays
            // off via Jitsi/WebRTC startWithVideoMuted + HTML getUserMedia.
            mediaCapturePermissionGrantType="grant"
            mixedContentMode="always"
            originWhitelist={['*']}
            androidLayerType="hardware"
            userAgent={
              Platform.OS === 'android'
                ? 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 Synap/1.0'
                : undefined
            }
            onMessage={(ev) => {
              try {
                const data = JSON.parse(ev.nativeEvent.data) as {
                  type?: string;
                  message?: string;
                  both?: boolean;
                };
                if (data.type === 'hangup') hangUp();
                if (data.type === 'connected' || data.type === 'media-ok') {
                  setWebLoading(false);
                }
                if (data.type === 'ice-config') {
                  setStatusHint(
                    `ICE ${data.policy || 'relay'} · ${data.provider || 'turn'}`,
                  );
                }
                if (data.type === 'ice-pair' && data.remote) {
                  const r = data.remote as { typ?: string; ip?: string };
                  setStatusHint(
                    `Par ICE remoto: ${r.typ || '?'} ${r.ip || '?'}\n(relé = IP del TURN, no del teléfono)`,
                  );
                  setWebLoading(false);
                }
                if (data.type === 'ice-leak') {
                  setStatusHint(
                    `AVISO: candidato local ${String(
                      (data as { typ?: string }).typ,
                    )} — no debería enviarse en modo relay`,
                  );
                }
                if (data.type === 'camera-blocked') {
                  setStatusHint('Llamada de voz · cámara bloqueada');
                }
                if (data.type === 'camera-denied-audio-only') {
                  setStatusHint('Sin cámara · solo audio cifrado');
                }
                if (data.type === 'camera-flip') {
                  const facing = String(
                    (data as { facing?: string }).facing || '',
                  );
                  setStatusHint(
                    facing === 'environment'
                      ? 'Cámara trasera'
                      : 'Cámara frontal',
                  );
                }
                if (data.type === 'cam-muted') {
                  setStatusHint(
                    (data as { muted?: boolean }).muted
                      ? 'Tu video apagado · te siguen oyendo'
                      : 'Tu video encendido',
                  );
                }
                if (data.type === 'video-quality') {
                  const lvl = Number((data as { level?: number }).level);
                  if (lvl >= 4) {
                    setStatusHint('Red lenta · video pausado (audio intacto)');
                  } else if (lvl > 0) {
                    setStatusHint(`Red lenta · calidad video ${lvl}`);
                  }
                }
                if (data.type === 'error' && data.message) {
                  setStatusHint(data.message);
                }
              } catch {
                /* ignore */
              }
            }}
          />
        ) : null}
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.xxl }]}>
      <Text style={styles.kind}>
        {isGroup
          ? 'Llamada de grupo · solo voz'
          : isVideo
            ? 'Videollamada'
            : 'Llamada'}{' '}
        Synap
      </Text>
      <UserAvatar name={contactName} size={96} />
      <Text style={styles.name}>{contactName}</Text>
      <Text style={styles.status}>
        {phase === 'perm' ? 'Preparando…' : statusHint}
      </Text>

      {phase === 'ringing' && incoming ? (
        <View style={styles.row}>
          <Pressable style={[styles.round, styles.reject]} onPress={reject}>
            <Feather name="phone-off" size={28} color="#fff" />
          </Pressable>
          <Pressable style={[styles.round, styles.accept]} onPress={accept}>
            <Feather name="phone" size={28} color="#fff" />
          </Pressable>
        </View>
      ) : (
        <View style={styles.row}>
          <Pressable style={[styles.round, styles.reject]} onPress={hangUp}>
            <Feather name="phone-off" size={28} color="#fff" />
          </Pressable>
        </View>
      )}

      <Text style={styles.hint}>
        {isGroup
          ? 'Audio cifrado en malla (hasta 8). Cada quien entra y sale sin cortar a los demás. El servidor no mezcla ni oye el audio — solo señaliza.'
          : 'Audio cifrado de extremo a extremo (WebRTC). Si el otro no tiene Synap abierto, le llega notificación para contestar.'}
      </Text>
    </View>
  );
}

const styles = themed((colors) => ({
  root: {
    flex: 1,
    backgroundColor: '#0B141A',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
  },
  webRoot: { flex: 1, backgroundColor: '#000' },
  webBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  webTitle: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: fontSize.body,
    fontWeight: fontWeight.semibold,
  },
  hangBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E53935',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
  },
  hangText: {
    color: '#fff',
    fontWeight: fontWeight.bold,
    fontSize: fontSize.caption,
  },
  webLoading: {
    ...StyleSheet.absoluteFillObject,
    top: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0B141A',
    zIndex: 2,
  },
  webLoadingText: {
    color: colors.textSecondary,
    marginTop: spacing.md,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
  webview: { flex: 1, backgroundColor: '#000' },
  kind: {
    color: colors.textSecondary,
    marginBottom: spacing.xxl,
    fontSize: fontSize.body,
  },
  name: {
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: fontWeight.bold,
    marginTop: spacing.xl,
  },
  status: {
    color: colors.accentLight,
    marginTop: spacing.md,
    fontSize: fontSize.bodyLg,
    textAlign: 'center',
    lineHeight: 24,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.xxxl,
    marginTop: spacing.huge,
  },
  round: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accept: { backgroundColor: '#25D366' },
  reject: { backgroundColor: '#E53935' },
  hint: {
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 'auto',
    marginBottom: spacing.xxxl,
    fontSize: fontSize.caption,
    lineHeight: 18,
  },
}));

export default CallScreen;
