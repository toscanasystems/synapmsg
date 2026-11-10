/**
 * Synapmsg spacing & layout constants.
 *
 * The scale is a 4px grid: every measurement should be a multiple of 4
 * (or 2 for fine adjustments like borders).
 */

export const spacing = {
  /** 2px — hairlines, tight icon gaps */
  xs: 2,
  /** 4px — inline padding, small gaps */
  sm: 4,
  /** 8px — default inner padding */
  md: 8,
  /** 12px — list item spacing */
  lg: 12,
  /** 16px — card padding, section gaps */
  xl: 16,
  /** 24px — screen edge padding */
  xxl: 24,
  /** 32px — between sections */
  xxxl: 32,
  /** 48px — hero spacing */
  huge: 48,
} as const;

export const radius = {
  none: 0,
  sm: 6,
  md: 10,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

export const fontSize = {
  caption: 12,
  body: 14,
  bodyLg: 16,
  title: 18,
  h3: 20,
  h2: 24,
  h1: 32,
  hero: 42,
} as const;

export const fontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};

/** Used by UserAvatar to deterministically pick a tint per user. */
export const avatarPalette = [
  '#3CB4A0', // mint
  '#1A2330', // dark teal
  '#D4820A', // warning amber
  '#1B7D46', // success green
  '#687078', // slate
] as const;

export default spacing;
