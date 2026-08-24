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
export function BrandLogo({ className }: { className?: string }) {
  const { logoUrl, logoHeightPx } = useBrandSettings();
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl || "/brand/logo-horizontal.png"}
      alt="Inkademy"
      style={{ height: logoHeightPx, width: "auto" }}
      className={className}
    />
  );
}
