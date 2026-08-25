import { Video, Radio, Shuffle, GraduationCap, Wrench, Presentation, Award, Sprout, TrendingUp, Flame, type LucideIcon } from "lucide-react";

/**
 * Antes las chips de modalidad/tipo/nivel de CourseCard eran todas iguales
 * (Badge variant="ink"/"outline" — gris sobre gris, sin ninguna diferencia
 * visual). Acá cada valor de un enum acotado (no un texto libre, para eso
 * ya existe category-colors.ts con color por hash) tiene un color e ícono
 * curados a mano porque el significado importa: en vivo debe sentirse
 * distinto de grabado, avanzado distinto de inicial.
 */
export interface OfferingStyle {
  icon: LucideIcon;
  classes: string;
}

export const MODALITY_STYLE: Record<string, OfferingStyle> = {
  RECORDED: { icon: Video, classes: "bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200" },
  LIVE: { icon: Radio, classes: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200" },
  HYBRID: { icon: Shuffle, classes: "bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200" },
};

export const TYPE_STYLE: Record<string, OfferingStyle> = {
  COURSE: { icon: GraduationCap, classes: "bg-ink-50 text-ink-700 ring-1 ring-inset ring-ink-200" },
  WORKSHOP: { icon: Wrench, classes: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200" },
  SEMINAR: { icon: Presentation, classes: "bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-200" },
  MASTERCLASS: { icon: Award, classes: "bg-fuchsia-50 text-fuchsia-700 ring-1 ring-inset ring-fuchsia-200" },
  PROGRAM: { icon: Award, classes: "bg-gold-50 text-gold-700 ring-1 ring-inset ring-gold-200" },
  DIPLOMA: { icon: Award, classes: "bg-gold-50 text-gold-700 ring-1 ring-inset ring-gold-200" },
};

export const LEVEL_STYLE: Record<string, OfferingStyle> = {
  INITIAL: { icon: Sprout, classes: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200" },
  INTERMEDIATE: { icon: TrendingUp, classes: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200" },
  ADVANCED: { icon: Flame, classes: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200" },
};

const FALLBACK_STYLE: OfferingStyle = { icon: GraduationCap, classes: "bg-paper-muted text-ash-700 ring-1 ring-inset ring-paper-border" };

export function offeringStyle(map: Record<string, OfferingStyle>, key: string): OfferingStyle {
  return map[key] ?? FALLBACK_STYLE;
}
