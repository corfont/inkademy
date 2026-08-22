"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { cn } from "@/lib/cn";

export interface SidebarNavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export function SidebarShell({
  navItems,
  brandHref,
  topRight,
  children,
}: {
  navItems: SidebarNavItem[];
  brandHref: string;
  topRight?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const nav = (
    <nav aria-label="Navegación" className="flex flex-col gap-1">
      {navItems.map((item) => {
        const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
              active ? "bg-ink-800 text-paper" : "text-ink-100/80 hover:bg-ink-800/60 hover:text-paper",
            )}
          >
            <item.icon className="h-4 w-4 flex-none" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      <a href="#main-content" className="skip-link sr-only focus:not-sr-only">
        Saltar al contenido principal
      </a>
      <aside className="hidden w-64 flex-none flex-col bg-ink-900 p-5 text-paper lg:flex">
        <Link href={brandHref} className="mb-8 flex items-center" aria-label="Inkademy">
          <Image src="/brand/logo-horizontal.png" alt="Inkademy" width={643} height={200} className="h-7 w-auto" />
        </Link>
        {nav}
        <div className="mt-auto pt-6">{topRight}</div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-paper-border bg-paper px-4 lg:hidden">
          <Link href={brandHref} className="flex items-center" aria-label="Inkademy">
            <Image src="/brand/logo-horizontal.png" alt="Inkademy" width={643} height={200} className="h-7 w-auto" />
          </Link>
          <button
            type="button"
            aria-label={mobileOpen ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
            className="p-2 text-ink-800"
          >
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </header>
        {mobileOpen && (
          <div className="border-b border-paper-border bg-ink-900 p-4 text-paper lg:hidden">
            {nav}
            <div className="mt-4">{topRight}</div>
          </div>
        )}

        <div className="hidden justify-end gap-3 border-b border-paper-border bg-paper px-6 py-3 lg:flex">
          <LocaleSwitcher />
        </div>

        <main id="main-content" className="flex-1 bg-paper-muted p-4 sm:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
