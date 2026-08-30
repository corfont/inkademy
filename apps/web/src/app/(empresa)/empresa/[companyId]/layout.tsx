"use client";

import { useParams } from "next/navigation";
import { LayoutDashboard, Ticket, Users, LineChart, Award, FileText, LogOut, BookOpen, ClipboardCheck, LibraryBig } from "lucide-react";
import { useTranslations } from "next-intl";
import { SidebarShell, type SidebarNavItem } from "@/components/layout/SidebarShell";
import { useAuth } from "@/components/providers/AuthProvider";
import { roleHomeHref } from "@/lib/auth";

export default function CompanyLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("empresa.nav");
  const params = useParams<{ companyId: string }>();
  const { user, logout } = useAuth();
  const base = `/empresa/${params.companyId}`;

  const navItems: SidebarNavItem[] = [
    { href: base, label: t("dashboard"), icon: LayoutDashboard },
    { href: `${base}/cupos`, label: t("seats"), icon: Ticket },
    { href: `${base}/colaboradores`, label: t("collaborators"), icon: Users },
    { href: `${base}/reportes`, label: t("reports"), icon: LineChart },
    { href: `${base}/certificados`, label: t("certificates"), icon: Award },
    { href: `${base}/cotizaciones`, label: t("quotes"), icon: FileText },
  ];

  // "Si un usuario tiene más de un rol, debería ver en el menú todas las
  // opciones de cada rol" — mismo patrón que campus/admin/docente (ver el
  // comentario detallado en campus/layout.tsx sobre por qué ya no se
  // excluye el rol nativo de esta área).
  const roles = [user?.globalRole, ...(user?.secondaryRoles ?? [])];
  if (roles.includes("STUDENT")) {
    navItems.push(
      { href: "/campus", label: "Mi campus", icon: LayoutDashboard, section: "Alumno" },
      { href: "/campus/cursos", label: "Mis cursos (alumno)", icon: BookOpen, section: "Alumno" },
    );
  }
  if (roles.includes("TEACHER")) {
    navItems.push(
      { href: "/docente", label: "Panel de docente", icon: LayoutDashboard, section: "Docente" },
      { href: "/docente/cursos", label: "Mis cursos (docente)", icon: LibraryBig, section: "Docente" },
      { href: "/docente/evaluaciones-pendientes", label: "Evaluaciones pendientes (docente)", icon: ClipboardCheck, section: "Docente" },
    );
  }
  if (roles.includes("ADMIN") || roles.includes("SUPPORT")) {
    navItems.push({ href: "/admin", label: "Panel de administración", icon: LayoutDashboard, section: "Administración" });
  }

  return (
    <SidebarShell
      navItems={navItems}
      // Si la empresa ES el rol principal, "Inicio" se queda en ESTA
      // empresa (más útil que un /empresa genérico); para cualquier otro
      // rol principal que esté de visita acá, va a su home real.
      brandHref={user?.globalRole === "COMPANY" ? base : roleHomeHref(user?.globalRole)}
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
