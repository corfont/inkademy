"use client";

import { useBrandSettings } from "@/components/providers/BrandSettingsProvider";

/**
 * Reemplaza los <Image src="/brand/logo-horizontal.png" ... className="h-8
 * w-auto"> que antes estaban hardcodeados en Header/Footer/SidebarShell/
 * (auth)/layout/checkout. Ahora lee el logo y su alto de /admin/apariencia
 * (con el logo real de Inkapitales como valor por defecto si nunca se
 * configuró nada). Usa <img> normal en vez de next/image: un logo subido
 * por el admin no tiene un ancho/alto conocido en build time.
 */
export function BrandLogo({ className, maxHeightPx }: { className?: string; maxHeightPx?: number }) {
  const { logoUrl, logoHeightPx } = useBrandSettings();
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl || "/brand/logo-horizontal.png"}
      alt="Inkademy"
      // maxHeightPx acota el logo en espacios angostos (el header móvil) sin
      // depender de que el admin sepa que su "Alto del logo" (pensado para
      // el sidebar de escritorio) también se aplicaba ahí — "el botón menú
      // no aparecía" porque, a 64px, el logo (proporción ancha) empujaba el
      // botón de hamburguesa fuera del viewport en pantallas angostas.
      style={{ height: logoHeightPx, width: "auto", maxHeight: maxHeightPx }}
      className={className}
    />
  );
}
