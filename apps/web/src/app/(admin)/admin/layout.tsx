"use client";

import { useEffect, useState } from "react";
import { LayoutDashboard, LibraryBig, Building2, LifeBuoy, Award, ClipboardCheck, Palette, MessageSquarePlus, Receipt, Gift, FileSpreadsheet, Users, Bot, LogOut, CalendarClock, Wallet, Lock, Handshake } from "lucide-react";
import { useTranslations } from "next-intl";
import { SidebarShell } from "@/components/layout/SidebarShell";
import { useAuth } from "@/components/providers/AuthProvider";
import { supportApi } from "@/lib/api-client";

// Cada cuánto se refresca el contador de tickets pendientes en el menú —
// no hace falta tiempo real, solo que no quede muy desactualizado mientras
// el admin navega por otras pantallas.
const PENDING_COUNT_POLL_MS = 60_000;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("admin.nav");
  const { user, logout } = useAuth();
  // "Al costado de soporte debería de aparecer un indicador que tiene
  // mensajes pendientes de resolver" — antes no había ninguna forma de
  // saber, sin entrar, si había tickets sin atender.
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    function refresh() {
      supportApi
        .pendingCount()
        .then((n) => !cancelled && setPendingCount(n))
        .catch(() => {});
    }
    refresh();
    const interval = setInterval(refresh, PENDING_COUNT_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const navItems = [
    { href: "/admin", label: t("dashboard"), icon: LayoutDashboard },
    { href: "/admin/catalogo", label: t("catalog"), icon: LibraryBig },
    { href: "/admin/usuarios", label: "Usuarios y roles", icon: Users },
    { href: "/admin/empresas", label: t("companies"), icon: Building2 },
    { href: "/admin/ordenes", label: "Órdenes", icon: Receipt },
    { href: "/admin/finanzas", label: "Finanzas", icon: Wallet },
    { href: "/admin/matriculas", label: "Matrículas", icon: CalendarClock },
    { href: "/admin/cortesias", label: "Cortesías", icon: Gift },
    { href: "/admin/facturacion", label: "Facturación (SUNAT)", icon: FileSpreadsheet },
    { href: "/admin/soporte", label: t("support"), icon: LifeBuoy, badgeCount: pendingCount },
    { href: "/admin/sugerencias", label: "Sugerencias", icon: MessageSquarePlus },
    { href: "/admin/certificados", label: t("certificates"), icon: Award },
    { href: "/admin/evaluaciones-pendientes", label: t("pendingReview"), icon: ClipboardCheck },
    { href: "/admin/apariencia", label: t("appearance"), icon: Palette },
    { href: "/admin/asistente-ia", label: "Asistente de IA", icon: Bot },
    { href: "/admin/convenios", label: "Convenios institucionales", icon: Handshake },
    ...(user?.globalRole === "ADMIN" ? [{ href: "/admin/configuracion", label: "Configuración avanzada", icon: Lock }] : []),
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
