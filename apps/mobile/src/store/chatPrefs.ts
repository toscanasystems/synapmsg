/**
 * Preferencias locales por chat: listas, wallpaper, mute, block, temporales.
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@synapmsg/chat_prefs_v1';

/** Bilateral autodestruct windows (seconds). Legacy hours mapped on hydrate. */
export type DisappearHours = 0 | 30 | 3600 | 86400 | 604800 | 1 | 6 | 12 | 24;

export type DisappearTypes = {
  text: boolean;
  image: boolean;
  audio: boolean;
};

export type ChatList = {
  id: string;
  name: string;
  chatIds: string[];
};

type PrefsState = {
  hydrated: boolean;
  lists: ChatList[];
  wallpaperByChat: Record<string, string>;
  mutedChatIds: string[];
  archivedChatIds: string[];
  blockedUserIds: string[];
  disappearByChat: Record<string, DisappearHours>;
  disappearTypesByChat: Record<string, DisappearTypes>;
  hydrate: () => Promise<void>;
  persist: () => Promise<void>;
  addList: (name: string) => void;
  addChatToList: (listId: string, chatId: string) => void;
  setWallpaper: (chatId: string, uri: string | null) => void;
  toggleMute: (chatId: string) => boolean;
  toggleArchive: (chatId: string) => boolean;
  blockUser: (userId: string) => void;
  unblockUser: (userId: string) => void;
  isBlocked: (userId: string) => boolean;
  setDisappear: (
    chatId: string,
    hours: DisappearHours,
    types?: Partial<DisappearTypes>,
  ) => void;
};

const DEFAULT_TYPES: DisappearTypes = {
  text: true,
  image: true,
  audio: true,
};

function normalizeHours(raw: unknown): DisappearHours {
  const n = Number(raw);
  if (([30, 3600, 86400, 604800] as const).includes(n as 30)) {
    return n as DisappearHours;
  }
  // Legacy hour presets → seconds
  if (n === 1) return 3600;
  if (n === 6) return 21600;
  if (n === 12) return 43200;
  if (n === 24) return 86400;
  return 0;
}

async function save(
  partial: Omit<
    PrefsState,
    | 'hydrated'
    | 'hydrate'
    | 'persist'
    | 'addList'
    | 'addChatToList'
    | 'setWallpaper'
    | 'toggleMute'
    | 'toggleArchive'
    | 'blockUser'
    | 'unblockUser'
    | 'isBlocked'
    | 'setDisappear'
  >,
) {
  const payload = {
    lists: partial.lists,
    wallpaperByChat: partial.wallpaperByChat,
    mutedChatIds: partial.mutedChatIds,
    archivedChatIds: partial.archivedChatIds,
    blockedUserIds: partial.blockedUserIds,
    disappearByChat: partial.disappearByChat,
    disappearTypesByChat: partial.disappearTypesByChat,
  };
  await AsyncStorage.setItem(KEY, JSON.stringify(payload));
}

export const useChatPrefsStore = create<PrefsState>((set, get) => ({
  hydrated: false,
  lists: [],
  wallpaperByChat: {},
  mutedChatIds: [],
  archivedChatIds: [],
  blockedUserIds: [],
  disappearByChat: {},
  disappearTypesByChat: {},

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PrefsState>;
        const hoursIn = parsed.disappearByChat ?? {};
        const hoursOut: Record<string, DisappearHours> = {};
        for (const [k, v] of Object.entries(hoursIn)) {
          hoursOut[k] = normalizeHours(v);
        }
        set({
          lists: parsed.lists ?? [],
          wallpaperByChat: parsed.wallpaperByChat ?? {},
          mutedChatIds: parsed.mutedChatIds ?? [],
          archivedChatIds: parsed.archivedChatIds ?? [],
          blockedUserIds: parsed.blockedUserIds ?? [],
          disappearByChat: hoursOut,
          disappearTypesByChat: parsed.disappearTypesByChat ?? {},
          hydrated: true,
        });
        return;
      }
    } catch {
      /* ignore */
    }
    set({ hydrated: true });
  },

  persist: async () => {
    const s = get();
    await save(s);
  },

  addList: (name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    set((s) => ({
      lists: [
        ...s.lists,
        { id: `list_${Date.now()}`, name: trimmed, chatIds: [] },
      ],
    }));
    void get().persist();
  },

  addChatToList: (listId, chatId) => {
    set((s) => ({
      lists: s.lists.map((l) =>
        l.id === listId && !l.chatIds.includes(chatId)
          ? { ...l, chatIds: [...l.chatIds, chatId] }
          : l,
      ),
    }));
    void get().persist();
  },

  setWallpaper: (chatId, uri) => {
    set((s) => {
      const next = { ...s.wallpaperByChat };
      if (!uri) delete next[chatId];
      else next[chatId] = uri;
      return { wallpaperByChat: next };
    });
    void get().persist();
  },

  toggleMute: (chatId) => {
    let muted = false;
    set((s) => {
      const has = s.mutedChatIds.includes(chatId);
      muted = !has;
      return {
        mutedChatIds: has
          ? s.mutedChatIds.filter((id) => id !== chatId)
          : [...s.mutedChatIds, chatId],
      };
    });
    void get().persist();
    return muted;
  },

  toggleArchive: (chatId) => {
    let archived = false;
    set((s) => {
      const has = s.archivedChatIds.includes(chatId);
      archived = !has;
      return {
        archivedChatIds: has
          ? s.archivedChatIds.filter((id) => id !== chatId)
          : [...s.archivedChatIds, chatId],
      };
    });
    void get().persist();
    return archived;
  },

  blockUser: (userId) => {
    set((s) => ({
      blockedUserIds: s.blockedUserIds.includes(userId)
        ? s.blockedUserIds
        : [...s.blockedUserIds, userId],
    }));
    void get().persist();
  },

  unblockUser: (userId) => {
    set((s) => ({
      blockedUserIds: s.blockedUserIds.filter((id) => id !== userId),
    }));
    void get().persist();
  },

  isBlocked: (userId) => get().blockedUserIds.includes(userId),

  setDisappear: (chatId, hours, types) => {
    set((s) => {
      const nextTypes = {
        ...(s.disappearTypesByChat[chatId] ?? DEFAULT_TYPES),
        ...types,
      };
      return {
        disappearByChat: { ...s.disappearByChat, [chatId]: hours },
        disappearTypesByChat: {
          ...s.disappearTypesByChat,
          [chatId]: nextTypes,
        },
      };
    });
    void get().persist();
  },
}));
