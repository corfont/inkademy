import type { Config } from "tailwindcss";

// ---------------------------------------------------------------------------
// Paleta Inkademy — "prestigio académico editorial"
// Un color de marca (tinta), un neutro cálido, un acento (CTA/precio) y estados.
// Todos los tonos viven como variables CSS en globals.css para soportar
// claro/oscuro sin duplicar la escala aquí.
// ---------------------------------------------------------------------------

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "1.25rem",
      screens: { "2xl": "1280px" },
    },
    extend: {
      colors: {
        ink: {
          50: "hsl(var(--ink-50) / <alpha-value>)",
          100: "hsl(var(--ink-100) / <alpha-value>)",
          200: "hsl(var(--ink-200) / <alpha-value>)",
          300: "hsl(var(--ink-300) / <alpha-value>)",
          400: "hsl(var(--ink-400) / <alpha-value>)",
          500: "hsl(var(--ink-500) / <alpha-value>)",
          600: "hsl(var(--ink-600) / <alpha-value>)",
          700: "hsl(var(--ink-700) / <alpha-value>)",
          800: "hsl(var(--ink-800) / <alpha-value>)",
          900: "hsl(var(--ink-900) / <alpha-value>)",
          950: "hsl(var(--ink-950) / <alpha-value>)",
        },
        paper: {
          DEFAULT: "hsl(var(--paper) / <alpha-value>)",
          muted: "hsl(var(--paper-muted) / <alpha-value>)",
          border: "hsl(var(--paper-border) / <alpha-value>)",
        },
        ash: {
          50: "hsl(var(--ash-50) / <alpha-value>)",
          100: "hsl(var(--ash-100) / <alpha-value>)",
          200: "hsl(var(--ash-200) / <alpha-value>)",
          300: "hsl(var(--ash-300) / <alpha-value>)",
          400: "hsl(var(--ash-400) / <alpha-value>)",
          500: "hsl(var(--ash-500) / <alpha-value>)",
          600: "hsl(var(--ash-600) / <alpha-value>)",
          700: "hsl(var(--ash-700) / <alpha-value>)",
          800: "hsl(var(--ash-800) / <alpha-value>)",
          900: "hsl(var(--ash-900) / <alpha-value>)",
        },
        gold: {
          50: "hsl(var(--gold-50) / <alpha-value>)",
          100: "hsl(var(--gold-100) / <alpha-value>)",
          200: "hsl(var(--gold-200) / <alpha-value>)",
          300: "hsl(var(--gold-300) / <alpha-value>)",
          400: "hsl(var(--gold-400) / <alpha-value>)",
          500: "hsl(var(--gold-500) / <alpha-value>)",
          600: "hsl(var(--gold-600) / <alpha-value>)",
          700: "hsl(var(--gold-700) / <alpha-value>)",
        },
        success: {
          DEFAULT: "hsl(var(--success) / <alpha-value>)",
          bg: "hsl(var(--success-bg) / <alpha-value>)",
        },
        warning: {
          DEFAULT: "hsl(var(--warning) / <alpha-value>)",
          bg: "hsl(var(--warning-bg) / <alpha-value>)",
        },
        danger: {
          DEFAULT: "hsl(var(--danger) / <alpha-value>)",
          bg: "hsl(var(--danger-bg) / <alpha-value>)",
        },
      },
      fontFamily: {
        serif: ["var(--font-fraunces)", "Georgia", "serif"],
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        sm: "0.375rem",
        md: "0.5rem",
        lg: "0.75rem",
        xl: "1rem",
      },
      boxShadow: {
        card: "0 1px 2px 0 hsl(var(--ink-950) / 0.04), 0 1px 8px -2px hsl(var(--ink-950) / 0.06)",
        raised: "0 8px 24px -8px hsl(var(--ink-950) / 0.16)",
      },
      maxWidth: {
        prose: "42rem",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "slide-up": { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "translateY(0)" } },
      },
      animation: {
        "fade-in": "fade-in 0.25s ease-out",
        "slide-up": "slide-up 0.3s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
