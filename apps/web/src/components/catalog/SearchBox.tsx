"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";

export function SearchBox({ className }: { className?: string }) {
  const router = useRouter();
  const t = useTranslations("home");
  const tc = useTranslations("common");
  const [value, setValue] = useState("");

  return (
    <form
      role="search"
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        router.push(`/catalogo${value ? `?q=${encodeURIComponent(value)}` : ""}`);
      }}
    >
      <label htmlFor="home-search" className="sr-only">
        {t("searchPlaceholder")}
      </label>
      <div className="flex items-center gap-2 rounded-full border border-paper-border bg-paper p-1.5 pl-5 shadow-card">
        <Search className="h-5 w-5 flex-none text-ash-400" aria-hidden="true" />
        <input
          id="home-search"
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="w-full bg-transparent text-base text-ash-800 placeholder:text-ash-400 focus:outline-none"
        />
        <Button type="submit" size="md" className="rounded-full">
          {tc("search")}
        </Button>
      </div>
    </form>
  );
}
