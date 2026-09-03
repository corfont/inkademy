/**
 * Editor de autoría SCORM v2 — "que no le falte nada comparado con
 * Articulate/iSpring": el catálogo de 7 tipos de pregunta/interacción
 * estándar de esas herramientas (Verdadero/Falso, Opción única, Opción
 * múltiple, Completar espacio, Emparejar por arrastre, Ordenar por
 * arrastre, Punto caliente), dos de ellos con arrastre real. Fuera de
 * alcance a propósito: ramificación condicional, timeline de animación,
 * grabación de simulaciones — son productos/paradigmas distintos, no "más
 * tipos de diapositiva".
 *
 * Vive en @inkademy/shared (no solo en apps/api) para que la MISMA función
 * sirva tanto para generar el paquete real (apps/api/ScormService) como
 * para la vista previa en vivo del editor (apps/web/ScormBuilder, vía un
 * <iframe srcDoc>) — cero duplicación de la lógica de render/calificación.
 */

// "Selector de idioma en el reproductor" — cada texto de autoría (título,
// enunciado, opciones, instrucciones...) puede tener una traducción por
// idioma; español es el único obligatorio (fallback silencioso para
// cualquier otro que falte, ver L() en el runtime del reproductor).
export type ScormLocale = "es" | "en" | "it" | "fr" | "pt";
export const SCORM_LOCALES: ScormLocale[] = ["es", "en", "it", "fr", "pt"];
export const SCORM_LOCALE_LABEL: Record<ScormLocale, string> = {
  es: "Español",
  en: "English",
  it: "Italiano",
  fr: "Français",
  pt: "Português",
};
export interface ScormLocalizedText {
  es: string;
  en?: string;
  it?: string;
  fr?: string;
  pt?: string;
}
export interface ScormLocalizedStringList {
  es: string[];
  en?: string[];
  it?: string[];
  fr?: string[];
  pt?: string[];
}

// "¿Colores, tipografía, tamaño?" — layout de la imagen dentro de una
// diapositiva de Contenido. Sin `layout` (todo paquete generado antes de
// esto), el render es "image-bottom" — EXACTAMENTE el comportamiento
// legado (imagen siempre al final) — cero riesgo para contenido existente.
// "image-background" es el único que usa `imageBox` (mismo shape que
// HotspotZone: %, arrastrable/redimensionable con el mismo patrón de
// puntero que ya usa esa diapositiva).
export type ContentSlideLayout = "text" | "image-top" | "image-bottom" | "image-left" | "image-right" | "image-background";
export interface ContentSlide {
  id: string;
  type: "content";
  title: ScormLocalizedText;
  body: ScormLocalizedText;
  imageUrl?: string | null;
  layout?: ContentSlideLayout;
  imageBox?: { x: number; y: number; width: number; height: number } | null;
}
export interface TrueFalseSlide {
  id: string;
  type: "true_false";
  question: ScormLocalizedText;
  correctAnswer: boolean;
  explanation?: ScormLocalizedText | null;
  sectionId?: string | null;
}
export interface SingleChoiceSlide {
  id: string;
  type: "single_choice";
  question: ScormLocalizedText;
  options: ScormLocalizedText[];
  correctIndex: number;
  explanation?: ScormLocalizedText | null;
  sectionId?: string | null;
}
export interface MultipleChoiceSlide {
  id: string;
  type: "multiple_choice";
  question: ScormLocalizedText;
  options: ScormLocalizedText[];
  correctIndexes: number[];
  explanation?: ScormLocalizedText | null;
  sectionId?: string | null;
}
export interface FillBlankSlide {
  id: string;
  type: "fill_blank";
  // Contiene "___" (tres guiones bajos) por cada espacio a completar.
  text: ScormLocalizedText;
  // Una entrada por cada "___" en `text`, cada una con sus respuestas aceptadas por idioma.
  blanks: ScormLocalizedStringList[];
  explanation?: ScormLocalizedText | null;
  sectionId?: string | null;
}
export interface MatchingSlide {
  id: string;
  type: "matching";
  instructions?: ScormLocalizedText | null;
  pairs: { left: ScormLocalizedText; right: ScormLocalizedText }[];
  explanation?: ScormLocalizedText | null;
  sectionId?: string | null;
}
export interface OrderingSlide {
  id: string;
  type: "ordering";
  instructions?: ScormLocalizedText | null;
  // En el ORDEN CORRECTO — se muestra desordenado en tiempo de reproducción.
  items: ScormLocalizedText[];
  explanation?: ScormLocalizedText | null;
  sectionId?: string | null;
}
export interface HotspotZone {
  x: number; // % desde la izquierda
  y: number; // % desde arriba
  width: number; // % del ancho de la imagen
  height: number; // % del alto de la imagen
}
export interface HotspotSlide {
  id: string;
  type: "hotspot";
  question: ScormLocalizedText;
  imageUrl: string;
  zones: HotspotZone[];
  explanation?: ScormLocalizedText | null;
  sectionId?: string | null;
}
export type ScormSlide =
  | ContentSlide
  | TrueFalseSlide
  | SingleChoiceSlide
  | MultipleChoiceSlide
  | FillBlankSlide
  | MatchingSlide
  | OrderingSlide
  | HotspotSlide;

// "Varios exámenes con pesos distintos dentro de un mismo SCORM" — el
// estándar SCORM solo reporta UN puntaje final al LMS (cmi.core.score.raw),
// así que la ponderación entre "sub-exámenes" tiene que resolverse ACÁ
// DENTRO, antes de reportar. Cada Sección agrupa preguntas y define su
// peso; el puntaje final = promedio ponderado de las secciones. Opcional:
// si `sections` viene vacío/ausente (todo paquete generado antes de esto),
// el cálculo es exactamente el de siempre (aciertos/total sin ponderar) —
// cero riesgo para contenido ya existente.
export interface ScormSection {
  id: string;
  title: ScormLocalizedText;
  weightPercent: number;
}
// "¿Puedo poner colores, tipos de letra, tamaño, como lo hacen los
// mejores?" — un paquete SCORM debe ser 100% autocontenido (se reproduce
// offline/en un iframe aislado), así que la tipografía tiene dos familias
// posibles: `system` (pilas del sistema operativo, cero red, siempre
// disponibles) o `embedded` (una de las 10 tipografías de marca que ya usa
// el resto de Inkademy — ver BRAND_FONT_OPTIONS en apps/web — pero
// incrustada como datos al generar el paquete real, ver
// apps/api/scorm/embed-google-font.ts, para no romper la portabilidad).
// Sin `theme` (todo paquete generado antes de esto), se usa
// DEFAULT_SCORM_THEME — pixel-idéntico al render fijo que había hasta
// ahora, cero riesgo para contenido existente.
export type ScormFontFamilyKind = "system" | "embedded";
export interface ScormTheme {
  primaryColor: string;
  correctColor: string;
  incorrectColor: string;
  backgroundColor: string;
  cardColor: string;
  textColor: string;
  fontFamily: string; // stack CSS completo, con fallback ya incluido
  fontFamilyKind: ScormFontFamilyKind;
  fontScale: "sm" | "md" | "lg";
  cardStyle: "rounded" | "square";
  headerImageUrl?: string | null;
}
export const DEFAULT_SCORM_THEME: ScormTheme = {
  primaryColor: "#23262b",
  correctColor: "#2e7d4f",
  incorrectColor: "#b3261e",
  backgroundColor: "#f7f5f0",
  cardColor: "#ffffff",
  textColor: "#23262b",
  fontFamily: `-apple-system, "Segoe UI", Roboto, sans-serif`,
  fontFamilyKind: "system",
  fontScale: "md",
  cardStyle: "rounded",
  headerImageUrl: null,
};

export const SCORM_SYSTEM_FONTS: { label: string; stack: string }[] = [
  { label: "Sistema (predeterminada)", stack: `-apple-system, "Segoe UI", Roboto, sans-serif` },
  { label: "Georgia (serif clásica)", stack: `Georgia, "Times New Roman", serif` },
  { label: "Verdana (alta legibilidad)", stack: `Verdana, Geneva, sans-serif` },
  { label: "Trebuchet (moderna)", stack: `"Trebuchet MS", sans-serif` },
  { label: "Courier (monoespaciada)", stack: `"Courier New", Courier, monospace` },
];

