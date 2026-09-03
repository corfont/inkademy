"use client";

import { LayoutDashboard, LibraryBig, ClipboardCheck, CalendarDays, User, LogOut, Banknote, BookOpen, Award, Sparkles, Users, Wallet, Handshake, Percent, Building2, LifeBuoy, MessageSquarePlus } from "lucide-react";
import { SidebarShell, type SidebarNavItem } from "@/components/layout/SidebarShell";
import { useAuth } from "@/components/providers/AuthProvider";
import { roleHomeHref } from "@/lib/auth";

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
    { href: "/docente", label: "Panel", icon: LayoutDashboard, colorClassName: "bg-slate-400/20 text-slate-300" },
    { href: "/docente/cursos", label: "Mis cursos", icon: LibraryBig, colorClassName: "bg-blue-400/20 text-blue-300" },
    { href: "/docente/evaluaciones-pendientes", label: "Evaluaciones pendientes", icon: ClipboardCheck, colorClassName: "bg-lime-400/20 text-lime-300" },
    { href: "/docente/liquidaciones", label: "Mis liquidaciones", icon: Banknote, colorClassName: "bg-emerald-400/20 text-emerald-300" },
    { href: "/docente/agenda", label: "Agenda", icon: CalendarDays, colorClassName: "bg-orange-400/20 text-orange-300" },
    { href: "/docente/soporte", label: "Soporte", icon: LifeBuoy, colorClassName: "bg-red-400/20 text-red-300" },
    { href: "/campus/perfil", label: "Perfil", icon: User, colorClassName: "bg-cyan-400/20 text-cyan-300" },
  ];

  // "Si un usuario tiene más de un rol, debería ver en el menú todas las
  // opciones de cada rol" — un docente que también es alumno/admin/soporte
  // ve acá las opciones de esos otros roles. Antes cada chequeo excluía
  // además `user?.globalRole !== "X"` — pensado para "no repetir mi propio
  // rol principal", pero eso rompía el caso de "tengo varios roles y
  // navegué a otra área" (ver el mismo comentario, más detallado, en
  // campus/layout.tsx). Este bloque vive solo dentro de /docente — nunca
  // hace falta excluir el rol nativo de esta área (docente) para evitar
  // duplicados.
  const roles = [user?.globalRole, ...(user?.secondaryRoles ?? [])];
  if (roles.includes("STUDENT")) {
    navItems.push(
      { href: "/campus", label: "Mi campus", icon: LayoutDashboard, section: "Alumno", colorClassName: "bg-slate-400/20 text-slate-300" },
      { href: "/campus/cursos", label: "Mis cursos (alumno)", icon: BookOpen, section: "Alumno", colorClassName: "bg-blue-400/20 text-blue-300" },
      { href: "/campus/certificados", label: "Certificados (alumno)", icon: Award, section: "Alumno", colorClassName: "bg-purple-400/20 text-purple-300" },
      { href: "/campus/recomendaciones", label: "Recomendaciones", icon: Sparkles, section: "Alumno", colorClassName: "bg-violet-400/20 text-violet-300" },
    );
  }
  if (roles.includes("ADMIN") || roles.includes("SUPPORT")) {
    navItems.push({ href: "/admin", label: "Panel de administración", icon: LayoutDashboard, section: "Administración", colorClassName: "bg-slate-400/20 text-slate-300" });
  }
  if (roles.includes("ADMIN")) {
    navItems.push(
      { href: "/admin/usuarios", label: "Usuarios y roles", icon: Users, section: "Administración", colorClassName: "bg-cyan-400/20 text-cyan-300" },
      { href: "/admin/finanzas", label: "Finanzas", icon: Wallet, section: "Administración", colorClassName: "bg-emerald-400/20 text-emerald-300" },
      { href: "/admin/convenios", label: "Convenios institucionales", icon: Handshake, section: "Administración", colorClassName: "bg-amber-400/20 text-amber-300" },
      { href: "/admin/regalias", label: "Regalías", icon: Percent, section: "Administración", colorClassName: "bg-green-400/20 text-green-300" },
    );
  }
  if (roles.includes("SUPPORT")) {
    navItems.push(
      { href: "/admin/soporte", label: "Soporte (tickets)", icon: LifeBuoy, section: "Administración", colorClassName: "bg-red-400/20 text-red-300" },
      { href: "/admin/sugerencias", label: "Sugerencias", icon: MessageSquarePlus, section: "Administración", colorClassName: "bg-fuchsia-400/20 text-fuchsia-300" },
    );
  }
  if (roles.includes("COMPANY")) {
    navItems.push({ href: "/empresa", label: "Mi empresa", icon: Building2, section: "Empresa", colorClassName: "bg-teal-400/20 text-teal-300" });
  }

  return (
    <SidebarShell
      navItems={navItems}
      brandHref={roleHomeHref(user?.globalRole)}
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
