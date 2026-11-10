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
export type LanguageCode =
  | 'es'
  | 'en'
  | 'pt'
  | 'fr'
  | 'it'
  | 'de'
  | 'zh'
  | 'ja'
  | 'ko'
  | 'ar'
  | 'ru'
  | 'hi';

export interface LanguageOption {
  code: LanguageCode;
  label: string;
  flag: string; // emoji flag, used in chat headers
}

/**
 * Dropdown options for the onboarding/settings screens.
 * Order matches the product spec.
 */
export const LANGUAGES: LanguageOption[] = [
  { code: 'es', label: 'Spanish', flag: '🇪🇸' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'pt', label: 'Portuguese', flag: '🇵🇹' },
  { code: 'fr', label: 'French', flag: '🇫🇷' },
  { code: 'it', label: 'Italian', flag: '🇮🇹' },
  { code: 'de', label: 'German', flag: '🇩🇪' },
  { code: 'zh', label: 'Chinese (Mandarin)', flag: '🇨🇳' },
  { code: 'ja', label: 'Japanese', flag: '🇯🇵' },
  { code: 'ko', label: 'Korean', flag: '🇰🇷' },
  { code: 'ar', label: 'Arabic', flag: '🇸🇦' },
];

/** Human-friendly lookup helper: "es" -> "Spanish". */
export function languageLabel(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.label ?? code.toUpperCase();
}

/** Emoji flag lookup: "es" -> "🇪🇸". */
export function languageFlag(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.flag ?? '🌐';
}

export type TranslateMode = 'cloud' | 'on-device';

// ───────────────────────────────────────────────────────────
// User
// ───────────────────────────────────────────────────────────
export interface User {
  id: string;
  email: string;
  username: string;
  name: string;
  preferredLanguage: string;
  preferredTranslateMode: TranslateMode;
  createdAt: string; // ISO timestamp
  updatedAt: string;
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
  user: User;
}

export interface ChatPreviewMessage {
  id: string;
  text: string;
  senderId: string;
  createdAt: string;
}

export interface Chat {
  id: string;
  type: ChatType;
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
  createdAt: string; // ISO timestamp
}

// ───────────────────────────────────────────────────────────
// API request / response payloads
// ───────────────────────────────────────────────────────────
export interface LoginRequest {
  email: string;
  password: string;
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
  text: string;
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
}

// ───────────────────────────────────────────────────────────
// WebSocket payloads
// ───────────────────────────────────────────────────────────
export type WsConnectionState = 'connecting' | 'connected' | 'disconnected';

/** Outbound frame sent from client → server. */
export type WsClientMessage =
  | { type: 'message'; chatId: string; text: string }
  | { type: 'ping' };

/** Inbound frame envelope sent from server → client. */
export type WsServerMessage =
  | { type: 'connected'; userId: string }
  | { type: 'message'; chatId: string; message: Message }
  | { type: 'pong' }
  | { type: 'error'; message?: string; status?: number; chatId?: string };

// ───────────────────────────────────────────────────────────
// Navigation
// ───────────────────────────────────────────────────────────
export type RootStackParamList = {
  Onboarding: undefined;
  Login: undefined;
  Register: undefined;
  ChatList: undefined;
  Chat: { chatId: string; contactName?: string; contactLanguage?: string };
  NewChat: undefined;
  Settings: undefined;
};

// ───────────────────────────────────────────────────────────
// Persistence keys (AsyncStorage)
// ───────────────────────────────────────────────────────────
export const STORAGE_KEYS = {
  TOKEN: '@synapmsg/token',
  USER: '@synapmsg/user',
  ONBOARDED: '@synapmsg/onboarded',
} as const;
