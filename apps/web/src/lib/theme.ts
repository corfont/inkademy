/**
 * Sin "use client": layout.tsx (server component) necesita este valor como
 * string plano para el script anti-parpadeo, y ThemeToggle.tsx (client) lo
 * necesita para leer/escribir localStorage. Un export normal desde un
 * archivo "use client" no se resuelve como valor plano al importarlo desde
 * un server component (Next.js lo trata como referencia de módulo cliente).
 */
export const THEME_STORAGE_KEY = "inkademy_theme";
