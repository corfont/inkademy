"use client";

import { LayoutDashboard, LibraryBig, Building2, LifeBuoy, Award, ClipboardCheck, Palette, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { SidebarShell } from "@/components/layout/SidebarShell";
import { useAuth } from "@/components/providers/AuthProvider";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("admin.nav");
  const { user, logout } = useAuth();

  const navItems = [
    { href: "/admin", label: t("dashboard"), icon: LayoutDashboard },
    { href: "/admin/catalogo", label: t("catalog"), icon: LibraryBig },
    { href: "/admin/empresas", label: t("companies"), icon: Building2 },
    { href: "/admin/soporte", label: t("support"), icon: LifeBuoy },
    { href: "/admin/certificados", label: t("certificates"), icon: Award },
    { href: "/admin/evaluaciones-pendientes", label: t("pendingReview"), icon: ClipboardCheck },
    { href: "/admin/apariencia", label: t("appearance"), icon: Palette },
  ];

  return (
    <SidebarShell
      navItems={navItems}
      brandHref="/admin"
      topRight={
        <div className="flex flex-col gap-2 border-t border-ink-800 pt-4 text-sm text-ink-100">
          <p className="truncate font-medium text-paper">{user?.displayName ?? `${user?.firstName ?? ""} ${user?.lastName ?? ""}`}</p>
          <p className="text-xs text-ink-300">{user?.globalRole}</p>
          <button onClick={logout} className="mt-1 flex items-center gap-2 text-ink-200 hover:text-paper">
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Cerrar sesión
          </button>
        </div>
      }
    >
      {children}
    </SidebarShell>
  );
}
