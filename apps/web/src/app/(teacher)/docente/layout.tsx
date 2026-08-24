"use client";

import { LayoutDashboard, LibraryBig, ClipboardCheck, CalendarDays, User, LogOut } from "lucide-react";
import { SidebarShell } from "@/components/layout/SidebarShell";
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

  const navItems = [
    { href: "/docente", label: "Panel", icon: LayoutDashboard },
    { href: "/docente/cursos", label: "Mis cursos", icon: LibraryBig },
    { href: "/docente/evaluaciones-pendientes", label: "Evaluaciones pendientes", icon: ClipboardCheck },
    { href: "/campus/agenda", label: "Agenda", icon: CalendarDays },
    { href: "/campus/perfil", label: "Perfil", icon: User },
  ];

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
