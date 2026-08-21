"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { API_URL } from "@/lib/api-client";
import { getClientAccessToken } from "@/lib/auth";

/**
 * Descarga GET /me/calendar.ics (requiere Bearer) y dispara la descarga del
 * archivo en el navegador. No es un enlace simple porque el endpoint exige
 * autenticación; por eso se hace fetch + Blob en vez de <a href> directo.
 */
export function AddToCalendarButton() {
  const t = useTranslations("campus.agenda");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function handleClick() {
    setLoading(true);
    setError(false);
    try {
      const token = getClientAccessToken();
      const res = await fetch(`${API_URL}/me/calendar.ics`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
      });
      if (!res.ok) throw new Error("no-ics");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "inkademy-agenda.ics";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <Button variant="outline" onClick={handleClick} disabled={loading}>
        <CalendarPlus className="h-4 w-4" aria-hidden="true" />
        {t("addToCalendar")}
      </Button>
      {error && <p className="mt-2 text-sm text-danger">No pudimos generar el archivo .ics en este momento.</p>}
    </div>
  );
}
