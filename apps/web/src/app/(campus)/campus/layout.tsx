"use client";

import { LayoutDashboard, BookOpen, LibraryBig, CalendarDays, Award, Receipt, LifeBuoy, User, Sparkles, MessageSquarePlus, LogOut, ClipboardCheck, Banknote, Users, Wallet, Handshake, Percent } from "lucide-react";
import { useTranslations } from "next-intl";
import { SidebarShell, type SidebarNavItem } from "@/components/layout/SidebarShell";
import { useAuth } from "@/components/providers/AuthProvider";

export default function CampusLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("campus.nav");
  const { user, logout } = useAuth();

  const navItems: SidebarNavItem[] = [
    { href: "/campus", label: t("dashboard"), icon: LayoutDashboard },
    { href: "/campus/cursos", label: t("courses"), icon: BookOpen },
    // Antes no había ningún link desde el campus al catálogo completo — el
    // alumno solo veía "Mis cursos" (matriculados) y "Recomendaciones", sin
    // forma de explorar TODA la oferta de Inkademy sin salir a la home pública.
    { href: "/catalogo", label: "Explorar catálogo", icon: LibraryBig },
    { href: "/campus/agenda", label: t("agenda"), icon: CalendarDays },
    { href: "/campus/certificados", label: t("certificates"), icon: Award },
    { href: "/campus/pagos", label: t("payments"), icon: Receipt },
    { href: "/campus/recomendaciones", label: t("recommendations"), icon: Sparkles },
    { href: "/campus/soporte", label: t("support"), icon: LifeBuoy },
    { href: "/campus/sugerencias", label: "Sugerencias", icon: MessageSquarePlus },
    { href: "/campus/perfil", label: t("profile"), icon: User },
  ];

  // "Si un usuario tiene más de un rol, debería ver en el menú todas las
  // opciones de cada rol" — un alumno que también es docente o admin ve
  // acá las opciones de esos otros roles, agrupadas con su propio encabezado.
  const roles = [user?.globalRole, ...(user?.secondaryRoles ?? [])];
  if (roles.includes("TEACHER") && user?.globalRole !== "TEACHER") {
    navItems.push(
      { href: "/docente", label: "Panel de docente", icon: LayoutDashboard, section: "Docente" },
      { href: "/docente/cursos", label: "Mis cursos (docente)", icon: LibraryBig, section: "Docente" },
      { href: "/docente/evaluaciones-pendientes", label: "Evaluaciones pendientes (docente)", icon: ClipboardCheck, section: "Docente" },
      { href: "/docente/liquidaciones", label: "Mis liquidaciones", icon: Banknote, section: "Docente" },
    );
  }
  if ((roles.includes("ADMIN") || roles.includes("SUPPORT")) && user?.globalRole !== "ADMIN" && user?.globalRole !== "SUPPORT") {
    navItems.push(
      { href: "/admin", label: "Panel de administración", icon: LayoutDashboard, section: "Administración" },
      { href: "/admin/usuarios", label: "Usuarios y roles", icon: Users, section: "Administración" },
      { href: "/admin/finanzas", label: "Finanzas", icon: Wallet, section: "Administración" },
      { href: "/admin/convenios", label: "Convenios institucionales", icon: Handshake, section: "Administración" },
      { href: "/admin/regalias", label: "Regalías", icon: Percent, section: "Administración" },
    );
  }

  return (
    <SidebarShell
      navItems={navItems}
      brandHref="/campus"
      topRight={
        <div className="flex flex-col gap-2 border-t border-ink-800 pt-4 text-sm text-ink-100">
          <p className="truncate font-medium text-paper">{user?.displayName ?? user ? `${user?.firstName} ${user?.lastName}` : ""}</p>
          <p className="truncate text-xs text-ink-300">{user?.timezone}</p>
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
