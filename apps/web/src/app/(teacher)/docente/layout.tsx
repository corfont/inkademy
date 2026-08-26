"use client";

import { LayoutDashboard, LibraryBig, ClipboardCheck, CalendarDays, User, LogOut, Banknote, BookOpen, Award, Sparkles, Users, Wallet, Handshake, Percent, Building2, LifeBuoy, MessageSquarePlus } from "lucide-react";
import { SidebarShell, type SidebarNavItem } from "@/components/layout/SidebarShell";
import { useAuth } from "@/components/providers/AuthProvider";

/**
 * Panel de docente — antes no existía ninguna pantalla que un TEACHER
 * pudiera alcanzar: el middleware bloqueaba /admin para cualquiera que no
 * fuera ADMIN/SUPPORT, aunque la API ya aceptaba @Roles("ADMIN","TEACHER")
 * en varios endpoints (cursos, calificación de evaluaciones abiertas). Este
 * layout + sus páginas reutilizan esos mismos endpoints, ya acotados del
 * lado del backend a "solo mis cursos asignados" (ver AdminService).
 */
export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();

  const navItems: SidebarNavItem[] = [
    { href: "/docente", label: "Panel", icon: LayoutDashboard },
    { href: "/docente/cursos", label: "Mis cursos", icon: LibraryBig },
    { href: "/docente/evaluaciones-pendientes", label: "Evaluaciones pendientes", icon: ClipboardCheck },
    { href: "/docente/liquidaciones", label: "Mis liquidaciones", icon: Banknote },
    { href: "/docente/agenda", label: "Agenda", icon: CalendarDays },
    { href: "/docente/soporte", label: "Soporte", icon: LifeBuoy },
    { href: "/campus/perfil", label: "Perfil", icon: User },
  ];

  // "Si un usuario tiene más de un rol, debería ver en el menú todas las
  // opciones de cada rol" — un docente que también es alumno o admin ve
  // acá las opciones de esos otros roles, agrupadas con su propio encabezado.
  const roles = [user?.globalRole, ...(user?.secondaryRoles ?? [])];
  if (roles.includes("STUDENT") && user?.globalRole !== "STUDENT") {
    navItems.push(
      { href: "/campus", label: "Mi campus", icon: LayoutDashboard, section: "Alumno" },
      { href: "/campus/cursos", label: "Mis cursos (alumno)", icon: BookOpen, section: "Alumno" },
      { href: "/campus/certificados", label: "Certificados (alumno)", icon: Award, section: "Alumno" },
      { href: "/campus/recomendaciones", label: "Recomendaciones", icon: Sparkles, section: "Alumno" },
    );
  }
  if (roles.includes("ADMIN") && user?.globalRole !== "ADMIN") {
    navItems.push(
      { href: "/admin", label: "Panel de administración", icon: LayoutDashboard, section: "Administración" },
      { href: "/admin/usuarios", label: "Usuarios y roles", icon: Users, section: "Administración" },
      { href: "/admin/finanzas", label: "Finanzas", icon: Wallet, section: "Administración" },
      { href: "/admin/convenios", label: "Convenios institucionales", icon: Handshake, section: "Administración" },
      { href: "/admin/regalias", label: "Regalías", icon: Percent, section: "Administración" },
    );
  } else if (roles.includes("SUPPORT") && user?.globalRole !== "SUPPORT") {
    navItems.push(
      { href: "/admin", label: "Panel de administración", icon: LayoutDashboard, section: "Administración" },
      { href: "/admin/soporte", label: "Soporte (tickets)", icon: LifeBuoy, section: "Administración" },
      { href: "/admin/sugerencias", label: "Sugerencias", icon: MessageSquarePlus, section: "Administración" },
    );
  }
  if (roles.includes("COMPANY") && user?.globalRole !== "COMPANY") {
    navItems.push({ href: "/empresa", label: "Mi empresa", icon: Building2, section: "Empresa" });
  }

  return (
    <SidebarShell
      navItems={navItems}
      brandHref="/docente"
      topRight={
        <div className="flex flex-col gap-2 border-t border-ink-800 pt-4 text-sm text-ink-100">
          <p className="truncate font-medium text-paper">{user?.displayName ?? `${user?.firstName ?? ""} ${user?.lastName ?? ""}`}</p>
          <p className="text-xs text-ink-300">Docente</p>
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
