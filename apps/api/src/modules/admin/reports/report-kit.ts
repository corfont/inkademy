import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, degrees, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

/**
 * Kit compartido para los reportes PDF "muy profesionales" que pidió el
 * admin: A4, Trebuchet MS 11pt justificado a ambos lados, márgenes 2.5cm,
 * sello de agua, logo, títulos 14pt, gráficos con título y leyenda. Antes
 * cada reporte (solo existía el financiero) armaba su propio PDF a mano con
 * pdf-lib crudo — esto centraliza layout/tipografía para que todos los
 * reportes nuevos (alumnos, cursos, empresas, etc.) se vean consistentes.
 *
 * Trebuchet MS es una fuente de Microsoft con licencia propia — no se
 * puede redistribuir el .ttf dentro del repo/paquete de despliegue. Por
 * eso se busca en el sistema de archivos del SERVIDOR (configurable con
 * TREBUCHET_FONT_DIR) y, si no está instalada ahí, se usa Helvetica como
 * respaldo silencioso (mismo tamaño/interlineado) en vez de romper el
 * reporte. macOS trae Trebuchet MS de fábrica en /System/Library/Fonts/Supplemental,
 * por eso ese path funciona automáticamente en desarrollo.
 */

const CM = 28.3465;
export const PAGE_WIDTH = 595.28;
export const PAGE_HEIGHT = 841.89;
export const MARGIN = 2.5 * CM;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_RESERVE = 24;

const TREBUCHET_DIRS = [process.env.TREBUCHET_FONT_DIR, "/System/Library/Fonts/Supplemental", "/usr/share/fonts/truetype/trebuchet-ms"].filter(
  Boolean,
) as string[];

interface ReportFonts {
  regular: PDFFont;
  bold: PDFFont;
  usingFallback: boolean;
}

let warnedFallbackFont = false;

function tryReadFont(dir: string, filename: string): Buffer | null {
  const p = join(dir, filename);
  return existsSync(p) ? readFileSync(p) : null;
}

async function loadFonts(doc: PDFDocument, logger?: { warn: (msg: string) => void }): Promise<ReportFonts> {
  for (const dir of TREBUCHET_DIRS) {
    const regularBytes = tryReadFont(dir, "Trebuchet MS.ttf");
    if (!regularBytes) continue;
    const boldBytes = tryReadFont(dir, "Trebuchet MS Bold.ttf") ?? regularBytes;
    return { regular: await doc.embedFont(regularBytes), bold: await doc.embedFont(boldBytes), usingFallback: false };
  }
  if (!warnedFallbackFont) {
    logger?.warn(
      "Trebuchet MS no está instalada en este servidor (buscada en TREBUCHET_FONT_DIR / rutas por defecto) — los reportes PDF usan Helvetica como respaldo. Es una fuente con licencia de Microsoft, no se distribuye en el repo: cópiala al servidor para el formato exacto pedido.",
    );
    warnedFallbackFont = true;
  }
  return {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    usingFallback: true,
  };
}

export interface ReportContext {
  doc: PDFDocument;
  fonts: ReportFonts;
  page: PDFPage;
  y: number;
  pageNumber: number;
  logoImage: PDFImage | null;
  title: string;
  watermarkText: string;
  generatedAt: Date;
}

async function embedLogo(doc: PDFDocument, logoBytes?: Buffer | null): Promise<PDFImage | null> {
  if (!logoBytes) return null;
  try {
    return await doc.embedPng(logoBytes);
  } catch {
    try {
      return await doc.embedJpg(logoBytes);
    } catch {
      return null;
    }
  }
}

function drawWatermark(ctx: ReportContext) {
  const size = 60;
  const width = ctx.fonts.bold.widthOfTextAtSize(ctx.watermarkText, size);
  ctx.page.drawText(ctx.watermarkText, {
    x: (PAGE_WIDTH - width) / 2,
    y: PAGE_HEIGHT / 2,
    size,
    font: ctx.fonts.bold,
    color: rgb(0.85, 0.85, 0.88),
    opacity: 0.35,
    rotate: degrees(35),
  });
}

