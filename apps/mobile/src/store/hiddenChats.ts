/**
 * Hidden chats (Zangi-style) — local only. Reveal with app PIN / dedicated unlock.
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAppLockStore } from './appLock';

const KEY = '@synapmsg/hidden_chats_v1';

type HiddenState = {
  hydrated: boolean;
  hiddenChatIds: string[];
  unlocked: boolean;
  hydrate: () => Promise<void>;
  toggleHidden: (chatId: string) => Promise<boolean>;
  isHidden: (chatId: string) => boolean;
  unlockWithPin: (pin: string) => Promise<boolean>;
  lockFolder: () => void;
};

export const useHiddenChatsStore = create<HiddenState>((set, get) => ({
  hydrated: false,
  hiddenChatIds: [],
  unlocked: false,

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      const ids = raw ? (JSON.parse(raw) as string[]) : [];
      set({ hiddenChatIds: ids, hydrated: true, unlocked: false });
    } catch {
      set({ hydrated: true, hiddenChatIds: [], unlocked: false });
    }
  },

  toggleHidden: async (chatId) => {
    const cur = get().hiddenChatIds;
    const next = cur.includes(chatId)
      ? cur.filter((id) => id !== chatId)
      : [...cur, chatId];
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
    set({ hiddenChatIds: next });
    return next.includes(chatId);
  },

  isHidden: (chatId) => get().hiddenChatIds.includes(chatId),

  unlockWithPin: async (pin) => {
    const ok = await useAppLockStore.getState().verifyNormalPin(pin);
    if (ok) {
      set({ unlocked: true });
      return true;
    }
    return false;
  },

  lockFolder: () => set({ unlocked: false }),
}));
