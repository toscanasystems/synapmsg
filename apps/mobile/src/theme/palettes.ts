/**
 * Dark + light palettes — teal accent `#30B0B0` in both.
 * Screens should read colors via useColors() so theme switches re-render.
 */

export type AppColors = {
  primary: string;
  accent: string;
  accentLight: string;
  accentMid: string;
  accentDark: string;
  background: string;
  surface: string;
  surfaceLight: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;
  chatNeon: string;
  chatNeonDim: string;
  chatBubbleMine: string;
  chatBubbleTheirs: string;
  chatBubbleBorder: string;
  success: string;
  error: string;
  warning: string;
  badgeBackground: string;
  badgeText: string;
  border: string;
  inputBackground: string;
  overlay: string;
  ripple: string;
};

export const darkColors: AppColors = {
  primary: '#000000',
  accent: '#30B0B0',
  accentLight: '#40C0C0',
  accentMid: '#2090A0',
  accentDark: '#107090',
  background: '#0A0A0A',
  surface: '#1A1A1A',
  surfaceLight: '#F5F5F5',
  textPrimary: '#FFFFFF',
  textSecondary: '#A0A0A0',
  textMuted: '#606060',
  textInverse: '#000000',
  chatNeon: '#39FF14',
  chatNeonDim: 'rgba(57, 255, 20, 0.55)',
  chatBubbleMine: 'rgba(57, 255, 20, 0.08)',
  chatBubbleTheirs: 'rgba(26, 26, 26, 0.92)',
  chatBubbleBorder: 'rgba(57, 255, 20, 0.28)',
  success: '#3CB371',
  error: '#E57373',
  warning: '#FFB74D',
  badgeBackground: 'rgba(48, 176, 176, 0.15)',
  badgeText: '#40C0C0',
  border: '#2A2A2A',
  inputBackground: '#1F1F1F',
  overlay: 'rgba(0, 0, 0, 0.7)',
  ripple: 'rgba(48, 176, 176, 0.2)',
};

export const lightColors: AppColors = {
  primary: '#FFFFFF',
  accent: '#30B0B0',
  accentLight: '#2090A0',
  accentMid: '#30B0B0',
  accentDark: '#107090',
  // Pure white app chrome; dark text for contrast (Play / accessibility).
  background: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceLight: '#F2F4F4',
  textPrimary: '#111111',
  textSecondary: '#444444',
  textMuted: '#6B6B6B',
  textInverse: '#FFFFFF',
  chatNeon: '#0A6B0A',
  chatNeonDim: 'rgba(10, 107, 10, 0.7)',
  chatBubbleMine: 'rgba(48, 176, 176, 0.16)',
  chatBubbleTheirs: '#F3F5F5',
  chatBubbleBorder: 'rgba(48, 176, 176, 0.4)',
  success: '#2E8B57',
  error: '#C62828',
  warning: '#EF6C00',
  badgeBackground: 'rgba(48, 176, 176, 0.14)',
  badgeText: '#0D6B7A',
  border: '#D0D6D6',
  inputBackground: '#F0F3F3',
  overlay: 'rgba(0, 0, 0, 0.4)',
  ripple: 'rgba(48, 176, 176, 0.2)',
};
