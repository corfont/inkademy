"use client";

import { useEffect, useState } from "react";

/**
 * Contador regresivo real (se actualiza cada segundo) para el vencimiento
 * de un descuento — antes solo se mostraba la fecha límite estática o un
 * "termina en Xh Xmin" calculado una sola vez al cargar la página, sin
 * ticking y sin ocultar la oferta automáticamente al vencer (el admin
 * tenía que refrescar para dejar de ver el % de descuento vencido).
 */
export function useCountdown(expiresAt: string | null | undefined) {
  const target = expiresAt ? new Date(expiresAt).getTime() : null;
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (!target) return;
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [target]);

  if (!target) return { expired: false, label: null as string | null, ready: true };
  // `now` es null en el primer render del servidor/hidratación — se trata
  // como "todavía no vencido" para no parpadear el badge al cargar.
  if (now === null) return { expired: false, label: null as string | null, ready: false };

  const ms = target - now;
  if (ms <= 0) return { expired: true, label: null as string | null, ready: true };

  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  const label = days > 0 ? `${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;

  return { expired: false, label, ready: true };
}
