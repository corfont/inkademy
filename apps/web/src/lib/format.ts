import type { LocalizedText } from "@inkademy/shared";

export function localize(text: LocalizedText | null | undefined, locale: string, fallback = ""): string {
  if (!text) return fallback;
  return text[locale] ?? text.es ?? text.en ?? Object.values(text)[0] ?? fallback;
}

export function formatPrice(amount: string | number, currency: string, locale: string) {
  const value = typeof amount === "string" ? Number(amount) : amount;
  try {
    return new Intl.NumberFormat(locale === "en" ? "en-US" : "es-PE", {
      style: "currency",
      currency: currency || "PEN",
      maximumFractionDigits: value % 1 === 0 ? 0 : 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

export function formatDate(iso: string | Date, locale: string, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" }) {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-PE", opts).format(date);
}

export function formatDateTime(iso: string | Date, locale: string, timezone?: string) {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(date);
}

export function formatDuration(hours: number, locale: string) {
  if (hours < 1) return locale === "en" ? `${Math.round(hours * 60)} min` : `${Math.round(hours * 60)} min`;
  return locale === "en" ? `${hours} h` : `${hours} h`;
}

export const MODALITY_LABEL: Record<string, { es: string; en: string }> = {
  RECORDED: { es: "Grabado", en: "Recorded" },
  LIVE: { es: "En vivo", en: "Live" },
  HYBRID: { es: "Híbrido", en: "Hybrid" },
};

export const TYPE_LABEL: Record<string, { es: string; en: string }> = {
  COURSE: { es: "Curso", en: "Course" },
  WORKSHOP: { es: "Taller", en: "Workshop" },
  SEMINAR: { es: "Seminario", en: "Seminar" },
  MASTERCLASS: { es: "Masterclass", en: "Masterclass" },
  PROGRAM: { es: "Programa", en: "Program" },
  DIPLOMA: { es: "Diplomado", en: "Diploma" },
  CORPORATE_INHOUSE: { es: "In-house corporativo", en: "Corporate in-house" },
};

export const LEVEL_LABEL: Record<string, { es: string; en: string }> = {
  INITIAL: { es: "Inicial", en: "Beginner" },
  INTERMEDIATE: { es: "Intermedio", en: "Intermediate" },
  ADVANCED: { es: "Avanzado", en: "Advanced" },
};
