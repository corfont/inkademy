import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/Button";

export const metadata: Metadata = { title: "Ayuda" };

export default async function HelpPage() {
  const t = await getTranslations("help_page");
  const faqs = t.raw("faqs") as { q: string; a: string }[];

  return (
    <div className="container max-w-3xl py-14">
      <h1 className="font-serif text-3xl font-semibold text-ink-900">{t("title")}</h1>
      <p className="mt-2 text-ash-600">{t("subtitle")}</p>

      <dl className="mt-10 divide-y divide-paper-border">
        {faqs.map((faq) => (
          <div key={faq.q} className="py-5">
            <dt className="font-serif text-lg font-medium text-ink-900">{faq.q}</dt>
            <dd className="mt-2 text-ash-600">{faq.a}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-10 rounded-lg border border-paper-border bg-paper-muted p-6 text-center">
        <p className="mb-4 text-ash-700">{t("subtitle")}</p>
        <Link href="/campus/soporte">
          <Button>{t("contactCta")}</Button>
        </Link>
      </div>
    </div>
  );
}
