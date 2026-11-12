/**
 * Synapmsg brand color palette.
 * `themed()` builds StyleSheet proxies that resolve against the active scheme.
 * Default `colors` export is kept in sync for JSX reads during render.
 */

import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { useThemeStore } from '../store/theme';
import { darkColors, type AppColors } from './palettes';

export type { AppColors } from './palettes';
export { darkColors, lightColors } from './palettes';

/** Live palette — Object.assign on theme change for JSX that reads colors.X. */
export const colors: AppColors = { ...darkColors };

useThemeStore.subscribe((s) => {
  Object.assign(colors, s.colors);
});

export function useColors(): AppColors {
  return useThemeStore((s) => s.colors);
}

/**
 * Drop-in for `StyleSheet.create`. Returns a proxy; each access rebuilds
 * styles when the active scheme changes. Pair with remounting the tree
 * (NavigationContainer key={scheme}) or a useColors() subscription.
 *
 *   const styles = themed((colors) => ({
 *     container: { backgroundColor: colors.background },
 *   }));
 */
export function themed<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (c: AppColors) => T,
): T {
  let cacheScheme: string | null = null;
  let cache: T | null = null;
  const ensure = (): T => {
    const { scheme, colors: c } = useThemeStore.getState();
    if (cache && cacheScheme === scheme) return cache;
    cacheScheme = scheme;
    cache = StyleSheet.create(factory(c)) as T;
    return cache;
  };
  return new Proxy({} as T, {
    get(_target, prop, receiver) {
      if (prop === '__proto__') return Reflect.get(_target, prop, receiver);
      const sheet = ensure() as Record<string | symbol, unknown>;
      return sheet[prop as string];
    },
    has(_target, prop) {
      return prop in (ensure() as object);
    },
    ownKeys() {
      return Reflect.ownKeys(ensure() as object);
    },
    getOwnPropertyDescriptor(_target, prop) {
      return Reflect.getOwnPropertyDescriptor(ensure() as object, prop);
    },
  });
}

export function useThemedStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (c: AppColors) => T,
): T {
  const c = useColors();
  return useMemo(() => StyleSheet.create(factory(c)), [c]);
}

export default colors;
