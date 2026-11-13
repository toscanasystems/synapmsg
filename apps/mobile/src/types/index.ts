/**
 * Synapmsg — shared TypeScript types & interfaces.
 *
 * These mirror the JSON payloads returned by the backend (see
 * apps/api/src/{auth,chats,messages,users}/routes.ts) so that the API client
 * can be fully typed end-to-end.
 */

// ───────────────────────────────────────────────────────────
// Languages
// ───────────────────────────────────────────────────────────
export type LanguageCode = string;

export interface LanguageOption {
  code: LanguageCode;
  label: string;
  flag: string; // emoji flag, used in chat headers
}

/**
 * Cloud translation languages (chat Nube) — same 12 as product copy.
 * On-device translation for Private chats is not ready yet.
 */
export const LANGUAGES: LanguageOption[] = [
  { code: 'es', label: 'Español', flag: '🇲🇽' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'pt', label: 'Português', flag: '🇧🇷' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'it', label: 'Italiano', flag: '🇮🇹' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'zh', label: '中文', flag: '🇨🇳' },
  { code: 'ja', label: '日本語', flag: '🇯🇵' },
  { code: 'ko', label: '한국어', flag: '🇰🇷' },
  { code: 'ar', label: 'العربية', flag: '🇸🇦' },
  { code: 'ru', label: 'Русский', flag: '🇷🇺' },
  { code: 'hi', label: 'हिन्दी', flag: '🇮🇳' },
];

/** Human-friendly lookup helper: "es" -> "Español". */
export function languageLabel(code: string): string {
  const c = code.toLowerCase();
  return LANGUAGES.find((l) => l.code === c)?.label ?? code.toUpperCase();
}

/** Emoji flag lookup: "es" -> "🇲🇽". */
export function languageFlag(code: string): string {
  const c = code.toLowerCase();
  return LANGUAGES.find((l) => l.code === c)?.flag ?? '🌐';
}

export type TranslateMode = 'cloud' | 'on-device';

// ───────────────────────────────────────────────────────────
// User
// ───────────────────────────────────────────────────────────
export type PlanId = 'free' | 'premium';

export interface User {
  id: string;
  /** Optional — anonymous bootstrap accounts have null until recovery email is added. */
  email: string | null;
  username: string;
  name: string;
  /** 10-digit Synapmsg Private Number (not a SIM / not a key). */
  privateNumber?: string | null;
  privateNumberFormatted?: string | null;
  /** If false, search by number returns nothing (no public directory). */
  privateNumberShared?: boolean;
  preferredLanguage: string;
  preferredTranslateMode: TranslateMode;
  plan?: PlanId;
  planExpiresAt?: string | null;
  mediaBytesUsed?: number;
  translationsToday?: number;
  lastSeenAt?: string | null;
  online?: boolean;
  createdAt: string; // ISO timestamp
  updatedAt: string;
}

export interface BillingPlanInfo {
  plan: PlanId;
  label: string;
  planExpiresAt: string | null;
  media: {
    usedBytes: number;
    limitBytes: number;
    maxFileBytes: number;
  };
  translations: {
    usedToday: number;
    limitPerDay: number;
    dayKey: string;
  };
  glossaryMax: number;
  ads: boolean;
  stripeEnabled?: boolean;
  recurrenteEnabled?: boolean;
  paymentsEnabled?: boolean;
  provider?: 'recurrente' | 'stripe' | null;
}

export interface BillingConfig {
  stripeEnabled: boolean;
  recurrenteEnabled?: boolean;
  paymentsEnabled?: boolean;
  provider?: 'recurrente' | 'stripe' | null;
  premiumPriceCents: number;
  premiumCurrency: string;
  playBillingEnabled: boolean;
  playProductId: string | null;
}

// ───────────────────────────────────────────────────────────
// Chat
// ───────────────────────────────────────────────────────────
export type ChatType = 'single' | 'group';
export type ParticipantRole = 'admin' | 'member';

export interface ChatParticipant {
  id: string;
  userId: string;
  role: ParticipantRole;
  joinedAt: string;
  lastReadAt?: string | null;
  user: User;
}

export interface ChatPreviewMessage {
  id: string;
  text: string;
  senderId: string;
  createdAt: string;
}

