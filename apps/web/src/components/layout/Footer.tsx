"use client";

import Link from "next/link";
import { BrandLogo } from "@/components/layout/BrandLogo";
import { useBrandSettings } from "@/components/providers/BrandSettingsProvider";
import { useTranslations } from "next-intl";

export function Footer() {
  const t = useTranslations("footer");
  const { contactEmail, contactPhone, contactAddress } = useBrandSettings();
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-paper-border bg-paper-muted">
      <div className="container grid gap-10 py-14 md:grid-cols-4">
        <div>
          <BrandLogo className="mb-3" />
          <p className="max-w-xs text-sm text-ash-600">{t("tagline")}</p>
        </div>

        <nav aria-label={t("platform")}>
          <h3 className="mb-3 text-sm font-semibold text-ink-900">{t("platform")}</h3>
          <ul className="flex flex-col gap-2 text-sm text-ash-600">
            <li><Link href="/catalogo" className="hover:text-ink-800">{t("catalog")}</Link></li>
            <li><Link href="/empresas" className="hover:text-ink-800">{t("companies")}</Link></li>
            <li><Link href="/ayuda" className="hover:text-ink-800">{t("help")}</Link></li>
            <li><Link href="/verificar/demo" className="hover:text-ink-800">{t("verifyCertificate")}</Link></li>
          </ul>
        </nav>

        <nav aria-label={t("legal")}>
          <h3 className="mb-3 text-sm font-semibold text-ink-900">{t("legal")}</h3>
          <ul className="flex flex-col gap-2 text-sm text-ash-600">
            <li><Link href="/legales/privacidad" className="hover:text-ink-800">{t("privacy")}</Link></li>
            <li><Link href="/legales/terminos" className="hover:text-ink-800">{t("terms")}</Link></li>
            <li><Link href="/legales/cookies" className="hover:text-ink-800">{t("cookies")}</Link></li>
          </ul>
        </nav>

        <div>
          <h3 className="mb-3 text-sm font-semibold text-ink-900">{t("contact")}</h3>
          <ul className="flex flex-col gap-2 text-sm text-ash-600">
            {contactEmail && <li>{contactEmail}</li>}
            {contactPhone && <li>{contactPhone}</li>}
            {contactAddress && <li>{contactAddress}</li>}
          </ul>
        </div>
      </div>
      <div className="container flex flex-col gap-2 border-t border-paper-border py-6 text-xs text-ash-500 sm:flex-row sm:items-center sm:justify-between">
        <p>© {year} Inkademy. {t("rightsReserved")}</p>
      </div>
    </footer>
  );
}
