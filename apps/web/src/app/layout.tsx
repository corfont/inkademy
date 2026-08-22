import type { Metadata } from "next";
import { Outfit, Work_Sans } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { HelpButton } from "@/components/layout/HelpButton";
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} className={`${outfit.variable} ${workSans.variable}`}>
      <body className="min-h-screen bg-paper font-sans text-ash-800 antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <AuthProvider>
            {children}
            <HelpButton />
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