export type ChatEncryptionMode = 'cloud' | 'e2e';

export interface Chat {
  id: string;
  type: ChatType;
  name?: string | null;
  encryptionMode?: ChatEncryptionMode;
  disappearHours?: number;
  /** 0 | 30 | 3600 | 86400 | 604800 */
  disappearSeconds?: number;
  disappearText?: boolean;
  disappearImage?: boolean;
  disappearAudio?: boolean;
  createdAt: string;
  updatedAt: string;
  participants: ChatParticipant[];
  lastMessage?: ChatPreviewMessage | null;
}

// ───────────────────────────────────────────────────────────
// Message
// ───────────────────────────────────────────────────────────
export interface MessageSender {
  id: string;
  username: string;
  name: string;
}

export type ReactionSummary = {
  emoji: string;
  count: number;
  me: boolean;
  userIds?: string[];
};

export type ReplyPreview = {
  id: string;
  senderName: string;
  text: string;
};

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  sender: MessageSender;
  originalText: string;
  originalLanguage: string;
  translatedText: string;
  translatedLanguage: string | null;
  isTranslated: boolean;
  mediaUrl?: string | null;
  mediaType?: string | null;
  ciphertext?: string | null;
  ciphertextType?: number | null;
  isE2e?: boolean;
  editedAt?: string | null;
  deletedAt?: string | null;
  expiresAt?: string | null;
  viewOnce?: boolean;
  viewOnceOpenedAt?: string | null;
  replyTo?: ReplyPreview | null;
  reactions?: ReactionSummary[];
  createdAt: string; // ISO timestamp
}

// ───────────────────────────────────────────────────────────
// API request / response payloads
// ───────────────────────────────────────────────────────────
export interface LoginRequest {
  email: string;
  password: string;
  /** Sent so FIDO2 is only required on unknown installations. */
  deviceInstallId?: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  username: string;
  preferredLanguage: LanguageCode;
}

export interface AuthResponse {
  token: string;
  user: User;
  warning?: string;
}

export interface MeResponse {
  user: User;
}

export interface ChatsListResponse {
  chats: Chat[];
}

export interface CreateChatRequest {
  participantId: string;
}

export interface CreateChatResponse {
  chat: Chat;
}

export interface ChatDetailResponse {
  chat: Chat;
  participants: ChatParticipant[];
}

