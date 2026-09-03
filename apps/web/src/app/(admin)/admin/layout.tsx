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
  DatabaseBackup,
  History,
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

  // Se calcula antes de armar navItems porque se usa para filtrar varias
  // pantallas ADMIN-puro (ver más abajo) además del bloque de "otros
  // roles" al final de esta función.
  const roles = [user?.globalRole, ...(user?.secondaryRoles ?? [])];

  const navItems: SidebarNavItem[] = [
    { href: "/admin", label: t("dashboard"), icon: LayoutDashboard, colorClassName: "bg-slate-400/20 text-slate-300" },
    { href: "/admin/catalogo", label: t("catalog"), icon: LibraryBig, colorClassName: "bg-blue-400/20 text-blue-300" },
    { href: "/admin/usuarios", label: "Usuarios y roles", icon: Users, colorClassName: "bg-cyan-400/20 text-cyan-300" },
    { href: "/admin/empresas", label: t("companies"), icon: Building2, colorClassName: "bg-teal-400/20 text-teal-300" },
    { href: "/admin/cotizaciones", label: "Cotizaciones", icon: FileText, colorClassName: "bg-amber-400/20 text-amber-300" },
    { href: "/admin/encuestas-nps", label: "Encuestas NPS", icon: Smile, colorClassName: "bg-pink-400/20 text-pink-300" },
    { href: "/admin/calificaciones", label: "Calificaciones de cursos", icon: Star, colorClassName: "bg-yellow-400/20 text-yellow-300" },
    { href: "/admin/ordenes", label: "Órdenes", icon: Receipt, colorClassName: "bg-green-400/20 text-green-300" },
    { href: "/admin/finanzas", label: "Finanzas", icon: Wallet, colorClassName: "bg-emerald-400/20 text-emerald-300" },
    { href: "/admin/matriculas", label: "Casos extemporáneos", icon: CalendarClock, colorClassName: "bg-orange-400/20 text-orange-300" },
    { href: "/admin/cortesias", label: "Cortesías", icon: Gift, colorClassName: "bg-rose-400/20 text-rose-300" },
    { href: "/admin/reportes", label: "Reportes", icon: FileDown, colorClassName: "bg-indigo-400/20 text-indigo-300" },
    { href: "/admin/soporte", label: t("support"), icon: LifeBuoy, badgeCount: pendingSupport, colorClassName: "bg-red-400/20 text-red-300" },
    { href: "/admin/sugerencias", label: "Sugerencias", icon: MessageSquarePlus, badgeCount: pendingSuggestions, colorClassName: "bg-fuchsia-400/20 text-fuchsia-300" },
    { href: "/admin/certificados", label: t("certificates"), icon: Award, colorClassName: "bg-purple-400/20 text-purple-300" },
    { href: "/admin/evaluaciones-pendientes", label: t("pendingReview"), icon: ClipboardCheck, colorClassName: "bg-lime-400/20 text-lime-300" },
    { href: "/admin/apariencia", label: t("appearance"), icon: Palette, colorClassName: "bg-violet-400/20 text-violet-300" },
    // Todo lo de acá para abajo pega contra rutas @Roles("ADMIN") puro (nunca
    // SUPPORT) — antes solo "Configuración avanzada"/"Zona de pruebas" se
    // ocultaban así; el resto se veía en el menú de un SUPPORT pero
    // reventaba (o daba un 403 confuso) al abrirlas. Mismo bloqueo en
    // middleware.ts (ADMIN_ONLY_PREFIXES) para que ocultarlas del menú no
    // sea la única defensa.
    ...(roles.includes("ADMIN")
      ? [
          { href: "/admin/facturacion", label: "Facturación (SUNAT)", icon: FileSpreadsheet, colorClassName: "bg-sky-400/20 text-sky-300" },
          // Familia violeta para todo lo relacionado a IA — se lee como "lo más nuevo" a simple vista.
          { href: "/admin/asistente-ia", label: "Asistente de IA", icon: Bot, colorClassName: "bg-violet-400/20 text-violet-300" },
          { href: "/admin/marketing", label: "Marketing por correo", icon: Mail, colorClassName: "bg-pink-400/20 text-pink-300" },
          { href: "/admin/convenios", label: "Convenios institucionales", icon: Handshake, colorClassName: "bg-amber-400/20 text-amber-300" },
          { href: "/admin/regalias", label: "Regalías", icon: Percent, colorClassName: "bg-green-400/20 text-green-300" },
          { href: "/admin/horas-docentes", label: "Horas dictadas por docente", icon: CalendarDays, colorClassName: "bg-blue-400/20 text-blue-300" },
          { href: "/admin/liquidaciones", label: "Liquidación de docentes", icon: Banknote, colorClassName: "bg-emerald-400/20 text-emerald-300" },
          { href: "/admin/liquidaciones/tarifas", label: "Tarifas y adelantos (docentes)", icon: Wallet, colorClassName: "bg-teal-400/20 text-teal-300" },
          { href: "/admin/configuracion", label: "Configuración avanzada", icon: Lock, colorClassName: "bg-slate-400/20 text-slate-300" },
          { href: "/admin/backups", label: "Backups", icon: DatabaseBackup, colorClassName: "bg-violet-400/20 text-violet-300" },
          { href: "/admin/auditoria", label: "Auditoría", icon: History, colorClassName: "bg-orange-400/20 text-orange-300" },
          { href: "/admin/zona-de-pruebas", label: "Zona de pruebas", icon: AlertTriangle, colorClassName: "bg-red-400/20 text-red-300" },
        ]
      : []),
  ];

  // "Si un usuario tiene más de un rol, debería ver en el menú todas las
  // opciones de cada rol" — se le agregan al sidebar de este panel las
  // opciones de sus OTROS roles, agrupadas con su propio encabezado. Antes
  // cada chequeo excluía además `user?.globalRole !== "X"` — pensado para
  // "no repetir mi propio rol principal", pero eso rompía el caso de
  // "tengo varios roles y navegué a otra área" (ver el mismo comentario,
  // más detallado, en campus/layout.tsx). Este bloque vive solo dentro de
  // /admin — nunca hace falta excluir ADMIN/SUPPORT (el rol nativo de
  // esta área) para evitar duplicados. (`roles` ya se calculó arriba.)
  if (roles.includes("TEACHER")) {
    navItems.push(
      { href: "/docente", label: "Panel de docente", icon: LayoutDashboard, section: "Docente", colorClassName: "bg-slate-400/20 text-slate-300" },
      { href: "/docente/cursos", label: "Mis cursos (docente)", icon: LibraryBig, section: "Docente", colorClassName: "bg-blue-400/20 text-blue-300" },
      { href: "/docente/evaluaciones-pendientes", label: "Evaluaciones pendientes (docente)", icon: ClipboardCheck, section: "Docente", colorClassName: "bg-lime-400/20 text-lime-300" },
      { href: "/docente/liquidaciones", label: "Mis liquidaciones", icon: Banknote, section: "Docente", colorClassName: "bg-emerald-400/20 text-emerald-300" },
      // "Fechas y horas que va a dictar" — faltaban acá aunque ya existían
      // en el nav nativo de /docente (docente/layout.tsx): este bloque
      // "prestado" se había quedado desactualizado respecto a ese.
      { href: "/docente/agenda", label: "Agenda (docente)", icon: CalendarDays, section: "Docente", colorClassName: "bg-orange-400/20 text-orange-300" },
      { href: "/docente/soporte", label: "Soporte (docente)", icon: LifeBuoy, section: "Docente", colorClassName: "bg-red-400/20 text-red-300" },
    );
  }
  if (roles.includes("STUDENT")) {
    navItems.push(
      { href: "/campus", label: "Mi campus", icon: LayoutDashboard, section: "Alumno", colorClassName: "bg-slate-400/20 text-slate-300" },
      { href: "/campus/cursos", label: "Mis cursos (alumno)", icon: BookOpen, section: "Alumno", colorClassName: "bg-blue-400/20 text-blue-300" },
      { href: "/campus/agenda", label: "Agenda (alumno)", icon: CalendarDays, section: "Alumno", colorClassName: "bg-orange-400/20 text-orange-300" },
      { href: "/campus/certificados", label: "Certificados (alumno)", icon: Award, section: "Alumno", colorClassName: "bg-purple-400/20 text-purple-300" },
      { href: "/campus/recomendaciones", label: "Recomendaciones", icon: Sparkles, section: "Alumno", colorClassName: "bg-violet-400/20 text-violet-300" },
      { href: "/campus/perfil", label: "Perfil", icon: User, section: "Alumno", colorClassName: "bg-cyan-400/20 text-cyan-300" },
    );
  }
  if (roles.includes("COMPANY")) {
    navItems.push({ href: "/empresa", label: "Mi empresa", icon: Building2, section: "Empresa", colorClassName: "bg-teal-400/20 text-teal-300" });
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