// Mismos 10 nombres que BRAND_FONT_OPTIONS (apps/web/src/lib/brand-fonts.ts)
// — consistencia de marca con el resto de la plataforma. `googleName` es el
// nombre exacto para pedirlo a la API CSS2 de Google Fonts al generar el
// paquete (embed-google-font.ts); `stack` es el fallback si la incrustación
// falla o mientras carga en la vista previa.
export const SCORM_EMBEDDABLE_FONTS: { label: string; googleName: string; stack: string }[] = [
  { label: "Outfit", googleName: "Outfit", stack: `"Outfit", -apple-system, sans-serif` },
  { label: "Work Sans", googleName: "Work Sans", stack: `"Work Sans", -apple-system, sans-serif` },
  { label: "Inter", googleName: "Inter", stack: `"Inter", -apple-system, sans-serif` },
  { label: "Poppins", googleName: "Poppins", stack: `"Poppins", -apple-system, sans-serif` },
  { label: "Roboto", googleName: "Roboto", stack: `"Roboto", -apple-system, sans-serif` },
  { label: "Lato", googleName: "Lato", stack: `"Lato", -apple-system, sans-serif` },
  { label: "Montserrat", googleName: "Montserrat", stack: `"Montserrat", -apple-system, sans-serif` },
  { label: "Nunito", googleName: "Nunito", stack: `"Nunito", -apple-system, sans-serif` },
  { label: "Playfair Display", googleName: "Playfair Display", stack: `"Playfair Display", Georgia, serif` },
  { label: "Merriweather", googleName: "Merriweather", stack: `"Merriweather", Georgia, serif` },
];

export interface ScormThemePresetSummary {
  id: string;
  name: string;
  theme: ScormTheme;
  builtin: boolean;
}
// 4 puntos de partida siempre disponibles, sin ida y vuelta a la API — el
// admin puede aplicar uno y seguir personalizando, o guardar los suyos
// propios (ver ScormThemePreset en Prisma, catálogo del equipo).
export const BUILTIN_SCORM_THEME_PRESETS: ScormThemePresetSummary[] = [
  {
    id: "builtin-inkademy",
    name: "Inkademy",
    builtin: true,
    theme: { ...DEFAULT_SCORM_THEME, primaryColor: "#183167", correctColor: "#277c54", incorrectColor: "#bc2e24", backgroundColor: "#f7f5f0", cardColor: "#ffffff", textColor: "#1c2331" },
  },
  {
    id: "builtin-corporativo",
    name: "Corporativo índigo",
    builtin: true,
    theme: { ...DEFAULT_SCORM_THEME, primaryColor: "#3241ae", correctColor: "#277c54", incorrectColor: "#bc2e24", backgroundColor: "#eef0fb", cardColor: "#ffffff", textColor: "#1f2340", fontFamily: SCORM_EMBEDDABLE_FONTS[2].stack, fontFamilyKind: "embedded" },
  },
  {
    id: "builtin-alto-contraste",
    name: "Alto contraste",
    builtin: true,
    theme: { ...DEFAULT_SCORM_THEME, primaryColor: "#000000", correctColor: "#0a6b2f", incorrectColor: "#a10f0f", backgroundColor: "#ffffff", cardColor: "#ffffff", textColor: "#000000", cardStyle: "square" },
  },
  {
    id: "builtin-calido-serif",
    name: "Cálido serif",
    builtin: true,
    theme: { ...DEFAULT_SCORM_THEME, primaryColor: "#7a501f", correctColor: "#2e7d4f", incorrectColor: "#b3261e", backgroundColor: "#faf3e8", cardColor: "#fffdf8", textColor: "#3a2d1c", fontFamily: SCORM_EMBEDDABLE_FONTS[9].stack, fontFamilyKind: "embedded" },
  },
];

export interface ScormAuthoredContent {
  slides: ScormSlide[];
  passingScore: number;
  sections?: ScormSection[];
  theme?: ScormTheme;
}

// "Migración perezosa" — contenido creado ANTES del selector de idioma tiene
// sus campos de texto como `string` plano en vez de ScormLocalizedText. En
// vez de una migración de base de datos, se normaliza EN MEMORIA cada vez
// que se lee/renderiza (buildScormContentHtml la llama como primera línea).
// Idempotente: si ya viene como { es: ... }, se deja tal cual.
function wrapText(v: unknown): ScormLocalizedText | undefined {
  if (v == null) return undefined;
  if (typeof v === "string") return { es: v };
  if (typeof v === "object" && v !== null && "es" in (v as Record<string, unknown>)) return v as ScormLocalizedText;
  // Forma inesperada (ni string ni ya-localizado) — se envuelve como string vacío para no reventar el render.
  return { es: "" };
}
function wrapTextRequired(v: unknown): ScormLocalizedText {
  return wrapText(v) ?? { es: "" };
}
function wrapList(v: unknown): ScormLocalizedStringList {
  if (Array.isArray(v)) return { es: v as string[] };
  if (typeof v === "object" && v !== null && "es" in (v as Record<string, unknown>)) return v as ScormLocalizedStringList;
  return { es: [] };
}

export function normalizeScormAuthoredContent(raw: any): ScormAuthoredContent {
  if (!raw || typeof raw !== "object") return raw;
  const slides: ScormSlide[] = Array.isArray(raw.slides)
    ? raw.slides.map((slide: any) => {
        if (!slide || typeof slide !== "object") return slide;
        switch (slide.type) {
          case "content":
            return { ...slide, title: wrapTextRequired(slide.title), body: wrapTextRequired(slide.body) };
          case "true_false":
            return { ...slide, question: wrapTextRequired(slide.question), explanation: slide.explanation != null ? wrapText(slide.explanation) : slide.explanation };
          case "single_choice":
          case "multiple_choice":
            return {
              ...slide,
              question: wrapTextRequired(slide.question),
              options: Array.isArray(slide.options) ? slide.options.map((o: unknown) => wrapTextRequired(o)) : slide.options,
              explanation: slide.explanation != null ? wrapText(slide.explanation) : slide.explanation,
            };
          case "fill_blank":
            return {
              ...slide,
              text: wrapTextRequired(slide.text),
              blanks: Array.isArray(slide.blanks) ? slide.blanks.map((b: unknown) => wrapList(b)) : slide.blanks,
              explanation: slide.explanation != null ? wrapText(slide.explanation) : slide.explanation,
            };
          case "matching":
            return {
              ...slide,
              instructions: slide.instructions != null ? wrapText(slide.instructions) : slide.instructions,
              pairs: Array.isArray(slide.pairs)
                ? slide.pairs.map((p: any) => ({ left: wrapTextRequired(p?.left), right: wrapTextRequired(p?.right) }))
                : slide.pairs,
              explanation: slide.explanation != null ? wrapText(slide.explanation) : slide.explanation,
            };
          case "ordering":
            return {
              ...slide,
              instructions: slide.instructions != null ? wrapText(slide.instructions) : slide.instructions,
              items: Array.isArray(slide.items) ? slide.items.map((it: unknown) => wrapTextRequired(it)) : slide.items,
              explanation: slide.explanation != null ? wrapText(slide.explanation) : slide.explanation,
            };
          case "hotspot":
            return {
              ...slide,
              question: wrapTextRequired(slide.question),
              explanation: slide.explanation != null ? wrapText(slide.explanation) : slide.explanation,
            };
          default:
            return slide;
        }
      })
    : raw.slides;
  const sections: ScormSection[] | undefined = Array.isArray(raw.sections)
    ? raw.sections.map((sec: any) => ({ ...sec, title: wrapTextRequired(sec.title) }))
    : raw.sections;
  return { ...raw, slides, sections };
}

