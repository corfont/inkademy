"use client";

import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  LibraryBig,
  Building2,
  LifeBuoy,
  Award,
  ClipboardCheck,
  Palette,
  MessageSquarePlus,
  Receipt,
  Gift,
  FileSpreadsheet,
  FileDown,
  FileText,
  Users,
  Bot,
  LogOut,
  CalendarClock,
  Wallet,
  Lock,
  Handshake,
  Percent,
  Banknote,
  Mail,
  CalendarDays,
  BookOpen,
  Sparkles,
  User,
  Smile,
  Star,
  AlertTriangle,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { SidebarShell, type SidebarNavItem } from "@/components/layout/SidebarShell";
import { useAuth } from "@/components/providers/AuthProvider";
import { roleHomeHref } from "@/lib/auth";
import { supportApi, suggestionsApi } from "@/lib/api-client";

// Cada cuánto se refresca el contador de pendientes en el menú — no hace
// falta tiempo real, solo que no quede muy desactualizado mientras el
// admin navega por otras pantallas.
const PENDING_COUNT_POLL_MS = 60_000;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("admin.nav");
  const { user, logout } = useAuth();
  // "Al costado de soporte debería de aparecer un indicador que tiene
  // mensajes pendientes de resolver" — antes no había ninguna forma de
  // saber, sin entrar, si había tickets sin atender. Lo mismo para
  // sugerencias sin responder.
  const [pendingSupport, setPendingSupport] = useState(0);
  const [pendingSuggestions, setPendingSuggestions] = useState(0);

  useEffect(() => {
    let cancelled = false;
    function refresh() {
      supportApi.pendingCount().then((n) => !cancelled && setPendingSupport(n)).catch(() => {});
      suggestionsApi.pendingCount().then((n) => !cancelled && setPendingSuggestions(n)).catch(() => {});
    }
    refresh();
    const interval = setInterval(refresh, PENDING_COUNT_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const navItems: SidebarNavItem[] = [
    { href: "/admin", label: t("dashboard"), icon: LayoutDashboard },
    { href: "/admin/catalogo", label: t("catalog"), icon: LibraryBig },
    { href: "/admin/usuarios", label: "Usuarios y roles", icon: Users },
    { href: "/admin/empresas", label: t("companies"), icon: Building2 },
    { href: "/admin/cotizaciones", label: "Cotizaciones", icon: FileText },
    { href: "/admin/encuestas-nps", label: "Encuestas NPS", icon: Smile },
    { href: "/admin/calificaciones", label: "Calificaciones de cursos", icon: Star },
    { href: "/admin/ordenes", label: "Órdenes", icon: Receipt },
    { href: "/admin/finanzas", label: "Finanzas", icon: Wallet },
    { href: "/admin/matriculas", label: "Casos extemporáneos", icon: CalendarClock },
    { href: "/admin/cortesias", label: "Cortesías", icon: Gift },
    { href: "/admin/facturacion", label: "Facturación (SUNAT)", icon: FileSpreadsheet },
    { href: "/admin/reportes", label: "Reportes", icon: FileDown },
    { href: "/admin/soporte", label: t("support"), icon: LifeBuoy, badgeCount: pendingSupport },
    { href: "/admin/sugerencias", label: "Sugerencias", icon: MessageSquarePlus, badgeCount: pendingSuggestions },
    { href: "/admin/certificados", label: t("certificates"), icon: Award },
    { href: "/admin/evaluaciones-pendientes", label: t("pendingReview"), icon: ClipboardCheck },
    { href: "/admin/apariencia", label: t("appearance"), icon: Palette },
    { href: "/admin/asistente-ia", label: "Asistente de IA", icon: Bot },
    { href: "/admin/marketing", label: "Marketing por correo", icon: Mail },
    { href: "/admin/convenios", label: "Convenios institucionales", icon: Handshake },
    { href: "/admin/regalias", label: "Regalías", icon: Percent },
    { href: "/admin/horas-docentes", label: "Horas dictadas por docente", icon: CalendarDays },
    { href: "/admin/liquidaciones", label: "Liquidación de docentes", icon: Banknote },
    { href: "/admin/liquidaciones/tarifas", label: "Tarifas y adelantos (docentes)", icon: Wallet },
    ...(user?.globalRole === "ADMIN" ? [{ href: "/admin/configuracion", label: "Configuración avanzada", icon: Lock }] : []),
    // "Los accesos a borrar todo... deberían estar en un módulo aparte" —
    // solo ADMIN puro (nunca SUPPORT) ve esta pantalla, mismo criterio que
    // "Configuración avanzada" arriba.
    ...(user?.globalRole === "ADMIN" ? [{ href: "/admin/zona-de-pruebas", label: "Zona de pruebas", icon: AlertTriangle }] : []),
  ];

  // "Si un usuario tiene más de un rol, debería ver en el menú todas las
  // opciones de cada rol" — se le agregan al sidebar de este panel las
  // opciones de sus OTROS roles, agrupadas con su propio encabezado. Antes
  // cada chequeo excluía además `user?.globalRole !== "X"` — pensado para
  // "no repetir mi propio rol principal", pero eso rompía el caso de
  // "tengo varios roles y navegué a otra área" (ver el mismo comentario,
  // más detallado, en campus/layout.tsx). Este bloque vive solo dentro de
  // /admin — nunca hace falta excluir ADMIN/SUPPORT (el rol nativo de
  // esta área) para evitar duplicados.
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
  if (roles.includes("STUDENT")) {
    navItems.push(
      { href: "/campus", label: "Mi campus", icon: LayoutDashboard, section: "Alumno" },
      { href: "/campus/cursos", label: "Mis cursos (alumno)", icon: BookOpen, section: "Alumno" },
      { href: "/campus/agenda", label: "Agenda (alumno)", icon: CalendarDays, section: "Alumno" },
      { href: "/campus/certificados", label: "Certificados (alumno)", icon: Award, section: "Alumno" },
      { href: "/campus/recomendaciones", label: "Recomendaciones", icon: Sparkles, section: "Alumno" },
      { href: "/campus/perfil", label: "Perfil", icon: User, section: "Alumno" },
    );
  }
  if (roles.includes("COMPANY")) {
    navItems.push({ href: "/empresa", label: "Mi empresa", icon: Building2, section: "Empresa" });
  }

  return (
    <SidebarShell
      navItems={navItems}
      // "Al tener más de un rol... el botón Inicio me lleva al inicio de
      // ESE rol nomás" — antes cada layout pasaba su propia área fija
      // ("/admin" acá); ahora resuelve el home REAL del usuario según su
      // rol principal, sin importar en qué área esté parado la página
      // actual (ver roleHomeHref, misma regla que ya usa /login).
      brandHref={roleHomeHref(user?.globalRole)}
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