function drawHeader(ctx: ReportContext) {
  let x = MARGIN;
  const topY = PAGE_HEIGHT - MARGIN + 14;
  if (ctx.logoImage) {
    const h = 28;
    const w = (ctx.logoImage.width / ctx.logoImage.height) * h;
    ctx.page.drawImage(ctx.logoImage, { x, y: topY - h + 6, width: w, height: h });
    x += w + 10;
  } else {
    ctx.page.drawText("INKADEMY", { x, y: topY - 14, size: 13, font: ctx.fonts.bold, color: rgb(0.11, 0.12, 0.22) });
    x += 90;
  }
  ctx.page.drawText(ctx.title, { x, y: topY - 14, size: 10, font: ctx.fonts.regular, color: rgb(0.45, 0.46, 0.52) });
  ctx.page.drawLine({
    start: { x: MARGIN, y: topY - 22 },
    end: { x: PAGE_WIDTH - MARGIN, y: topY - 22 },
    thickness: 0.75,
    color: rgb(0.85, 0.85, 0.88),
  });
}

function drawFooter(ctx: ReportContext) {
  const label = `Inkademy — Generado el ${ctx.generatedAt.toLocaleString("es-PE", { dateStyle: "medium", timeStyle: "short" })} — Página ${ctx.pageNumber}`;
  ctx.page.drawText(label, { x: MARGIN, y: MARGIN / 2, size: 8, font: ctx.fonts.regular, color: rgb(0.55, 0.56, 0.6) });
}

function newPage(ctx: ReportContext) {
  if (ctx.page) drawFooter(ctx);
  ctx.page = ctx.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  ctx.pageNumber += 1;
  drawWatermark(ctx);
  drawHeader(ctx);
  ctx.y = PAGE_HEIGHT - MARGIN - 30;
}

export async function createReport(opts: {
  title: string;
  watermarkText?: string;
  logoBytes?: Buffer | null;
  logger?: { warn: (msg: string) => void };
}): Promise<ReportContext> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fonts = await loadFonts(doc, opts.logger);
  const logoImage = await embedLogo(doc, opts.logoBytes);
  const ctx: ReportContext = {
    doc,
    fonts,
    page: null as never,
    y: 0,
    pageNumber: 0,
    logoImage,
    title: opts.title,
    watermarkText: opts.watermarkText ?? "INKADEMY",
    generatedAt: new Date(),
  };
  newPage(ctx);
  return ctx;
}

export function ensureSpace(ctx: ReportContext, neededHeight: number) {
  if (ctx.y - neededHeight < MARGIN + FOOTER_RESERVE) newPage(ctx);
}

export function drawTitle(ctx: ReportContext, text: string, opts: { gapAfter?: number } = {}) {
  ensureSpace(ctx, 24);
  ctx.page.drawText(text, { x: MARGIN, y: ctx.y, size: 14, font: ctx.fonts.bold, color: rgb(0.11, 0.12, 0.22) });
  ctx.y -= 14 + (opts.gapAfter ?? 10);
}

export function drawSubtitle(ctx: ReportContext, text: string, opts: { gapAfter?: number } = {}) {
  ensureSpace(ctx, 18);
  ctx.page.drawText(text, { x: MARGIN, y: ctx.y, size: 10, font: ctx.fonts.regular, color: rgb(0.45, 0.46, 0.52) });
  ctx.y -= 10 + (opts.gapAfter ?? 12);
}

