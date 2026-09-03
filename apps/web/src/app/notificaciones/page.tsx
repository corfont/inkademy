"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bell } from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { roleHomeHref } from "@/lib/auth";
import { notificationsApi, type NotificationDTO } from "@/lib/api-client";
import { cn } from "@/lib/cn";

const PAGE_SIZE = 20;

/**
 * Bandeja completa (paginada) — ruta única compartida por los 4 roles
 * (campus/admin/docente/empresa), fuera de cualquier route group con
 * layout propio. La campana del header (NotificationBell) enlaza acá para
 * "Ver todas".
 */
export default function NotificationsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<NotificationDTO[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    notificationsApi
      .mine({ page, pageSize: PAGE_SIZE })
      .then(({ rows: r, total: t }) => {
        setRows(r);
        setTotal(t);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page]);

  async function handleClick(n: NotificationDTO) {
    if (!n.readAt) {
      setRows((prev) => prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
      notificationsApi.markRead(n.id).catch(() => {});
    }
  }

  async function handleMarkAllRead() {
    setRows((prev) => prev.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })));
    await notificationsApi.markAllRead().catch(() => {});
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const homeHref = roleHomeHref(user?.globalRole);

  return (
    <div className="mx-auto min-h-screen max-w-2xl bg-paper px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <Link href={homeHref} className="flex items-center gap-1.5 text-sm font-medium text-ash-600 hover:text-ink-900">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Volver
        </Link>
        <button type="button" onClick={handleMarkAllRead} className="text-sm font-medium text-indigo-600 hover:underline">
          Marcar todas leídas
        </button>
      </div>

      <h1 className="mb-6 flex items-center gap-2 font-serif text-2xl font-semibold text-ink-900">
        <Bell className="h-5 w-5" aria-hidden="true" />
        Notificaciones
      </h1>

      {loading && <p className="py-10 text-center text-sm text-ash-500">Cargando…</p>}
      {!loading && rows.length === 0 && <p className="py-10 text-center text-sm text-ash-500">No tienes notificaciones todavía.</p>}

      <ul className="divide-y divide-paper-border rounded-lg border border-paper-border bg-white">
        {rows.map((n) => {
          const content = (
            <div className={cn("flex gap-3 px-4 py-4", !n.readAt && "bg-violet-400/5")}>
              {!n.readAt && <span className="mt-1.5 h-2 w-2 flex-none rounded-full bg-violet-500" aria-hidden="true" />}
              <div className={cn("min-w-0 flex-1", n.readAt && "pl-5")}>
                <p className="font-medium text-ink-900">{n.title ?? "Notificación"}</p>
                {n.body && <p className="mt-1 text-sm text-ash-600">{n.body}</p>}
                <p className="mt-1.5 text-xs text-ash-400">{new Date(n.createdAt).toLocaleString("es-PE")}</p>
              </div>
            </div>
          );
          return (
            <li key={n.id}>
              {n.url ? (
                <Link href={n.url} onClick={() => handleClick(n)} className="block hover:bg-paper-muted">
                  {content}
                </Link>
              ) : (
                <button type="button" onClick={() => handleClick(n)} className="block w-full text-left hover:bg-paper-muted">
                  {content}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-md px-3 py-1.5 font-medium text-ash-600 hover:bg-paper-muted disabled:cursor-not-allowed disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="text-ash-500">
            Página {page} de {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded-md px-3 py-1.5 font-medium text-ash-600 hover:bg-paper-muted disabled:cursor-not-allowed disabled:opacity-40"
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
}
