"use client";

import { LayoutDashboard, BookOpen, LibraryBig, CalendarDays, Award, Receipt, LifeBuoy, User, Sparkles, MessageSquarePlus, LogOut, ClipboardCheck, Banknote, Users, Wallet, Handshake, Percent, Building2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { SidebarShell, type SidebarNavItem } from "@/components/layout/SidebarShell";
import { useAuth } from "@/components/providers/AuthProvider";
import { roleHomeHref } from "@/lib/auth";

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
  // opciones de cada rol" — un alumno que también es docente/admin/soporte
  // ve acá las opciones de esos otros roles, agrupadas con su propio
  // encabezado. Antes cada chequeo excluía además `user?.globalRole !==
  // "X"` — pensado para "no repetir mi propio rol principal", pero eso
  // rompía exactamente el caso de "tengo varios roles y navegué a otra
  // área": un ADMIN que entraba a /campus (vía el link "Mi campus" que su
  // PROPIO sidebar de /admin le ofrece) se quedaba sin ver la sección
  // Administración/Soporte acá, porque `globalRole !== "ADMIN"` daba
  // false. Este bloque ya vive exclusivamente dentro del layout de
  // /campus — si el rol coincide con el del usuario, se muestra, punto:
  // nunca hace falta excluir el propio rol principal para evitar
  // duplicados, porque este archivo nunca se renderiza para el rol nativo
  // de esta área (alumno).
  const roles = [user?.globalRole, ...(user?.secondaryRoles ?? [])];
  if (roles.includes("TEACHER")) {
    navItems.push(
      { href: "/docente", label: "Panel de docente", icon: LayoutDashboard, section: "Docente" },
      { href: "/docente/cursos", label: "Mis cursos (docente)", icon: LibraryBig, section: "Docente" },
      { href: "/docente/evaluaciones-pendientes", label: "Evaluaciones pendientes (docente)", icon: ClipboardCheck, section: "Docente" },
      { href: "/docente/liquidaciones", label: "Mis liquidaciones", icon: Banknote, section: "Docente" },
      // "Fechas y horas que va a dictar" — faltaban acá aunque ya existían
      // en el nav nativo de /docente (docente/layout.tsx): este bloque
      // "prestado" se había quedado desactualizado respecto a ese.
      { href: "/docente/agenda", label: "Agenda (docente)", icon: CalendarDays, section: "Docente" },
      { href: "/docente/soporte", label: "Soporte (docente)", icon: LifeBuoy, section: "Docente" },
    );
  }
  // ADMIN ve el set completo; SUPPORT ADEMÁS agrega las colas de soporte/
  // sugerencias que le competen (antes era un if/else-if: un usuario con
  // AMBOS roles a la vez nunca veía los links de soporte acá).
  if (roles.includes("ADMIN") || roles.includes("SUPPORT")) {
    navItems.push({ href: "/admin", label: "Panel de administración", icon: LayoutDashboard, section: "Administración" });
  }
  if (roles.includes("ADMIN")) {
    navItems.push(
      { href: "/admin/usuarios", label: "Usuarios y roles", icon: Users, section: "Administración" },
      { href: "/admin/finanzas", label: "Finanzas", icon: Wallet, section: "Administración" },
      { href: "/admin/convenios", label: "Convenios institucionales", icon: Handshake, section: "Administración" },
      { href: "/admin/regalias", label: "Regalías", icon: Percent, section: "Administración" },
    );
  }
  if (roles.includes("SUPPORT")) {
    navItems.push(
      { href: "/admin/soporte", label: "Soporte (tickets)", icon: LifeBuoy, section: "Administración" },
      { href: "/admin/sugerencias", label: "Sugerencias", icon: MessageSquarePlus, section: "Administración" },
    );
  }
  if (roles.includes("COMPANY")) {
    navItems.push({ href: "/empresa", label: "Mi empresa", icon: Building2, section: "Empresa" });
  }

  return (
    <SidebarShell
      navItems={navItems}
      brandHref={roleHomeHref(user?.globalRole)}
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
