"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { Menu, X, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/providers/AuthProvider";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

export function Header() {
  const t = useTranslations("nav");
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const links = [
    { href: "/catalogo", label: t("catalog") },
    { href: "/empresas", label: t("companies") },
    { href: "/ayuda", label: t("help") },
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-paper-border bg-paper/95 backdrop-blur">
      <a href="#main-content" className="skip-link sr-only focus:not-sr-only">
        {t("skipToContent")}
      </a>
      <div className="container flex h-16 items-center justify-between gap-4">
        <Link href="/" className="flex items-center" aria-label="Inkademy">
          <Image src="/brand/logo-horizontal.png" alt="Inkademy" width={643} height={200} priority className="h-9 w-auto" />
        </Link>

        <nav aria-label={t("primaryNav")} className="hidden items-center gap-6 md:flex">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="text-sm font-medium text-ash-700 hover:text-ink-800">
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <LocaleSwitcher />
          {user ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setAccountOpen((v) => !v)}
                aria-expanded={accountOpen}
                aria-haspopup="menu"
                className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-ink-800 hover:bg-paper-muted"
              >
                {user.displayName ?? user.firstName}
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              </button>
              {accountOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-48 rounded-md border border-paper-border bg-paper py-1 shadow-raised"
                  onBlur={() => setAccountOpen(false)}
                >
                  <Link role="menuitem" href="/campus" className="block px-4 py-2 text-sm text-ash-700 hover:bg-paper-muted" onClick={() => setAccountOpen(false)}>
                    {t("myCampus")}
                  </Link>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setAccountOpen(false);
                      logout();
                    }}
                    className="block w-full px-4 py-2 text-left text-sm text-ash-700 hover:bg-paper-muted"
                  >
                    {t("logout")}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <Link href="/login">
                <Button variant="ghost" size="sm">
                  {t("login")}
                </Button>
              </Link>
              <Link href="/registro">
                <Button variant="primary" size="sm">
                  {t("register")}
                </Button>
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          className="p-2 text-ink-800 md:hidden"
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? t("closeMenu") : t("openMenu")}
          onClick={() => setMobileOpen((v) => !v)}
        >
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      <div className={cn("border-t border-paper-border bg-paper md:hidden", mobileOpen ? "block" : "hidden")}>
        <nav aria-label={t("primaryNav")} className="container flex flex-col gap-1 py-3">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="rounded-md px-2 py-2.5 text-sm font-medium text-ash-700 hover:bg-paper-muted" onClick={() => setMobileOpen(false)}>
              {link.label}
            </Link>
          ))}
          <div className="my-2 border-t border-paper-border" />
          {user ? (
            <>
              <Link href="/campus" className="rounded-md px-2 py-2.5 text-sm font-medium text-ash-700 hover:bg-paper-muted" onClick={() => setMobileOpen(false)}>
                {t("myCampus")}
              </Link>
              <button onClick={logout} className="rounded-md px-2 py-2.5 text-left text-sm font-medium text-ash-700 hover:bg-paper-muted">
                {t("logout")}
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="rounded-md px-2 py-2.5 text-sm font-medium text-ash-700 hover:bg-paper-muted" onClick={() => setMobileOpen(false)}>
                {t("login")}
              </Link>
              <Link href="/registro" className="rounded-md px-2 py-2.5 text-sm font-medium text-ink-800 hover:bg-paper-muted" onClick={() => setMobileOpen(false)}>
                {t("register")}
              </Link>
            </>
          )}
          <div className="px-2 py-2">
            <LocaleSwitcher />
          </div>
        </nav>
      </div>
    </header>
  );
}
