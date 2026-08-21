import type { Metadata } from "next";
import { Building2, LineChart, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { QuoteForm } from "@/components/marketing/QuoteForm";

export const metadata: Metadata = { title: "Empresas" };

export default async function CompaniesPage() {
  const t = await getTranslations("companies");

  const benefits = [
    { icon: Building2, title: t("benefit1Title"), body: t("benefit1Body") },
    { icon: LineChart, title: t("benefit2Title"), body: t("benefit2Body") },
    { icon: Users, title: t("benefit3Title"), body: t("benefit3Body") },
  ];

  return (
    <div>
      <section className="border-b border-paper-border bg-ink-900 py-20 text-paper">
        <div className="container max-w-3xl">
          <h1 className="font-serif text-4xl font-semibold">{t("heroTitle")}</h1>
          <p className="mt-4 text-lg text-ink-100">{t("heroSubtitle")}</p>
        </div>
      </section>

      <section className="py-14">
        <div className="container">
          <h2 className="mb-8 font-serif text-2xl font-semibold text-ink-900">{t("benefitsTitle")}</h2>
          <div className="grid gap-6 sm:grid-cols-3">
            {benefits.map((b) => (
              <div key={b.title} className="rounded-lg border border-paper-border bg-paper p-6 shadow-card">
                <b.icon className="h-7 w-7 text-gold-500" aria-hidden="true" />
                <h3 className="mt-4 font-serif text-lg font-semibold text-ink-900">{b.title}</h3>
                <p className="mt-2 text-sm text-ash-600">{b.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-paper-border bg-paper-muted py-14">
        <div className="container max-w-2xl">
          <h2 className="font-serif text-2xl font-semibold text-ink-900">{t("formTitle")}</h2>
          <p className="mt-2 text-ash-600">{t("formSubtitle")}</p>
          <div className="mt-8">
            <QuoteForm />
          </div>
        </div>
      </section>
    </div>
  );
}
