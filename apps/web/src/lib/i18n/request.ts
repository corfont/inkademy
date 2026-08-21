import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { AppLocale, DEFAULT_LOCALE, LOCALE_COOKIE, SUPPORTED_LOCALES } from "./locales";

export { SUPPORTED_LOCALES, DEFAULT_LOCALE, LOCALE_COOKIE };
export type { AppLocale };

function resolveLocale(): AppLocale {
  const fromCookie = cookies().get(LOCALE_COOKIE)?.value;
  if (fromCookie && SUPPORTED_LOCALES.includes(fromCookie as AppLocale)) {
    return fromCookie as AppLocale;
  }
  const acceptLanguage = headers().get("accept-language");
  if (acceptLanguage?.toLowerCase().startsWith("en")) return "en";
  return DEFAULT_LOCALE;
}

// Inkademy no usa prefijos de ruta por idioma (/es, /en); el locale se
// resuelve desde una cookie (elegida en el selector de idioma del header)
// o desde Accept-Language en la primera visita.
export default getRequestConfig(async () => {
  const locale = resolveLocale();
  const messages = (await import(`../../messages/${locale}.json`)).default;
  return { locale, messages };
});
