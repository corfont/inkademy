/**
 * Lista curada de Google Fonts que el admin puede elegir en
 * /admin/apariencia (ver AppearanceForm.tsx). Curada a propósito en vez de
 * texto libre: evita construir URLs de Google Fonts con nombres inválidos o
 * arbitrarios, y garantiza que cada opción se vea bien como titular o cuerpo.
 * "Outfit" y "Work Sans" son la tipografía real del manual de marca
 * Inkapitales — ya vienen precompiladas vía next/font (ver layout.tsx) así
 * que elegirlas NO dispara una carga adicional desde Google Fonts.
 */
export const BRAND_FONT_OPTIONS = [
  "Outfit",
  "Work Sans",
  "Inter",
  "Poppins",
  "Roboto",
  "Lato",
  "Montserrat",
  "Nunito",
  "Playfair Display",
  "Merriweather",
] as const;

export type BrandFont = (typeof BRAND_FONT_OPTIONS)[number];

export function isCuratedFont(name: string): name is BrandFont {
  return (BRAND_FONT_OPTIONS as readonly string[]).includes(name);
}

/** URL de Google Fonts para una tipografía curada (ya validada con isCuratedFont). */
export function googleFontHref(name: BrandFont): string {
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name).replace(/%20/g, "+")}:wght@400;500;600;700;800&display=swap`;
}