function wrapWords(font: PDFFont, text: string, size: number, maxWidth: number): string[][] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[][] = [];
  let current: string[] = [];
  let currentWidth = 0;
  const spaceWidth = font.widthOfTextAtSize(" ", size);
  for (const word of words) {
    const wordWidth = font.widthOfTextAtSize(word, size);
    const extra = current.length > 0 ? spaceWidth : 0;
    if (currentWidth + extra + wordWidth > maxWidth && current.length > 0) {
      lines.push(current);
      current = [word];
      currentWidth = wordWidth;
    } else {
      current.push(word);
      currentWidth += extra + wordWidth;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

/** Párrafo justificado a ambos lados (última línea alineada a la izquierda, como cualquier editor de texto real). */
export function drawParagraph(ctx: ReportContext, text: string, opts: { size?: number; justify?: boolean; gapAfter?: number } = {}) {
  const size = opts.size ?? 11;
  const justify = opts.justify ?? true;
  const lineHeight = size * 1.35;
  const lines = wrapWords(ctx.fonts.regular, text, size, CONTENT_WIDTH);
  lines.forEach((words, idx) => {
    ensureSpace(ctx, lineHeight);
    const isLast = idx === lines.length - 1;
    if (justify && !isLast && words.length > 1) {
      const wordsWidth = words.reduce((sum, w) => sum + ctx.fonts.regular.widthOfTextAtSize(w, size), 0);
      const gapWidth = (CONTENT_WIDTH - wordsWidth) / (words.length - 1);
      let x = MARGIN;
      for (const word of words) {
        ctx.page.drawText(word, { x, y: ctx.y, size, font: ctx.fonts.regular, color: rgb(0.15, 0.16, 0.2) });
        x += ctx.fonts.regular.widthOfTextAtSize(word, size) + gapWidth;
      }
    } else {
      ctx.page.drawText(words.join(" "), { x: MARGIN, y: ctx.y, size, font: ctx.fonts.regular, color: rgb(0.15, 0.16, 0.2) });
    }
    ctx.y -= lineHeight;
  });
  ctx.y -= opts.gapAfter ?? 6;
}

export interface TableColumn {
  header: string;
  width: number; // proporción relativa — se normaliza automáticamente
  align?: "left" | "right";
}

/** Tabla con encabezado en negrita, franjas zebra y salto de página automático. */
export function drawTable(ctx: ReportContext, columns: TableColumn[], rows: string[][], opts: { gapAfter?: number } = {}) {
  const totalUnits = columns.reduce((s, c) => s + c.width, 0);
  const widths = columns.map((c) => (c.width / totalUnits) * CONTENT_WIDTH);
  const rowHeight = 16;
  const headerHeight = 20;

  function drawHeaderRow() {
    ensureSpace(ctx, headerHeight + rowHeight);
    ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - headerHeight + 4, width: CONTENT_WIDTH, height: headerHeight, color: rgb(0.11, 0.12, 0.22) });
    let x = MARGIN;
    columns.forEach((col, i) => {
      const size = 9;
      const maxChars = Math.max(3, Math.floor((widths[i] - 12) / (size * 0.6)));
      const text = col.header.length > maxChars ? `${col.header.slice(0, maxChars - 1)}…` : col.header;
      const textWidth = ctx.fonts.bold.widthOfTextAtSize(text, size);
      // El texto NUNCA debe empezar antes de `x + 6` — si no, un encabezado
      // alineado a la derecha más ancho que su columna se desborda hacia
      // ATRÁS, pisando la columna anterior (bug real encontrado probando
      // el reporte de alumnos: "Registrado" y "Cursos matriculados" se
      // superponían porque el header no se truncaba como sí se truncan
      // las celdas del cuerpo).
      const tx = col.align === "right" ? Math.max(x + 6, x + widths[i] - textWidth - 6) : x + 6;
      ctx.page.drawText(text, { x: tx, y: ctx.y - headerHeight + 10, size, font: ctx.fonts.bold, color: rgb(1, 1, 1) });
      x += widths[i];
    });
    ctx.y -= headerHeight;
  }

  drawHeaderRow();
  rows.forEach((row, rowIdx) => {
    if (ctx.y - rowHeight < MARGIN + FOOTER_RESERVE) {
      newPage(ctx);
      drawHeaderRow();
    }
    if (rowIdx % 2 === 1) {
      ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - rowHeight + 4, width: CONTENT_WIDTH, height: rowHeight, color: rgb(0.96, 0.96, 0.97) });
    }
    let x = MARGIN;
    row.forEach((cell, i) => {
      const size = 9;
      const maxChars = Math.max(3, Math.floor(widths[i] / (size * 0.55)));
      const text = cell.length > maxChars ? `${cell.slice(0, maxChars - 1)}…` : cell;
      const textWidth = ctx.fonts.regular.widthOfTextAtSize(text, size);
      const tx = columns[i].align === "right" ? Math.max(x + 6, x + widths[i] - textWidth - 6) : x + 6;
      ctx.page.drawText(text, { x: tx, y: ctx.y - rowHeight + 10, size, font: ctx.fonts.regular, color: rgb(0.15, 0.16, 0.2) });
      x += widths[i];
    });
    ctx.y -= rowHeight;
  });
  ctx.y -= opts.gapAfter ?? 16;
}

