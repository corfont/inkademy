"use client";

import { useParams } from "next/navigation";
import { LayoutDashboard, Ticket, Users, LineChart, Award, FileText, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { SidebarShell } from "@/components/layout/SidebarShell";
import { useAuth } from "@/components/providers/AuthProvider";

export default function CompanyLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("empresa.nav");
  const params = useParams<{ companyId: string }>();
  const { user, logout } = useAuth();
  const base = `/empresa/${params.companyId}`;

  const navItems = [
    { href: base, label: t("dashboard"), icon: LayoutDashboard },
    { href: `${base}/cupos`, label: t("seats"), icon: Ticket },
    { href: `${base}/colaboradores`, label: t("collaborators"), icon: Users },
    { href: `${base}/reportes`, label: t("reports"), icon: LineChart },
    { href: `${base}/certificados`, label: t("certificates"), icon: Award },
    { href: `${base}/cotizaciones`, label: t("quotes"), icon: FileText },
  ];

  return (
    <SidebarShell
      navItems={navItems}
      brandHref={base}
      topRight={
        <div className="flex flex-col gap-2 border-t border-ink-800 pt-4 text-sm text-ink-100">
          <p className="truncate font-medium text-paper">{user?.displayName ?? `${user?.firstName ?? ""} ${user?.lastName ?? ""}`}</p>
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
