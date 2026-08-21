import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/Button";

export default async function NotFound() {
  const t = await getTranslations("notFound");
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-paper px-4 text-center">
      <p className="font-serif text-6xl font-semibold text-ink-200">404</p>
      <h1 className="font-serif text-2xl font-semibold text-ink-900">{t("title")}</h1>
      <p className="max-w-md text-ash-600">{t("body")}</p>
      <Link href="/">
        <Button>{t("cta")}</Button>
      </Link>
    </div>
  );
}
