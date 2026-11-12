/**
 * Carpetas inteligentes mínimas — heurística local por keywords (Fase 4).
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Chat } from '../types';

const KEY = '@synapmsg/smart_folders';

export type SmartFolderId = 'urgente' | 'trabajo' | 'personal' | 'otros';

type State = {
  enabled: boolean;
  hydrate: () => Promise<void>;
  setEnabled: (v: boolean) => Promise<void>;
  classify: (chat: Chat) => SmartFolderId;
  group: (chats: Chat[]) => Record<SmartFolderId, Chat[]>;
};

const URGENT =
  /\b(urgente|asap|hoy|emergency|911|ayuda|sos|inmediato|ya mismo|crítico|critico)\b/i;
const WORK =
  /\b(factura|reunión|reunion|proyecto|cliente|invoice|meeting|payroll|nómina|nomina|contrato|deadline|entrega|oficina|jefe)\b/i;
const PERSONAL =
  /\b(familia|mamá|mama|papá|papa|amor|novia|novio|cumple|fiesta|casa|cena)\b/i;

export const useSmartFoldersStore = create<State>((set, get) => ({
  enabled: false,

  hydrate: async () => {
    const v = await AsyncStorage.getItem(KEY);
    set({ enabled: v === '1' });
  },

  setEnabled: async (v) => {
    await AsyncStorage.setItem(KEY, v ? '1' : '0');
    set({ enabled: v });
  },

  classify: (chat) => {
    const text = `${chat.name || ''} ${chat.lastMessage?.text || ''}`;
    if (URGENT.test(text)) return 'urgente';
    if (WORK.test(text)) return 'trabajo';
    if (PERSONAL.test(text)) return 'personal';
    if (chat.type === 'group') return 'otros';
    return 'personal';
  },

  group: (chats) => {
    const out: Record<SmartFolderId, Chat[]> = {
      urgente: [],
      trabajo: [],
      personal: [],
      otros: [],
    };
    for (const c of chats) {
      out[get().classify(c)].push(c);
    }
    return out;
  },
}));
