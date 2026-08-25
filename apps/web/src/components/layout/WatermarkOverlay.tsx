"use client";

import { useBrandSettings } from "@/components/providers/BrandSettingsProvider";

/**
 * Sello de agua de marca sobre TODAS las pantallas — pedido explícito del
 * admin ("un sello de agua, con un logo y calibrar su transparencia y
 * tamaño"). Configurable desde /admin/apariencia; sin `watermarkUrl`
 * configurado no se renderiza nada (comportamiento anterior). `pointer-
 * events: none` para que nunca bloquee clicks/selección de texto debajo.
 */
export function WatermarkOverlay() {
  const { watermarkUrl, watermarkOpacityPct, watermarkSizePercent } = useBrandSettings();
  if (!watermarkUrl) return null;

  const opacity = (watermarkOpacityPct ?? 15) / 100;
  const size = `${watermarkSizePercent ?? 30}vw`;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center"
      style={{ opacity }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={watermarkUrl} alt="" style={{ width: size, maxWidth: "90vw", height: "auto" }} />
    </div>
  );
}
