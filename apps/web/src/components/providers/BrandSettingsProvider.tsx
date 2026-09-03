"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { PlatformSettingsDTO } from "@/lib/api-client";

/**
 * A diferencia de AuthProvider, esto no se vuelve a pedir en el cliente: el
 * root layout (server component) ya trajo /settings una sola vez y lo pasa
 * como prop. Header/Footer/SidebarShell/checkout (todos "use client") lo
 * leen de acá en vez de tener cada uno su propio fetch.
 */
const BrandSettingsContext = createContext<PlatformSettingsDTO | null>(null);

export function BrandSettingsProvider({ settings, children }: { settings: PlatformSettingsDTO; children: ReactNode }) {
  return <BrandSettingsContext.Provider value={settings}>{children}</BrandSettingsContext.Provider>;
}

export function useBrandSettings(): PlatformSettingsDTO {
  const ctx = useContext(BrandSettingsContext);
  if (!ctx) {
    // Nunca debería pasar (BrandSettingsProvider envuelve todo en layout.tsx),
    // pero devolvemos la marca real actual como red de seguridad en vez de reventar.
    return {
      id: "default",
      logoUrl: null,
      logoHeightPx: 64,
      headingFontFamily: "Outfit",
      bodyFontFamily: "Work Sans",
      backgroundColor: null,
      backgroundImageUrl: null,
      contactEmail: "hola@inkademy.com",
      contactPhone: "+51 1 234 5678",
      contactAddress: "Lima, Perú",
      courseCardFields: { showTeacher: true, showDuration: true, showNextLiveSession: true, showCertificationBadge: true, showRating: false },
      watermarkUrl: null,
      watermarkOpacityPct: 15,
      watermarkSizePercent: 30,
    };
  }
  return ctx;
}
