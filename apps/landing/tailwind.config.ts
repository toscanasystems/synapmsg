import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Paleta REAL de Toscana Systems (extraída del logo)
        primary: "#000000",           // Negro fondo principal
        "primary-soft": "#0A0A0A",    // Negro suave
        accent: "#30B0B0",            // Teal Principal (20% del logo Toscana)
        "accent-light": "#40C0C0",     // Cyan Brillante (highlights)
        "accent-mid": "#2090A0",       // Teal Medio (degradado)
        "accent-dark": "#107090",      // Teal Oscuro (profundidad)
        surface: "#1A1A1A",            // Gris muy oscuro (tarjetas)
        success: "#3CB371",            // Verde menta
        error: "#E57373",              // Rojo suave
        warning: "#FFB74D",            // Naranja suave
        "text-primary": "#FFFFFF",     // Blanco sobre negro
        "text-secondary": "#A0A0A0",   // Gris claro
        "text-muted": "#606060",       // Gris medio
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        serif: ["Playfair Display", "Georgia", "serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      animation: {
        "fade-in": "fadeIn 0.6s ease-out",
        "slide-up": "slideUp 0.5s ease-out",
        "pulse-slow": "pulse 3s ease-in-out infinite",
        "glow": "glow 2s ease-in-out infinite alternate",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        glow: {
          "0%": { boxShadow: "0 0 20px rgba(48, 176, 176, 0.3)" },
          "100%": { boxShadow: "0 0 40px rgba(48, 176, 176, 0.6)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
