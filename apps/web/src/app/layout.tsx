import type { Metadata } from "next";
import Script from "next/script";
import { Outfit, Work_Sans } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { BrandSettingsProvider } from "@/components/providers/BrandSettingsProvider";
import { HelpButton } from "@/components/layout/HelpButton";
import { ChatWidget } from "@/components/layout/ChatWidget";
import { WatermarkOverlay } from "@/components/layout/WatermarkOverlay";
import { THEME_STORAGE_KEY } from "@/lib/theme";
import { settingsApi, type PlatformSettingsDTO } from "@/lib/api-client";
import { isCuratedFont, googleFontHref, type BrandFont } from "@/lib/brand-fonts";
import "./globals.css";

// Tipografía real del manual de marca Inkapitales: Outfit para
// titulares/logotipo, Work Sans para cuerpo de texto (ver docs del manual).
// La variable sigue llamándose "--font-fraunces"/"--font-inter" y la utilidad
// de Tailwind sigue llamándose "font-serif" por compatibilidad con el resto
// del código (que ya usa esas clases en decenas de componentes) — solo
// cambia la tipografía real detrás de cada una.
const outfit = Outfit({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-fraunces",
  display: "swap",
});

const workSans = Work_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Inkademy — Capacitación profesional para personas y empresas",
    template: "%s · Inkademy",
  },
  description:
    "Cursos, talleres, diplomados y programas corporativos con certificación, en vivo y grabados, para profesionales y empresas en Perú y LatAm.",
};

const DEFAULT_SETTINGS: PlatformSettingsDTO = {
  id: "default",
  logoUrl: null,
  logoHeightPx: 64,
  headingFontFamily: "Outfit",
  bodyFontFamily: "Work Sans",
  backgroundColor: null,
  backgroundImageUrl: null,
  contactEmail: "hola@inkademy.com",
  contactPhone: "+51 1 234 5678",
  contactAddress: "Lima, Perú",
  courseCardFields: { showTeacher: true, showDuration: true, showNextLiveSession: true, showCertificationBadge: true },
};

// Script inline (no next/script: debe correr antes del primer paint, sin
// esperar a que se hidrate React) que aplica el tema guardado en
// localStorage por ThemeToggle.tsx. Sin esto, cada carga mostraría un
// parpadeo del tema por defecto antes de saltar al elegido.
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  // La marca (logo/tipografía/fondo) se define en /admin/apariencia y se
  // sirve pública en GET /settings — pero el layout raíz se renderiza en
  // TODA página, así que si la API no responde caemos a la marca real de
  // Inkapitales (DEFAULT_SETTINGS) en vez de romper el sitio entero.
  const settings = await settingsApi.get().catch(() => DEFAULT_SETTINGS);

  const headingFont: BrandFont = isCuratedFont(settings.headingFontFamily) ? settings.headingFontFamily : "Outfit";
  const bodyFont: BrandFont = isCuratedFont(settings.bodyFontFamily) ? settings.bodyFontFamily : "Work Sans";
  const customHeadingFont = headingFont !== "Outfit" && headingFont !== "Work Sans" ? headingFont : null;
  const customBodyFont = bodyFont !== "Outfit" && bodyFont !== "Work Sans" ? bodyFont : null;

  const bodyStyle: React.CSSProperties = {
    ...(settings.backgroundColor ? { backgroundColor: settings.backgroundColor } : {}),
    ...(settings.backgroundImageUrl
      ? {
          backgroundImage: `url(${settings.backgroundImageUrl})`,
          backgroundSize: "cover",
          backgroundAttachment: "fixed",
          backgroundPosition: "center",
        }
      : {}),
  };

  return (
    <html
      lang={locale}
      className={`${outfit.variable} ${workSans.variable}`}
      style={{
        ...(customHeadingFont ? ({ "--font-fraunces": `'${customHeadingFont}', ${outfit.style.fontFamily}` } as React.CSSProperties) : {}),
        ...(customBodyFont ? ({ "--font-inter": `'${customBodyFont}', ${workSans.style.fontFamily}` } as React.CSSProperties) : {}),
      }}
    >
      <head>
        {customHeadingFont && <link rel="stylesheet" href={googleFontHref(customHeadingFont)} />}
        {customBodyFont && <link rel="stylesheet" href={googleFontHref(customBodyFont)} />}
      </head>
      <body className="min-h-screen bg-paper font-sans text-ash-800 antialiased" style={bodyStyle}>
        {/* beforeInteractive: debe correr antes del primer paint para evitar el
            parpadeo del tema por defecto — un <script> crudo dentro de <head>
            no se renderiza en el App Router, next/script sí lo garantiza. */}
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <BrandSettingsProvider settings={settings}>
            <AuthProvider>
              <WatermarkOverlay />
              {children}
              <HelpButton />
              <ChatWidget />
            </AuthProvider>
          </BrandSettingsProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
