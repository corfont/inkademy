import { icons, type LucideIcon } from "lucide-react";

/**
 * Antes casi todo el sitio (áreas temáticas, badges, chips de filtro) se
 * mostraba en tonos grises/neutros (ink/ash/paper) sin ninguna diferencia
 * visual entre categorías — "un diseño muy simple" según feedback directo.
 * Esta paleta asigna un color distinto y determinístico a cada área/entidad
 * (por slug o nombre) usando los colores estándar de Tailwind (ya
 * disponibles sin tocar tailwind.config, que solo hace `extend`), sin
 * necesidad de que el admin configure un color a mano por cada una.
 */
export interface CategoryColor {
  text: string;
  bg: string;
  ring: string;
  solid: string;
  solidText: string;
}

const PALETTE: CategoryColor[] = [
  { text: "text-rose-600", bg: "bg-rose-50", ring: "ring-rose-200", solid: "bg-rose-500", solidText: "text-white" },
  { text: "text-amber-600", bg: "bg-amber-50", ring: "ring-amber-200", solid: "bg-amber-500", solidText: "text-white" },
  { text: "text-emerald-600", bg: "bg-emerald-50", ring: "ring-emerald-200", solid: "bg-emerald-500", solidText: "text-white" },
  { text: "text-sky-600", bg: "bg-sky-50", ring: "ring-sky-200", solid: "bg-sky-500", solidText: "text-white" },
  { text: "text-violet-600", bg: "bg-violet-50", ring: "ring-violet-200", solid: "bg-violet-500", solidText: "text-white" },
  { text: "text-teal-600", bg: "bg-teal-50", ring: "ring-teal-200", solid: "bg-teal-500", solidText: "text-white" },
  { text: "text-orange-600", bg: "bg-orange-50", ring: "ring-orange-200", solid: "bg-orange-500", solidText: "text-white" },
  { text: "text-fuchsia-600", bg: "bg-fuchsia-50", ring: "ring-fuchsia-200", solid: "bg-fuchsia-500", solidText: "text-white" },
  { text: "text-cyan-600", bg: "bg-cyan-50", ring: "ring-cyan-200", solid: "bg-cyan-500", solidText: "text-white" },
  { text: "text-lime-600", bg: "bg-lime-50", ring: "ring-lime-200", solid: "bg-lime-600", solidText: "text-white" },
];

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/** Color determinístico para una clave (slug de área, nombre de empresa, etc.) — la misma clave siempre da el mismo color. */
export function getCategoryColor(key: string): CategoryColor {
  return PALETTE[hashString(key) % PALETTE.length];
}

/** Convierte "message-circle" (como lo guarda el admin) al nombre PascalCase que usa lucide-react ("MessageCircle"). */
export function getLucideIcon(name?: string | null): LucideIcon | null {
  if (!name) return null;
  const pascal = name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
  return (icons as unknown as Record<string, LucideIcon>)[pascal] ?? null;
}