export interface BarDatum {
  label: string;
  value: number;
}

/**
 * Gráfico de barras vertical simple, con título propio y leyenda — vector
 * puro (sin librería de charts): suficiente para los reportes tabulares
 * pedidos, sin sumar una dependencia de renderizado pesada.
 */
export function drawBarChart(ctx: ReportContext, opts: { title: string; seriesLabel: string; data: BarDatum[]; height?: number }) {
  const chartHeight = opts.height ?? 160;
  const titleSize = 12;
  ensureSpace(ctx, titleSize + chartHeight + 40);

  ctx.page.drawText(opts.title, { x: MARGIN, y: ctx.y, size: titleSize, font: ctx.fonts.bold, color: rgb(0.11, 0.12, 0.22) });
  ctx.y -= titleSize + 14;

  const data = opts.data.slice(0, 12); // más de 12 barras deja de ser legible en una página A4
  const maxValue = Math.max(1, ...data.map((d) => d.value));
  const chartTop = ctx.y;
  const chartBottom = chartTop - chartHeight;
  const barGap = 10;
  const barWidth = Math.max(14, (CONTENT_WIDTH - barGap * (data.length + 1)) / Math.max(1, data.length));

  ctx.page.drawLine({ start: { x: MARGIN, y: chartBottom }, end: { x: MARGIN + CONTENT_WIDTH, y: chartBottom }, thickness: 1, color: rgb(0.7, 0.7, 0.75) });

  let x = MARGIN + barGap;
  for (const d of data) {
    const barHeight = (d.value / maxValue) * (chartHeight - 20);
    ctx.page.drawRectangle({ x, y: chartBottom, width: barWidth, height: barHeight, color: rgb(0.2, 0.35, 0.75) });
    const valueLabel = String(d.value);
    const valueWidth = ctx.fonts.regular.widthOfTextAtSize(valueLabel, 8);
    ctx.page.drawText(valueLabel, { x: x + barWidth / 2 - valueWidth / 2, y: chartBottom + barHeight + 3, size: 8, font: ctx.fonts.regular, color: rgb(0.15, 0.16, 0.2) });
    const label = d.label.length > 12 ? `${d.label.slice(0, 11)}…` : d.label;
    const labelWidth = ctx.fonts.regular.widthOfTextAtSize(label, 7);
    ctx.page.drawText(label, { x: x + barWidth / 2 - labelWidth / 2, y: chartBottom - 11, size: 7, font: ctx.fonts.regular, color: rgb(0.45, 0.46, 0.52) });
    x += barWidth + barGap;
  }

  ctx.y = chartBottom - 26;
  // Leyenda: un swatch + el nombre de la serie (una sola serie por gráfico en estos reportes).
  ctx.page.drawRectangle({ x: MARGIN, y: ctx.y, width: 9, height: 9, color: rgb(0.2, 0.35, 0.75) });
  ctx.page.drawText(opts.seriesLabel, { x: MARGIN + 14, y: ctx.y + 1, size: 8, font: ctx.fonts.regular, color: rgb(0.35, 0.36, 0.4) });
  ctx.y -= 24;
}

export async function finalizeReport(ctx: ReportContext): Promise<Buffer> {
  drawFooter(ctx);
  const bytes = await ctx.doc.save();
  return Buffer.from(bytes);
}
