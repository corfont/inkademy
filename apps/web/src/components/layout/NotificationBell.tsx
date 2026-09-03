"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { notificationsApi, type NotificationDTO } from "@/lib/api-client";
import { cn } from "@/lib/cn";

// Mismo intervalo que PENDING_COUNT_POLL_MS en admin/layout.tsx — no hace
// falta tiempo real, solo que el badge no quede muy desactualizado.
const POLL_MS = 60_000;

/**
 * Campana de notificaciones — vive en SidebarShell (único header
 * compartido entre campus/admin/docente), así que un solo componente
 * cubre los 3 roles. Polling simple en vez de WebSocket: el gateway de
 * soporte (support.gateway.ts) es específico de tickets, no un canal
 * genérico por-usuario — construir eso sería infraestructura nueva para
 * un badge que se actualiza cada 60s sin problema.
 */
export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<NotificationDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    function refreshCount() {
      notificationsApi
        .unreadCount()
        .then(({ count }) => !cancelled && setUnreadCount(count))
        .catch(() => {});
    }
    refreshCount();
    const interval = setInterval(refreshCount, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    notificationsApi
      .mine({ pageSize: 8 })
      .then(({ rows: r, unreadCount: u }) => {
        setRows(r);
        setUnreadCount(u);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  async function handleOpenNotification(n: NotificationDTO) {
    if (!n.readAt) {
      setRows((prev) => prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
      setUnreadCount((c) => Math.max(0, c - 1));
      notificationsApi.markRead(n.id).catch(() => {});
    }
    setOpen(false);
  }

  async function handleMarkAllRead() {
    setRows((prev) => prev.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })));
    setUnreadCount(0);
    await notificationsApi.markAllRead().catch(() => {});
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="Notificaciones"
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-ash-600 hover:bg-paper-muted hover:text-ink-900"
      >
        <Bell className="h-4.5 w-4.5" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-none text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-80 rounded-lg border border-paper-border bg-paper shadow-lg">
          <div className="flex items-center justify-between border-b border-paper-border px-4 py-2.5">
            <span className="text-sm font-semibold text-ink-900">Notificaciones</span>
            {unreadCount > 0 && (
              <button type="button" onClick={handleMarkAllRead} className="text-xs font-medium text-indigo-600 hover:underline">
                Marcar todas leídas
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {loading && <p className="px-4 py-6 text-center text-sm text-ash-500">Cargando…</p>}
            {!loading && rows.length === 0 && <p className="px-4 py-6 text-center text-sm text-ash-500">Sin notificaciones por ahora.</p>}
            {!loading &&
              rows.map((n) => {
                const content = (
                  <div
                    className={cn(
                      "flex gap-2 border-b border-paper-border px-4 py-3 text-sm last:border-0 hover:bg-paper-muted",
                      !n.readAt && "bg-violet-400/5",
                    )}
                  >
                    {!n.readAt && <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-violet-500" aria-hidden="true" />}
                    <div className={cn("min-w-0 flex-1", n.readAt && "pl-3.5")}>
                      <p className="truncate font-medium text-ink-900">{n.title ?? "Notificación"}</p>
                      {n.body && <p className="mt-0.5 line-clamp-2 text-ash-600">{n.body}</p>}
                      <p className="mt-1 text-xs text-ash-400">{new Date(n.createdAt).toLocaleString("es-PE")}</p>
                    </div>
                  </div>
                );
                return n.url ? (
                  <Link key={n.id} href={n.url} onClick={() => handleOpenNotification(n)}>
                    {content}
                  </Link>
                ) : (
                  <button key={n.id} type="button" onClick={() => handleOpenNotification(n)} className="block w-full text-left">
                    {content}
                  </button>
                );
              })}
          </div>
          <Link
            href="/notificaciones"
            onClick={() => setOpen(false)}
            className="block border-t border-paper-border px-4 py-2.5 text-center text-sm font-medium text-indigo-600 hover:bg-paper-muted"
          >
            Ver todas
          </Link>
        </div>
      )}
    </div>
  );
}
