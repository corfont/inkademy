// Constantes de locale seguras para importar tanto desde Server como desde
// Client Components (a diferencia de request.ts, que usa next/headers y solo
// puede importarse desde código de servidor).
export const SUPPORTED_LOCALES = ["es", "en"] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: AppLocale = "es";
export const LOCALE_COOKIE = "inkademy_locale";