export interface MessagesListResponse {
  messages: Message[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface SendMessageRequest {
  text?: string;
  mediaUrl?: string;
  mediaType?: string;
  replyToId?: string;
  ciphertext?: string;
  ciphertextType?: number;
  viewOnce?: boolean;
  /** Group Private: one libsignal envelope per other member. */
  recipientEnvelopes?: Array<{
    recipientUserId: string;
    ciphertext: string;
    ciphertextType?: number;
  }>;
}

export interface SendMessageResponse {
  message: Message;
}

export interface SearchUsersResponse {
  users: User[];
}

export interface UpdateUserRequest {
  name?: string;
  preferredLanguage?: LanguageCode;
  preferredTranslateMode?: TranslateMode;
  pushToken?: string;
  email?: string;
  privateNumberShared?: boolean;
}

// ───────────────────────────────────────────────────────────
// WebSocket payloads
// ───────────────────────────────────────────────────────────
export type WsConnectionState = 'connecting' | 'connected' | 'disconnected';

/** Outbound frame sent from client → server. */
export type WsClientMessage =
  | {
      type: 'message';
      chatId: string;
      text: string;
      mediaUrl?: string;
      mediaType?: string;
      replyToId?: string;
      viewOnce?: boolean;
    }
  | { type: 'typing' | 'typing_stop'; chatId: string }
  | {
      type: 'call_invite';
      chatId: string;
      callType?: 'voice' | 'video';
      fromName?: string;
      callRoom?: string;
      isGroup?: boolean;
    }
  | {
      type: 'call_accept';
      chatId: string;
      callType?: 'voice' | 'video';
      callRoom?: string;
      isGroup?: boolean;
    }
  | {
      type: 'call_room';
      chatId: string;
      callRoom: string;
      callType?: 'voice' | 'video';
      isGroup?: boolean;
    }
  | {
      type: 'call_ringing';
      chatId: string;
      callRoom?: string;
      callType?: 'voice' | 'video';
      peerOnline?: boolean;
      isGroup?: boolean;
    }
  | { type: 'call_reject'; chatId: string; isGroup?: boolean }
  | { type: 'call_end'; chatId: string; isGroup?: boolean }
  | { type: 'call_leave'; chatId: string; isGroup?: boolean }
  | { type: 'call_mute'; chatId: string; muted: boolean; isGroup?: boolean }
  | {
      type: 'call_peer_status';
      chatId: string;
      status: 'joining' | 'connected' | 'disconnected';
      isGroup?: boolean;
    }
  | {
      type: 'webrtc_signal';
      chatId: string;
      signal: unknown;
      toUserId?: string;
    }
  | { type: 'ping' };

/** Inbound frame envelope sent from server → client. */
export type WsServerMessage =
  | { type: 'connected'; userId: string }
  | { type: 'message'; chatId: string; message: Message }
  | { type: 'message_edited'; chatId: string; message: Message }
  | { type: 'message_deleted'; chatId: string; message: Message }
  | {
      type: 'reaction_updated';
      chatId: string;
      messageId: string;
      reactions: ReactionSummary[];
    }
  | {
      type: 'typing' | 'typing_stop';
      chatId: string;
      fromUserId?: string;
    }
  | {
      type: 'messages_read';
      chatId: string;
      userId: string;
      readAt: string;
    }
  | {
      type: 'presence';
      userId: string;
      online: boolean;
      lastSeenAt?: string;
    }
  | {
      type: 'call_invite' | 'call_accept' | 'call_reject' | 'call_end' | 'call_leave';
      chatId: string;
      fromUserId?: string;
      fromName?: string;
      callType?: 'voice' | 'video';
      callRoom?: string;
      isGroup?: boolean;
    }
  | {
      type: 'call_room';
      chatId: string;
      callRoom: string;
      callType?: 'voice' | 'video';
      isGroup?: boolean;
    }
  | {
      type: 'call_ringing';
      chatId: string;
      callRoom?: string;
      callType?: 'voice' | 'video';
      peerOnline?: boolean;
      isGroup?: boolean;
    }
  | {
      type: 'call_roster';
      chatId: string;
      callRoom?: string;
      callType?: 'voice';
      isGroup?: boolean;
      members: Array<{
        userId: string;
        name: string;
        muted: boolean;
        status: string;
        joinedAt?: number;
      }>;
    }
  | {
      type: 'call_mute';
      chatId: string;
      fromUserId?: string;
      muted?: boolean;
      callRoom?: string;
      isGroup?: boolean;
    }
  | {
      type: 'webrtc_signal';
      chatId: string;
      fromUserId?: string;
      toUserId?: string;
      signal: unknown;
    }
  | { type: 'pong' }
  | {
      type: 'remote_wipe';
      userId?: string;
      nonce?: string;
      reason?: string;
      issuedAt?: string;
      issuerDeviceId?: string | null;
      sig?: string;
      alg?: string;
      pubKey?: string;
    }
  | {
      type: 'dms_triggered';
      action?: string;
      message?: string;
      ciphertext?: string;
    }
  | { type: 'error'; message?: string; status?: number; chatId?: string };

// ───────────────────────────────────────────────────────────
// Navigation
// ───────────────────────────────────────────────────────────
export type RootStackParamList = {
  Bootstrap: undefined;
  Onboarding: undefined;
  Login: undefined;
  Register: undefined;
  ChatList: undefined;
  Chat: { chatId: string; contactName?: string; contactLanguage?: string };
  NewChat: undefined;
  NewGroup: undefined;
  Contacts: undefined;
  Tools: undefined;
  Settings: undefined;
  Call: {
    chatId: string;
    contactName: string;
    callType: 'voice' | 'video';
    incoming?: boolean;
    callRoom?: string;
    isGroup?: boolean;
  };
};

// ───────────────────────────────────────────────────────────
// Persistence keys (AsyncStorage)
// ───────────────────────────────────────────────────────────
export const STORAGE_KEYS = {
  TOKEN: '@synapmsg/token',
  USER: '@synapmsg/user',
  ONBOARDED: '@synapmsg/onboarded',
} as const;
