/**
 * Synapmsg brand color palette.
 * Paleta REAL extraída del logo de Toscana Systems (cyan-teal + negro).
 * All UI surfaces must import colors from here — never hard-code hex values
 * inside components or screens.
 *
 * Source: Análisis pixel-por-pixel del logo Toscana Systems (2025-11-10)
 */

export const colors = {
  // Core brand — paleta Toscana Systems
  primary: '#000000',         // Negro fondo principal (logo Toscana)
  accent: '#30B0B0',          // Teal Principal (20% del logo original)
  accentLight: '#40C0C0',     // Cyan Brillante (highlights)
  accentMid: '#2090A0',        // Teal Medio (degradado)
  accentDark: '#107090',      // Teal Oscuro (profundidad)
  background: '#0A0A0A',       // Negro suave (fondos de app)
  surface: '#1A1A1A',          // Gris muy oscuro (tarjetas sobre negro)
  surfaceLight: '#F5F5F5',     // Para modo claro (uso futuro)

  // Text
  textPrimary: '#FFFFFF',      // Blanco sobre negro
  textSecondary: '#A0A0A0',    // Gris claro para texto secundario
  textMuted: '#606060',         // Gris medio para texto deshabilitado
  textInverse: '#000000',      // Negro sobre fondos claros

  // Status
  success: '#3CB371',          // Verde menta (mantiene semántica)
  error: '#E57373',             // Rojo suave (legible sobre negro)
  warning: '#FFB74D',           // Naranja suave (legible sobre negro)

  // Translation badge backgrounds / accents
  badgeBackground: 'rgba(48, 176, 176, 0.15)',  // Teal translúcido
  badgeText: '#40C0C0',                          // Cyan brillante

  // UI helpers
  border: '#2A2A2A',            // Gris oscuro para bordes sutiles
  inputBackground: '#1F1F1F',    // Para campos de texto sobre negro
  overlay: 'rgba(0, 0, 0, 0.7)',  // Overlay modal
  ripple: 'rgba(48, 176, 176, 0.2)', // Ripple effect teal
} as const;

export type ColorName = keyof typeof colors;

export default colors;