export const SCORM_SLIDE_TYPE_LABEL: Record<ScormSlide["type"], string> = {
  content: "Contenido",
  true_false: "Verdadero/Falso",
  single_choice: "Opción única",
  multiple_choice: "Opción múltiple",
  fill_blank: "Completar espacio",
  matching: "Emparejar (arrastre)",
  ordering: "Ordenar (arrastre)",
  hotspot: "Punto caliente",
};

/**
 * La analítica (cmi.interactions.n.type) usa el vocabulario ESTÁNDAR de SCORM, no los 8 tipos
 * internos de arriba — por eso "single_choice" y "multiple_choice" se reportan igual ("choice"),
 * como en cualquier LMS, y ese es el mismo type que llega a LessonProgress.scormInteractions.
 */
export const SCORM_INTERACTION_TYPE_LABEL: Record<string, string> = {
  "true-false": "Verdadero/Falso",
  choice: "Opción (única o múltiple)",
  "fill-in": "Completar espacio",
  matching: "Emparejar",
  sequencing: "Ordenar",
  performance: "Punto caliente",
  likert: "Escala",
  numeric: "Numérico",
  other: "Otro",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

// JSON dentro de un <script> — escapar TODOS los "<" como \u003c (no solo
// "</script") es la única forma de que ningún texto escrito por el admin
// pueda cerrar la etiqueta <script> a la mitad y romper el HTML generado.
function safeJsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/**
 * Manifest mínimo SCORM 1.2 — una organización, un item, un resource
 * apuntando a index.html. Misma forma que ScormService.parseManifest sabe
 * leer (organizations/organization/item/identifierref, resources/resource/
 * @href) por si este mismo paquete se re-ingresa alguna vez por la subida normal.
 */
export function buildScormManifestXml(lessonId: string, title: string): string {
  const safeTitle = escapeHtml(title);
  return `<?xml version="1.0" standalone="no" ?>
<manifest identifier="INKADEMY-${escapeHtml(lessonId)}" version="1"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="ORG-1">
    <organization identifier="ORG-1">
      <title>${safeTitle}</title>
      <item identifier="ITEM-1" identifierref="RES-1">
        <title>${safeTitle}</title>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="RES-1" type="webcontent" adlcp:scormtype="sco" href="index.html">
      <file href="index.html"/>
    </resource>
  </resources>
</manifest>
`;
}

/**
 * El contenido reproducible — un HTML autocontenido (sin dependencias
 * externas, para que el .zip exportado funcione en cualquier LMS sin
 * conexión a Inkademy) con: los 8 tipos de diapositiva, arrastre real
 * (puntero, no HTML5 DnD nativo — no funciona bien en táctil) para
 * Emparejar/Ordenar, reporte de CADA respuesta a cmi.interactions (no solo
 * el puntaje final), y reanudar por cmi.core.lesson_location/cmi.location.
 * Busca la API SCORM subiendo por window.parent — el mismo findAPI() que
 * usa cualquier paquete de terceros. Si no encuentra ninguna (p.ej. la
 * vista previa en vivo del editor, servida suelta en un iframe), sigue
 * funcionando igual: todo apiCall(...) es no-op seguro.
 */
export function buildScormContentHtml(content: ScormAuthoredContent, title: string, embeddedFontFaceCss?: string | null): string {
  content = normalizeScormAuthoredContent(content);
  const dataJson = safeJsonForScript(content);
  const safeTitle = escapeHtml(title);
  const theme = content.theme ?? DEFAULT_SCORM_THEME;
  const radius = theme.cardStyle === "square" ? "2px" : "10px";
  const radiusSm = theme.cardStyle === "square" ? "0px" : "6px";
  const scale = theme.fontScale === "sm" ? 0.9 : theme.fontScale === "lg" ? 1.15 : 1;

  // Tipografía de marca (Google Fonts): en el paquete REAL (apps/api ya
  // resolvió `embeddedFontFaceCss` descargando y empotrando el .woff2 como
  // data-URI, ver embed-google-font.ts — el .zip queda 100% autocontenido).
  // En la vista previa en vivo del navegador (sin ese parámetro), se pide
  // normal a Google Fonts — best-effort, si falla cae al fallback del stack
  // sin romper nada; la vista previa no necesita ser offline, solo el
  // paquete exportado.
  let fontFaceHtml = "";
  if (theme.fontFamilyKind === "embedded") {
    if (embeddedFontFaceCss) {
      fontFaceHtml = `<style>${embeddedFontFaceCss}</style>`;
    } else {
      const match = SCORM_EMBEDDABLE_FONTS.find((f) => theme.fontFamily.includes(f.googleName));
      const googleName = match?.googleName;
      if (googleName) {
        const familyParam = encodeURIComponent(googleName).replace(/%20/g, "+");
        fontFaceHtml = `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${familyParam}:wght@400;700&display=swap" />`;
      }
    }
  }

  const headerHtml = theme.headerImageUrl
    ? `<header class="scorm-header"><img src="${escapeHtml(theme.headerImageUrl)}" alt="" /></header>`
    : "";

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${safeTitle}</title>
${fontFaceHtml}
<style>
  :root {
    color-scheme: light;
    --scorm-primary: ${theme.primaryColor};
    --scorm-correct: ${theme.correctColor};
    --scorm-incorrect: ${theme.incorrectColor};
    --scorm-bg: ${theme.backgroundColor};
    --scorm-card: ${theme.cardColor};
    --scorm-text: ${theme.textColor};
    --scorm-border: color-mix(in srgb, var(--scorm-text) 15%, var(--scorm-card));
    --scorm-muted: color-mix(in srgb, var(--scorm-text) 55%, var(--scorm-card));
    --scorm-correct-bg: color-mix(in srgb, var(--scorm-correct) 15%, var(--scorm-card));
    --scorm-incorrect-bg: color-mix(in srgb, var(--scorm-incorrect) 15%, var(--scorm-card));
    --scorm-pool-bg: color-mix(in srgb, var(--scorm-text) 6%, var(--scorm-card));
    --scorm-radius: ${radius};
    --scorm-radius-sm: ${radiusSm};
    --scorm-font: ${theme.fontFamily};
    --scorm-scale: ${scale};
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; min-height: 100%; background: var(--scorm-bg); font-family: var(--scorm-font); color: var(--scorm-text); font-size: calc(16px * var(--scorm-scale)); }
  .scorm-header { background: var(--scorm-card); border-bottom: 1px solid var(--scorm-border); padding: 10px 20px; text-align: center; }
  .scorm-header img { max-height: 40px; max-width: 220px; }
  .wrap { max-width: 760px; margin: 0 auto; padding: 32px 20px 96px; }
  .bar { position: fixed; top: 0; left: 0; right: 0; height: 4px; background: var(--scorm-border); z-index: 50; }
  .bar-fill { height: 100%; background: var(--scorm-primary); transition: width .3s; }
  .locale-bar { position: fixed; top: 8px; right: 10px; z-index: 51; }
  .locale-select { font: inherit; font-size: calc(.8rem * var(--scorm-scale)); border: 1px solid var(--scorm-border); border-radius: var(--scorm-radius-sm); background: var(--scorm-card); color: var(--scorm-text); padding: 4px 8px; cursor: pointer; }
  h1 { font-size: calc(1.4rem * var(--scorm-scale)); margin: 0 0 12px; }
  p { line-height: 1.6; white-space: pre-wrap; }
  img.slide-image { max-width: 100%; border-radius: var(--scorm-radius); margin-top: 12px; }
  .card { background: var(--scorm-card); border: 1px solid var(--scorm-border); border-radius: var(--scorm-radius); padding: 24px; box-shadow: 0 1px 8px rgba(0,0,0,.05); }
  .options { display: flex; flex-direction: column; gap: 8px; margin-top: 16px; }
  .option { display: flex; align-items: center; gap: 10px; border: 1px solid var(--scorm-border); border-radius: var(--scorm-radius-sm); padding: 10px 14px; cursor: pointer; }
  .option.correct { border-color: var(--scorm-correct); background: var(--scorm-correct-bg); }
  .option.wrong { border-color: var(--scorm-incorrect); background: var(--scorm-incorrect-bg); }
  .option input { accent-color: var(--scorm-primary); }
  .feedback { margin-top: 14px; font-size: calc(.9rem * var(--scorm-scale)); }
  .feedback.ok { color: var(--scorm-correct); }
  .feedback.bad { color: var(--scorm-incorrect); }
  .nav { display: flex; justify-content: space-between; margin-top: 28px; }
  button { font: inherit; border: none; border-radius: var(--scorm-radius-sm); padding: 10px 20px; cursor: pointer; }
  button.primary { background: var(--scorm-primary); color: #fff; }
  button.primary:disabled { opacity: .4; cursor: not-allowed; }
  button.ghost { background: transparent; color: var(--scorm-text); text-decoration: underline; padding: 10px 4px; }
  .result-score { font-size: calc(2.4rem * var(--scorm-scale)); font-weight: 700; margin: 8px 0; }
  .result-score.pass { color: var(--scorm-correct); }
  .result-score.fail { color: var(--scorm-incorrect); }
  .section-breakdown { list-style: none; padding: 0; margin: 8px 0; font-size: calc(.85rem * var(--scorm-scale)); color: var(--scorm-muted); }
  .section-breakdown li { padding: 2px 0; }
  .blank-input { border: none; border-bottom: 2px solid var(--scorm-text); font: inherit; padding: 2px 4px; width: 8em; text-align: center; background: transparent; color: var(--scorm-text); }
  .blank-input.correct { border-color: var(--scorm-correct); color: var(--scorm-correct); }
  .blank-input.wrong { border-color: var(--scorm-incorrect); color: var(--scorm-incorrect); }
  .match-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  .match-left { flex: 1; border: 1px solid var(--scorm-border); border-radius: var(--scorm-radius-sm); padding: 8px 12px; }
  .match-slot { flex: 1; min-height: 42px; border: 2px dashed var(--scorm-border); border-radius: var(--scorm-radius-sm); padding: 6px 10px; display: flex; align-items: center; justify-content: space-between; gap: 6px; }
  .match-slot.filled { border-style: solid; background: var(--scorm-pool-bg); }
  .match-slot.correct { border-color: var(--scorm-correct); background: var(--scorm-correct-bg); }
  .match-slot.wrong { border-color: var(--scorm-incorrect); background: var(--scorm-incorrect-bg); }
  .match-pool { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; min-height: 48px; padding: 8px; border-radius: var(--scorm-radius-sm); background: var(--scorm-pool-bg); }
  .chip { background: var(--scorm-card); border: 1px solid var(--scorm-border); border-radius: var(--scorm-radius-sm); padding: 8px 12px; cursor: grab; user-select: none; touch-action: none; color: var(--scorm-text); }
  .chip.dragging { position: fixed; z-index: 100; box-shadow: 0 4px 16px rgba(0,0,0,.2); pointer-events: none; }
  .remove-x { cursor: pointer; color: var(--scorm-muted); font-weight: 700; padding: 0 4px; }
  .order-list { list-style: none; margin: 16px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .order-item { display: flex; align-items: center; gap: 10px; border: 1px solid var(--scorm-border); border-radius: var(--scorm-radius-sm); padding: 10px 12px; background: var(--scorm-card); }
  .order-item.dragging { opacity: .4; }
  .drag-handle { cursor: grab; touch-action: none; color: var(--scorm-muted); }
  .hotspot-wrap { position: relative; display: inline-block; max-width: 100%; margin-top: 12px; }
  .hotspot-wrap img { max-width: 100%; border-radius: var(--scorm-radius); display: block; }
  .hotspot-marker { position: absolute; width: 18px; height: 18px; margin-left: -9px; margin-top: -9px; border-radius: 50%; background: var(--scorm-primary); border: 2px solid var(--scorm-card); box-shadow: 0 0 0 2px var(--scorm-primary); }
  .hotspot-zone { position: absolute; border: 2px solid var(--scorm-correct); background: color-mix(in srgb, var(--scorm-correct) 15%, transparent); border-radius: var(--scorm-radius-sm); }
  .content-layout { display: flex; flex-direction: column; gap: 16px; }
  .content-layout.image-left, .content-layout.image-right { flex-direction: row; align-items: flex-start; }
  .content-layout.image-right { flex-direction: row-reverse; }
  .content-layout .content-image { flex: 0 0 38%; }
  .content-layout .content-image img { width: 100%; }
  .content-layout .content-text { flex: 1; min-width: 0; }
  .content-bg-wrap { position: relative; border-radius: var(--scorm-radius); overflow: hidden; min-height: 240px; }
  .content-bg-wrap img.slide-bg { position: absolute; object-fit: cover; margin: 0; border-radius: 0; }
  .content-bg-wrap .content-text-overlay { position: relative; z-index: 1; background: color-mix(in srgb, var(--scorm-card) 88%, transparent); padding: 20px; border-radius: var(--scorm-radius); margin: 16px; }
</style>
</head>
<body>
${headerHtml}
<div class="bar"><div class="bar-fill" id="bar-fill" style="width:0%"></div></div>
<div class="locale-bar"><select id="locale-select" class="locale-select" aria-label="Idioma / Language"></select></div>
<div class="wrap"><div class="card" id="app">Cargando…</div></div>
<script>
(function () {
  "use strict";
  var DATA = ${dataJson};
  var slides = DATA.slides;
  var passingScore = DATA.passingScore;
  var current = 0;
  var answers = {};
  var revealed = {};
  var finished = false;
  var interactionLog = {}; // slideId -> { id, type, response, correct }

  // ============ Selector de idioma (es/en/it/fr/pt) ============
  // Diccionario fijo de UI (no viene de DATA — son las mismas 15 frases del
  // reproductor en sí, no contenido de autoría). "es" es el único con
  // garantía de estar completo; L() más abajo cae a español si algo falta.
  var UI_STRINGS = {
    es: { next: "Siguiente", finish: "Finalizar", verify: "Verificar", back: "Atrás",
          correct: "✓ Correcto.", incorrect: "✗ Incorrecto.", result: "Resultado",
          passed: "Aprobado.", failedTpl: "No alcanzaste la nota mínima ({{score}}%).",
          scoreOfTpl: "{{correct}} de {{total}} respuestas correctas.",
          trueLabel: "Verdadero", falseLabel: "Falso",
          defaultMatchingInstructions: "Arrastra cada elemento de la derecha sobre su pareja.",
          defaultOrderingInstructions: "Arrastra para poner los elementos en el orden correcto.",
          loading: "Cargando…" },
    en: { next: "Next", finish: "Finish", verify: "Check", back: "Back",
          correct: "✓ Correct.", incorrect: "✗ Incorrect.", result: "Result",
          passed: "Passed.", failedTpl: "You did not reach the minimum score ({{score}}%).",
          scoreOfTpl: "{{correct}} of {{total}} correct answers.",
          trueLabel: "True", falseLabel: "False",
          defaultMatchingInstructions: "Drag each item on the right onto its match.",
          defaultOrderingInstructions: "Drag to put the items in the correct order.",
          loading: "Loading…" },
    it: { next: "Avanti", finish: "Termina", verify: "Verifica", back: "Indietro",
          correct: "✓ Corretto.", incorrect: "✗ Errato.", result: "Risultato",
          passed: "Superato.", failedTpl: "Non hai raggiunto il punteggio minimo ({{score}}%).",
          scoreOfTpl: "{{correct}} risposte corrette su {{total}}.",
          trueLabel: "Vero", falseLabel: "Falso",
          defaultMatchingInstructions: "Trascina ogni elemento a destra sulla sua coppia.",
          defaultOrderingInstructions: "Trascina per mettere gli elementi nell'ordine corretto.",
          loading: "Caricamento…" },
    fr: { next: "Suivant", finish: "Terminer", verify: "Vérifier", back: "Retour",
          correct: "✓ Correct.", incorrect: "✗ Incorrect.", result: "Résultat",
          passed: "Réussi.", failedTpl: "Vous n'avez pas atteint la note minimale ({{score}}%).",
          scoreOfTpl: "{{correct}} réponses correctes sur {{total}}.",
          trueLabel: "Vrai", falseLabel: "Faux",
          defaultMatchingInstructions: "Faites glisser chaque élément de droite vers sa paire.",
          defaultOrderingInstructions: "Faites glisser pour remettre les éléments dans le bon ordre.",
          loading: "Chargement…" },
    pt: { next: "Próximo", finish: "Concluir", verify: "Verificar", back: "Voltar",
          correct: "✓ Correto.", incorrect: "✗ Incorreto.", result: "Resultado",
          passed: "Aprovado.", failedTpl: "Você não atingiu a nota mínima ({{score}}%).",
          scoreOfTpl: "{{correct}} de {{total}} respostas corretas.",
          trueLabel: "Verdadeiro", falseLabel: "Falso",
          defaultMatchingInstructions: "Arraste cada item da direita para o seu par.",
          defaultOrderingInstructions: "Arraste para colocar os itens na ordem correta.",
          loading: "Carregando…" },
  };
  var LOCALE_LABEL = { es: "Español", en: "English", it: "Italiano", fr: "Français", pt: "Português" };
  var LOCALE_ORDER = ["es", "en", "it", "fr", "pt"];
  var localeMemory = null; // respaldo en memoria si localStorage no está disponible (iframe sandbox sin allow-same-origin)
  var locale = "es";

  function readStoredLocale() {
    try {
      return window.localStorage.getItem("inkademy_scorm_locale");
    } catch (e) {
      return localeMemory;
    }
  }
  function writeStoredLocale(v) {
    try {
      window.localStorage.setItem("inkademy_scorm_locale", v);
    } catch (e) {
      localeMemory = v;
    }
  }
  // Fallback silencioso a español si el idioma activo no tiene esa traducción.
  function L(loc) {
    if (typeof loc === "string") return loc;
    return (loc && locale && loc[locale]) || (loc && loc.es) || "";
  }
  function initLocaleSelector() {
    var select = document.getElementById("locale-select");
    if (!select) return;
    select.innerHTML = "";
    LOCALE_ORDER.forEach(function (loc) {
      var opt = document.createElement("option");
      opt.value = loc;
      opt.textContent = LOCALE_LABEL[loc];
      select.appendChild(opt);
    });
    select.value = locale;
    select.addEventListener("change", function () { setLocale(this.value); });
  }
  function setLocale(newLocale) {
    if (!UI_STRINGS[newLocale]) return;
    locale = newLocale;
    document.documentElement.lang = locale;
    writeStoredLocale(locale);
    var select = document.getElementById("locale-select");
    if (select) select.value = locale;
    saveLocation();
    render();
  }
  window.__setLocale = setLocale;

  function findAPI(win) {
    var attempts = 0;
    while (attempts < 500) {
      var found;
      // La vista previa en vivo (admin) corre este mismo contenido en un
      // iframe sandbox="allow-scripts" SIN allow-same-origin a propósito
      // (origen nulo, aislado) — leer .API/.API_1484_11 en un window de
      // otro origen tira SecurityError, no undefined. Sin este try/catch,
      // la vista previa se quedaba trabada en "Cargando…" para siempre.
      try {
        found = win.API_1484_11 || win.API;
      } catch (e) {
        return null;
      }
      if (found) return found;
      if (!win.parent || win.parent === win) return null;
      win = win.parent;
      attempts++;
    }
    return null;
  }
  var api = findAPI(window);
  var is2004 = !!(api && window.API_1484_11 === api);
  function apiCall(name1484, name12, args) {
    if (!api) return null;
    var fn = api[is2004 ? name1484 : name12];
    return fn ? fn.apply(api, args || []) : null;
  }
  apiCall("Initialize", "LMSInitialize", [""]);

  // --- Reanudar: cmi.location (2004) / cmi.core.lesson_location (1.2) ---
  // La ubicación por sí sola solo mueve el cursor a la diapositiva correcta;
  // sin cmi.suspend_data (misma clave en 1.2 y 2004, pensada exactamente para
  // esto) las respuestas ya dadas se perderían en cada recarga y el alumno
  // "reanudaría" con sus preguntas previas calificadas como no respondidas.
  var locationKey = is2004 ? "cmi.location" : "cmi.core.lesson_location";
  var SUSPEND_DATA_KEY = "cmi.suspend_data";
  // Declarada acá (junto a locationKey) pero INVOCADA recién al final del
  // script, justo antes del render() inicial — necesita SCORM_INTERACTION_TYPE
  // y recordInteraction, definidos más abajo; con "var" solo el nombre de esas
  // funciones/objetos se adelanta (hoisting), no su asignación, así que llamar
  // esto antes de tiempo revienta con "Cannot read properties of undefined".
  function restoreState() {
    var saved = apiCall("GetValue", "LMSGetValue", [locationKey]);
    if (saved) {
      var idx = parseInt(saved, 10);
      if (!isNaN(idx) && idx >= 0 && idx < slides.length) current = idx;
    }
    var suspend = apiCall("GetValue", "LMSGetValue", [SUSPEND_DATA_KEY]);
    var suspendLocale = null;
    if (suspend) {
      try {
        var state = JSON.parse(suspend);
        answers = state.answers || {};
        revealed = state.revealed || {};
        suspendLocale = state.locale || null;
      } catch (e) {}
    }
    // Orden de resolución: cmi.suspend_data.locale (si hay LMS y trae algo)
    // -> localStorage (si accesible) -> "es".
    if (suspendLocale && UI_STRINGS[suspendLocale]) {
      locale = suspendLocale;
    } else {
      var stored = readStoredLocale();
      locale = stored && UI_STRINGS[stored] ? stored : "es";
    }
    document.documentElement.lang = locale;
    writeStoredLocale(locale);
    // El objeto cmi se reinicia en cada carga de página — sin re-emitir esto,
    // la analítica (cmi.interactions.n.*) perdería lo respondido antes de
    // cerrar/recargar aunque el puntaje final ya se calcule bien.
    slides.forEach(function (s) {
      if (isQuestionSlide(s) && revealed[s.id]) recordInteraction(s);
    });
  }
  function saveLocation() {
    apiCall("SetValue", "LMSSetValue", [locationKey, String(current)]);
    apiCall("SetValue", "LMSSetValue", [SUSPEND_DATA_KEY, JSON.stringify({ answers: answers, revealed: revealed, locale: locale })]);
    apiCall("Commit", "LMSCommit", [""]);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }
  function arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  function normalizeText(s) {
    return String(s).trim().toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g, "");
  }
  function shuffledIndexes(n) {
    var arr = [];
    for (var i = 0; i < n; i++) arr.push(i);
    for (var j = arr.length - 1; j > 0; j--) {
      var k = Math.floor(Math.random() * (j + 1));
      var tmp = arr[j]; arr[j] = arr[k]; arr[k] = tmp;
    }
    return arr;
  }

  function isQuestionSlide(s) {
    return s.type !== "content";
  }

  // ============ Calificación por tipo ============
  function isCorrect(s) {
    var a = answers[s.id];
    if (a === undefined) return false;
    switch (s.type) {
      case "true_false":
        return a === (s.correctAnswer ? 0 : 1);
      case "single_choice":
        return a === s.correctIndex;
      case "multiple_choice": {
        var sel = (a || []).slice().sort();
        var correct = s.correctIndexes.slice().sort();
        return arraysEqual(sel, correct);
      }
      case "fill_blank": {
        for (var i = 0; i < s.blanks.length; i++) {
          var given = normalizeText((a && a[i]) || "");
          // Lista de respuestas aceptadas del idioma activo, con fallback a español si ese blank no tiene ese idioma.
          var acceptedList = s.blanks[i][locale] || s.blanks[i].es || [];
          var accepted = acceptedList.map(normalizeText);
          if (accepted.indexOf(given) === -1) return false;
        }
        return true;
      }
      case "matching": {
        for (var li = 0; li < s.pairs.length; li++) {
          if (!a || a[li] !== li) return false;
        }
        return true;
      }
      case "ordering":
        return arraysEqual(a, s.items.map(function (_, i) { return i; }));
      case "hotspot":
        if (!a) return false;
        return s.zones.some(function (z) {
          return a.x >= z.x && a.x <= z.x + z.width && a.y >= z.y && a.y <= z.y + z.height;
        });
      default:
        return false;
    }
  }

  function responseText(s) {
    var a = answers[s.id];
    switch (s.type) {
      case "true_false": return a === 0 ? UI_STRINGS[locale].trueLabel : UI_STRINGS[locale].falseLabel;
      case "single_choice": return L(s.options[a]) || "";
      case "multiple_choice": return (a || []).map(function (i) { return L(s.options[i]); }).join(" | ");
      case "fill_blank": return (a || []).join(" | ");
      case "matching": {
        // answers[s.id] es un OBJETO { leftIndex: rightIndex } (asignaciones
        // de arrastre), no un array — se recorre por índice de pares, no con .map.
        var pairsText = [];
        for (var pi = 0; pi < s.pairs.length; pi++) {
          var assignedRight = a ? a[pi] : undefined;
          pairsText.push(L(s.pairs[pi].left) + "=" + (assignedRight != null ? L(s.pairs[assignedRight].right) : "?"));
        }
        return pairsText.join(", ");
      }
      case "ordering": return (a || []).map(function (i) { return L(s.items[i]); }).join(" > ");
      case "hotspot": return a ? Math.round(a.x) + "%," + Math.round(a.y) + "%" : "";
      default: return "";
    }
  }

  // Tipos del vocabulario estándar SCORM para cmi.interactions.n.type —
  // "true-false" | "choice" | "fill-in" | "matching" | "performance" |
  // "sequencing" | "likert" | "numeric".
  var SCORM_INTERACTION_TYPE = {
    true_false: "true-false",
    single_choice: "choice",
    multiple_choice: "choice",
    fill_blank: "fill-in",
    matching: "matching",
    ordering: "sequencing",
    hotspot: "performance",
  };
  function recordInteraction(s) {
    interactionLog[s.id] = { id: s.id, type: s.type, response: responseText(s), correct: isCorrect(s) };
    var idx = Object.keys(interactionLog).length - 1;
    var prefix = "cmi.interactions." + idx + ".";
    apiCall("SetValue", "LMSSetValue", [prefix + "id", s.id]);
    apiCall("SetValue", "LMSSetValue", [prefix + "type", SCORM_INTERACTION_TYPE[s.type] || "other"]);
    apiCall("SetValue", "LMSSetValue", [prefix + "student_response", responseText(s)]);
    apiCall("SetValue", "LMSSetValue", [prefix + "result", isCorrect(s) ? "correct" : "wrong"]);
  }

  // ============ Render por tipo ============
  // "Como lo hacen los mejores" — layout de la imagen dentro de una
  // diapositiva de Contenido. Sin layout (paquetes generados antes de
  // esto), el comportamiento es EXACTAMENTE el legado: imagen al final.
  function renderContent(s) {
    var titleHtml = '<h1>' + escapeHtml(L(s.title)) + '</h1>';
    var bodyHtml = '<p>' + escapeHtml(L(s.body)) + '</p>';
    var layout = s.layout || (s.imageUrl ? "image-bottom" : "text");
    if (!s.imageUrl || layout === "text") return titleHtml + bodyHtml;
    var img = '<img class="slide-image" src="' + escapeHtml(s.imageUrl) + '" alt="" />';
    if (layout === "image-top") return img + titleHtml + bodyHtml;
    if (layout === "image-left" || layout === "image-right") {
      return '<div class="content-layout ' + layout + '"><div class="content-image">' + img + '</div><div class="content-text">' + titleHtml + bodyHtml + '</div></div>';
    }
    if (layout === "image-background") {
      var box = s.imageBox || { x: 0, y: 0, width: 100, height: 100 };
      var style = 'left:' + box.x + '%;top:' + box.y + '%;width:' + box.width + '%;height:' + box.height + '%;';
      return '<div class="content-bg-wrap"><img class="slide-bg" style="' + style + '" src="' + escapeHtml(s.imageUrl) + '" alt="" />' +
        '<div class="content-text-overlay">' + titleHtml + bodyHtml + '</div></div>';
    }
    // "image-bottom" (legado) — imagen siempre al final.
    return titleHtml + bodyHtml + img;
  }

  function renderOptionsQuestion(s, questionText, options, isMulti) {
    var isRevealed = !!revealed[s.id];
    var selected = answers[s.id];
    var selectedSet = isMulti ? (selected || []) : null;
    var correctSet = isMulti ? s.correctIndexes : null;
    var optsHtml = options.map(function (opt, idx) {
      var cls = "option";
      var isSel = isMulti ? selectedSet.indexOf(idx) !== -1 : selected === idx;
      if (isRevealed) {
        var isCorrectOpt = isMulti ? correctSet.indexOf(idx) !== -1 : idx === (s.correctIndex !== undefined ? s.correctIndex : (s.correctAnswer ? 0 : 1));
        if (isCorrectOpt) cls += " correct";
        else if (isSel) cls += " wrong";
      }
      var inputType = isMulti ? "checkbox" : "radio";
      var checked = isSel ? "checked" : "";
      var disabled = isRevealed ? "disabled" : "";
      var handler = isMulti
        ? "window.__toggleMulti('" + s.id + "'," + idx + ")"
        : "window.__onAnswer('" + s.id + "'," + idx + ")";
      return '<label class="' + cls + '"><input type="' + inputType + '" name="q-' + s.id + '" value="' + idx + '" ' + checked + ' ' + disabled + ' onchange="' + handler + '" />' + escapeHtml(L(opt)) + '</label>';
    }).join("");
    return buildQuestionBlock(s, questionText, optsHtml, isRevealed, selected !== undefined && (!isMulti || selectedSet.length > 0));
  }

  function renderTrueFalse(s) {
    return renderOptionsQuestion(s, L(s.question), [UI_STRINGS[locale].trueLabel, UI_STRINGS[locale].falseLabel], false);
  }
  function renderSingleChoice(s) {
    return renderOptionsQuestion(s, L(s.question), s.options, false);
  }
  function renderMultipleChoice(s) {
    return renderOptionsQuestion(s, L(s.question), s.options, true);
  }

  function renderFillBlank(s) {
    var isRevealed = !!revealed[s.id];
    var current_ = answers[s.id] || [];
    var blankIdx = 0;
    var parts = L(s.text).split("___");
    var html = parts.map(function (part, i) {
      var piece = escapeHtml(part);
      if (i === parts.length - 1) return piece;
      var bi = blankIdx++;
      var val = current_[bi] || "";
      var cls = "blank-input";
      if (isRevealed) {
        var acceptedList = s.blanks[bi][locale] || s.blanks[bi].es || [];
        var accepted = acceptedList.map(normalizeText);
        cls += accepted.indexOf(normalizeText(val)) !== -1 ? " correct" : " wrong";
      }
      var disabled = isRevealed ? "disabled" : "";
      return piece + '<input class="' + cls + '" type="text" value="' + escapeHtml(val) + '" ' + disabled + ' oninput="window.__onBlank(\\'' + s.id + '\\',' + bi + ',this.value)" />';
    }).join("");
    var allFilled = s.blanks.every(function (_, i) { return (current_[i] || "").trim().length > 0; });
    return buildQuestionBlock(s, null, '<p>' + html + '</p>', isRevealed, allFilled);
  }

  function renderMatching(s) {
    var isRevealed = !!revealed[s.id];
    var placements = answers[s.id] || {};
    var placedRight = {};
    Object.keys(placements).forEach(function (li) { placedRight[placements[li]] = true; });
    var rows = s.pairs.map(function (pair, li) {
      var ri = placements[li];
      var filled = ri !== undefined && ri !== null;
      var cls = "match-slot" + (filled ? " filled" : "");
      if (isRevealed && filled) cls += (ri === li ? " correct" : " wrong");
      var slotContent = filled
        ? escapeHtml(L(s.pairs[ri].right)) + (isRevealed ? "" : ' <span class="remove-x" onclick="window.__unmatch(\\'' + s.id + '\\',' + li + ')">×</span>')
        : "";
      return '<div class="match-row"><div class="match-left">' + escapeHtml(L(pair.left)) + '</div>' +
        '<div class="' + cls + '" data-drop-left="' + li + '">' + slotContent + '</div></div>';
    }).join("");
    var poolItems = s.pairs.map(function (pair, ri) { return { ri: ri, text: pair.right }; }).filter(function (item) { return !placedRight[item.ri]; });
    var pool = isRevealed ? "" : '<div class="match-pool" id="pool-' + s.id + '">' +
      poolItems.map(function (item) { return '<div class="chip" data-right-index="' + item.ri + '" data-slide="' + s.id + '">' + escapeHtml(L(item.text)) + '</div>'; }).join("") +
      '</div>';
    var allPlaced = Object.keys(placements).length === s.pairs.length;
    return buildQuestionBlock(s, L(s.instructions) || UI_STRINGS[locale].defaultMatchingInstructions, rows + pool, isRevealed, allPlaced);
  }

  function renderOrdering(s) {
    var isRevealed = !!revealed[s.id];
    var arrangement = answers[s.id] || shuffledIndexes(s.items.length);
    answers[s.id] = arrangement;
    var items = arrangement.map(function (origIdx, pos) {
      var correctHere = origIdx === pos;
      var cls = "order-item" + (isRevealed ? (correctHere ? " correct" : " wrong") : "");
      var handle = isRevealed ? "" : '<span class="drag-handle" data-order-slide="' + s.id + '">☰</span>';
      return '<li class="' + cls + '" data-pos="' + pos + '">' + handle + '<span>' + escapeHtml(L(s.items[origIdx])) + '</span></li>';
    }).join("");
    return buildQuestionBlock(s, L(s.instructions) || UI_STRINGS[locale].defaultOrderingInstructions, '<ul class="order-list" id="order-' + s.id + '">' + items + '</ul>', isRevealed, true);
  }

  function renderHotspot(s) {
    var isRevealed = !!revealed[s.id];
    var a = answers[s.id];
    var marker = a ? '<div class="hotspot-marker" style="left:' + a.x + '%;top:' + a.y + '%"></div>' : "";
    var zonesHtml = isRevealed ? s.zones.map(function (z) {
      return '<div class="hotspot-zone" style="left:' + z.x + '%;top:' + z.y + '%;width:' + z.width + '%;height:' + z.height + '%"></div>';
    }).join("") : "";
    var img = '<div class="hotspot-wrap" id="hotspot-' + s.id + '"><img src="' + escapeHtml(s.imageUrl) + '" alt="" draggable="false" />' + marker + zonesHtml + '</div>';
    return buildQuestionBlock(s, L(s.question), img, isRevealed, !!a);
  }

  function buildQuestionBlock(s, questionText, bodyHtml, isRevealed, canVerify) {
    var feedback = "";
    if (isRevealed) {
      var ok = isCorrect(s);
      feedback = '<p class="feedback ' + (ok ? "ok" : "bad") + '">' + (ok ? UI_STRINGS[locale].correct : UI_STRINGS[locale].incorrect) + (s.explanation ? " " + escapeHtml(L(s.explanation)) : "") + '</p>';
    }
    var isLast = current === slides.length - 1;
    var nav = isRevealed
      ? '<div class="nav">' + (current > 0 ? '<button class="ghost" onclick="window.__prev()">' + escapeHtml(UI_STRINGS[locale].back) + '</button>' : '<span></span>') +
        '<button class="primary" onclick="window.__next()">' + escapeHtml(isLast ? UI_STRINGS[locale].finish : UI_STRINGS[locale].next) + '</button></div>'
      : '<div class="nav"><span></span><button class="primary" ' + (canVerify ? "" : "disabled") + ' onclick="window.__verify(\\'' + s.id + '\\')">' + escapeHtml(UI_STRINGS[locale].verify) + '</button></div>';
    var q = questionText ? '<h1>' + escapeHtml(questionText) + '</h1>' : "";
    return q + bodyHtml + feedback + nav;
  }

  function totalQuestions() { return slides.filter(isQuestionSlide).length; }
  function correctCount() { return slides.filter(isQuestionSlide).filter(function (s) { return revealed[s.id] && isCorrect(s); }).length; }

  // "Varios exámenes con pesos distintos dentro de un mismo SCORM" — SCORM
  // solo reporta UN puntaje final al LMS, así que si el admin definió
  // Secciones (con peso), la ponderación se resuelve ACÁ antes de reportar:
  // puntaje = promedio ponderado de (aciertos/total de CADA sección). Sin
  // secciones (todo paquete generado antes de esto), es exactamente el
  // cálculo de siempre — aciertos/total sin ponderar.
  function sectionScores() {
    var sections = DATA.sections || [];
    return sections.map(function (sec) {
      var qs = slides.filter(function (s) { return isQuestionSlide(s) && s.sectionId === sec.id; });
      var correct = qs.filter(function (s) { return revealed[s.id] && isCorrect(s); }).length;
      return { id: sec.id, title: sec.title, weightPercent: sec.weightPercent, total: qs.length, correct: correct, score: qs.length > 0 ? Math.round((correct / qs.length) * 100) : 0 };
    });
  }
  function computeScore() {
    var sections = DATA.sections || [];
    if (sections.length > 0) {
      var secs = sectionScores();
      var totalWeight = 0, weightedSum = 0;
      secs.forEach(function (sec) { weightedSum += sec.score * sec.weightPercent; totalWeight += sec.weightPercent; });
      return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
    }
    var total = totalQuestions();
    var correct = correctCount();
    return total > 0 ? Math.round((correct / total) * 100) : 100;
  }

  function renderResult() {
    var score = computeScore();
    var total = totalQuestions();
    var correct = correctCount();
    var passed = score >= passingScore;
    var sections = DATA.sections || [];
    var breakdown = sections.length > 0
      ? '<ul class="section-breakdown">' + sectionScores().map(function (sec) {
          return '<li>' + escapeHtml(L(sec.title)) + ': ' + sec.correct + '/' + sec.total + ' (' + sec.score + '%, peso ' + sec.weightPercent + '%)</li>';
        }).join("") + '</ul>'
      : "";
    var scoreOfLine = sections.length === 0 && total > 0
      ? UI_STRINGS[locale].scoreOfTpl.replace("{{correct}}", String(correct)).replace("{{total}}", String(total)) + " "
      : "";
    var statusLine = passed ? UI_STRINGS[locale].passed : UI_STRINGS[locale].failedTpl.replace("{{score}}", String(passingScore));
    return '<h1>' + escapeHtml(UI_STRINGS[locale].result) + '</h1><p class="result-score ' + (passed ? "pass" : "fail") + '">' + score + '%</p>' +
      breakdown +
      '<p>' + escapeHtml(scoreOfLine) + escapeHtml(statusLine) + '</p>';
  }

  function canAdvance() {
    var s = slides[current];
    if (!s) return true;
    if (isQuestionSlide(s)) return !!revealed[s.id];
    return true;
  }

  function render() {
    var app = document.getElementById("app");
    var barFill = document.getElementById("bar-fill");
    barFill.style.width = Math.round(((finished ? slides.length : current) / slides.length) * 100) + "%";

    if (finished) {
      app.innerHTML = renderResult();
      reportFinal();
      return;
    }

    // Bug real encontrado en vivo: sin este try/catch, un slide con datos
    // malformados (p.ej. "options" ausente en una pregunta) lanzaba una
    // excepción no capturada acá dentro — el DOM se quedaba congelado en el
    // slide ANTERIOR, sin ningún error visible para el alumno ("la pregunta
    // no aparece"). Ahora se ve un mensaje explícito en vez de una pantalla
    // muda, y el resto del reproductor (barra de progreso, etc.) no queda
    // en un estado a medias.
    try {
      var s = slides[current];
      var body;
      switch (s.type) {
        case "content": body = renderContent(s); break;
        case "true_false": body = renderTrueFalse(s); break;
        case "single_choice": body = renderSingleChoice(s); break;
        case "multiple_choice": body = renderMultipleChoice(s); break;
        case "fill_blank": body = renderFillBlank(s); break;
        case "matching": body = renderMatching(s); break;
        case "ordering": body = renderOrdering(s); break;
        case "hotspot": body = renderHotspot(s); break;
        default: body = "";
      }
      if (s.type === "content") {
        var isLast = current === slides.length - 1;
        body += '<div class="nav">' + (current > 0 ? '<button class="ghost" onclick="window.__prev()">' + escapeHtml(UI_STRINGS[locale].back) + '</button>' : '<span></span>') +
          '<button class="primary" onclick="window.__next()">' + escapeHtml(isLast ? UI_STRINGS[locale].finish : UI_STRINGS[locale].next) + '</button></div>';
      }
      app.innerHTML = body;
      wireInteractiveWidgets(s);
    } catch (err) {
      app.innerHTML = '<div class="card"><p>No se pudo cargar esta pregunta — contacta a soporte.</p></div>';
      if (window.console && window.console.error) window.console.error("[scorm] error al renderizar slide", current, err);
    }
  }

  // ============ Handlers globales (llamados desde HTML inline) ============
  window.__onAnswer = function (slideId, idx) { answers[slideId] = idx; render(); };
  window.__toggleMulti = function (slideId, idx) {
    var arr = (answers[slideId] || []).slice();
    var pos = arr.indexOf(idx);
    if (pos === -1) arr.push(idx); else arr.splice(pos, 1);
    answers[slideId] = arr;
    render();
  };
  window.__onBlank = function (slideId, blankIdx, value) {
    var arr = (answers[slideId] || []).slice();
    arr[blankIdx] = value;
    answers[slideId] = arr;
    // Re-renderizar en cada tecla movería el foco — solo se actualiza el botón "Verificar" a mano.
    var allFilled = slides.find(function (sl) { return sl.id === slideId; }).blanks.every(function (_, i) { return (arr[i] || "").trim().length > 0; });
    var btn = document.querySelector('#app .nav .primary');
    if (btn) btn.disabled = !allFilled;
  };
  window.__unmatch = function (slideId, leftIndex) {
    var placements = Object.assign({}, answers[slideId] || {});
    delete placements[leftIndex];
    answers[slideId] = placements;
    render();
  };
  window.__verify = function (slideId) { revealed[slideId] = true; var s = slides.find(function (sl) { return sl.id === slideId; }); recordInteraction(s); render(); };
  window.__next = function () {
    if (!canAdvance()) return;
    // Bug real: antes se guardaba la ubicación ANTES de avanzar "current",
    // así que cmi.location quedaba un slide atrás del real. Si la sesión
    // terminaba justo ahí sin pasar por beforeunload (que sí vuelve a
    // guardar la posición correcta), un reanudo empezaba un slide atrás.
    if (current === slides.length - 1) { finished = true; } else { current++; }
    saveLocation();
    render();
  };
  window.__prev = function () { if (current > 0) { current--; saveLocation(); render(); } };

  // ============ Widgets con arrastre por puntero (matching/ordering/hotspot) ============
  function wireInteractiveWidgets(s) {
    if (s.type === "matching") wireMatching(s);
    else if (s.type === "ordering") wireOrdering(s);
    else if (s.type === "hotspot") wireHotspot(s);
  }

  function wireMatching(s) {
    if (revealed[s.id]) return;
    var chips = document.querySelectorAll('.chip[data-slide="' + s.id + '"]');
    chips.forEach(function (chip) {
      chip.addEventListener("pointerdown", function (e) {
        e.preventDefault();
        var rightIndex = parseInt(chip.getAttribute("data-right-index"), 10);
        var rect = chip.getBoundingClientRect();
        var offsetX = e.clientX - rect.left, offsetY = e.clientY - rect.top;
        var clone = chip.cloneNode(true);
        clone.classList.add("dragging");
        clone.style.width = rect.width + "px";
        document.body.appendChild(clone);
        function moveAt(clientX, clientY) {
          clone.style.left = (clientX - offsetX) + "px";
          clone.style.top = (clientY - offsetY) + "px";
        }
        moveAt(e.clientX, e.clientY);
        function onMove(ev) { moveAt(ev.clientX, ev.clientY); }
        function onUp(ev) {
          document.removeEventListener("pointermove", onMove);
          document.removeEventListener("pointerup", onUp);
          clone.style.display = "none";
          var target = document.elementFromPoint(ev.clientX, ev.clientY);
          clone.remove();
          var slot = target && target.closest ? target.closest("[data-drop-left]") : null;
          if (slot) {
            var leftIndex = parseInt(slot.getAttribute("data-drop-left"), 10);
            var placements = Object.assign({}, answers[s.id] || {});
            placements[leftIndex] = rightIndex;
            answers[s.id] = placements;
            render();
          }
        }
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
      });
    });
  }

  function wireOrdering(s) {
    if (revealed[s.id]) return;
    var list = document.getElementById("order-" + s.id);
    if (!list) return;
    var handles = list.querySelectorAll(".drag-handle");
    handles.forEach(function (handle) {
      handle.addEventListener("pointerdown", function (e) {
        e.preventDefault();
        var li = handle.closest("li");
        var items = Array.prototype.slice.call(list.children);
        var draggedPos = items.indexOf(li);
        li.classList.add("dragging");
        function onMove(ev) {
          var currentItems = Array.prototype.slice.call(list.children);
          for (var i = 0; i < currentItems.length; i++) {
            var rect = currentItems[i].getBoundingClientRect();
            var mid = rect.top + rect.height / 2;
            if (ev.clientY < mid) {
              if (currentItems[i] !== li) list.insertBefore(li, currentItems[i]);
              return;
            }
          }
          list.appendChild(li);
        }
        function onUp() {
          document.removeEventListener("pointermove", onMove);
          document.removeEventListener("pointerup", onUp);
          li.classList.remove("dragging");
          var newItems = Array.prototype.slice.call(list.children);
          var arrangement = answers[s.id].slice();
          var moved = arrangement[draggedPos];
          arrangement.splice(draggedPos, 1);
          var newPos = newItems.indexOf(li);
          arrangement.splice(newPos, 0, moved);
          answers[s.id] = arrangement;
          render();
        }
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
      });
    });
  }

  function wireHotspot(s) {
    if (revealed[s.id]) return;
    var wrap = document.getElementById("hotspot-" + s.id);
    if (!wrap) return;
    var img = wrap.querySelector("img");
    img.addEventListener("click", function (e) {
      var rect = img.getBoundingClientRect();
      var x = ((e.clientX - rect.left) / rect.width) * 100;
      var y = ((e.clientY - rect.top) / rect.height) * 100;
      answers[s.id] = { x: x, y: y };
      render();
    });
  }

  var finalReported = false;
  function reportFinal() {
    if (finalReported) return;
    finalReported = true;
    var score = computeScore();
    var passed = score >= passingScore;
    if (is2004) {
      apiCall("SetValue", null, ["cmi.completion_status", "completed"]);
      apiCall("SetValue", null, ["cmi.success_status", passed ? "passed" : "failed"]);
      apiCall("SetValue", null, ["cmi.score.raw", String(score)]);
    } else {
      apiCall(null, "LMSSetValue", ["cmi.core.lesson_status", passed ? "passed" : "failed"]);
      apiCall(null, "LMSSetValue", ["cmi.core.score.raw", String(score)]);
    }
    apiCall("Commit", "LMSCommit", [""]);
    apiCall("Terminate", "LMSFinish", [""]);
  }

  window.addEventListener("beforeunload", function () {
    saveLocation();
    if (finished) reportFinal();
  });

  restoreState();
  initLocaleSelector();
  render();
})();
</script>
</body>
</html>`;
}
