import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { HelpButton } from "@/components/layout/HelpButton";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
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
    <html lang={locale} className={`${fraunces.variable} ${inter.variable}`}>
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
