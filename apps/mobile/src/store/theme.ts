/**
 * Apariencia claro/oscuro/sistema — persiste en AsyncStorage.
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance, ColorSchemeName } from 'react-native';
import {
  AppColors,
  darkColors,
  lightColors,
} from '../theme/palettes';

export const THEME_STORAGE_KEY = '@synapmsg/theme_mode_v1';

export type ThemeMode = 'light' | 'dark' | 'system';

export function resolveScheme(
  mode: ThemeMode,
  system: ColorSchemeName | null | undefined,
): 'light' | 'dark' {
  if (mode === 'light' || mode === 'dark') return mode;
  return system === 'light' ? 'light' : 'dark';
}

export function paletteFor(scheme: 'light' | 'dark'): AppColors {
  return scheme === 'light' ? lightColors : darkColors;
}

type ThemeState = {
  hydrated: boolean;
  mode: ThemeMode;
  scheme: 'light' | 'dark';
  colors: AppColors;
  hydrate: () => Promise<void>;
  setMode: (mode: ThemeMode) => Promise<void>;
  syncSystem: (system: ColorSchemeName | null | undefined) => void;
};

function snapshot(
  mode: ThemeMode,
  system: ColorSchemeName | null | undefined,
): Pick<ThemeState, 'mode' | 'scheme' | 'colors'> {
  const scheme = resolveScheme(mode, system);
  return { mode, scheme, colors: paletteFor(scheme) };
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  hydrated: false,
  mode: 'dark',
  scheme: 'dark',
  colors: darkColors,

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(THEME_STORAGE_KEY);
      const mode: ThemeMode =
        raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'dark';
      set({ ...snapshot(mode, Appearance.getColorScheme()), hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },

  setMode: async (mode) => {
    set(snapshot(mode, Appearance.getColorScheme()));
    await AsyncStorage.setItem(THEME_STORAGE_KEY, mode);
  },

  syncSystem: (system) => {
    const { mode } = get();
    if (mode !== 'system') return;
    set(snapshot(mode, system));
  },
}));
