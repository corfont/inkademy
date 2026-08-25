import type { Job } from "bullmq";
import puppeteer from "puppeteer";
import QRCode from "qrcode";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { prisma } from "@inkademy/db";
import type { CertificateGenerateJobData } from "../queues";
import { uploadBuffer, getPublicUrl, getObjectBuffer } from "../lib/storage";
import { createLogger } from "../lib/logger";

const logger = createLogger("certificate.processor");

type LocalizedText = Record<string, string> | null | undefined;

interface TagPosition {
  tag: string;
  xPercent: number;
  yPercent: number;
  fontSizePt?: number;
  color?: string;
  align?: "left" | "center" | "right";
  fontFamily?: "helvetica" | "helvetica-bold" | "times" | "times-bold" | "courier";
  widthPercent?: number;
  heightPercent?: number;
  customText?: string;
  customImageAssetId?: string;
  marginTopPt?: number;
  marginBottomPt?: number;
  marginLeftPt?: number;
  marginRightPt?: number;
  lineHeightMultiplier?: number;
}

const CUSTOM_TAG_PREFIX = "custom:";
function isCustomTag(tag: string): boolean {
  return tag.startsWith(CUSTOM_TAG_PREFIX);
}

// "Tipo de letra" — pedido explícito ("el tipo de letra, tamaño,
// justificado, color y otras funciones necesarias"). Tamaño/color/alineado
// ya existían; tipografía no. Se usan los 14 fonts estándar de PDF (no
// requieren incrustar un archivo .ttf, pdf-lib los trae listos).
const FONT_STANDARD: Record<NonNullable<TagPosition["fontFamily"]>, StandardFonts> = {
  helvetica: StandardFonts.Helvetica,
  "helvetica-bold": StandardFonts.HelveticaBold,
  times: StandardFonts.TimesRoman,
  "times-bold": StandardFonts.TimesRomanBold,
  courier: StandardFonts.Courier,
};

function pickLocale(text: LocalizedText, locale: string): string {
  if (!text) return "";
  return text[locale] ?? text.es ?? Object.values(text)[0] ?? "";
}

function renderPlaceholders(html: string, vars: Record<string, string>): string {
  return html.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => vars[key] ?? "");
}

function hexToRgb01(hex?: string) {
  const clean = (hex ?? "#1c2038").replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const value = parseInt(full || "1c2038", 16);
  return rgb(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255);
}

/** Envuelve texto libre (tags a medida) en líneas que no excedan maxWidthPt, respetando saltos de línea explícitos del admin. */
function wrapText(text: string, font: import("pdf-lib").PDFFont, fontSize: number, maxWidthPt: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, fontSize) > maxWidthPt && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

/** Descarga un asset como Buffer, ya sea una key de S3 (docente/institución) o una URL pública completa (logo). */
async function fetchAssetBuffer(assetIdOrUrl: string): Promise<Buffer> {
  if (assetIdOrUrl.startsWith("http://") || assetIdOrUrl.startsWith("https://")) {
    const res = await fetch(assetIdOrUrl);
    if (!res.ok) throw new Error(`No se pudo descargar ${assetIdOrUrl}: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  return getObjectBuffer(assetIdOrUrl);
}

/**
 * `apps/api` (`CertificateService.checkAndIssueIfEligible`) ya creó la fila
 * `Certificate` — con `finalScore`/`criteriaSnapshot` ya calculados — y ya
 * envió el correo "certificate-ready" (con la URL de verificación, sin
 * esperar el PDF). El trabajo del worker es solo:
 * 1. Resolver la plantilla, el usuario, el curso/programa, el docente (si
 *    aplica) y las firmas (docente/institucional) asociadas.
 * 2. Generar el QR -> {APP_URL}/verificar/{code}.
 * 3. Renderizar el PDF final:
 *    - plantillas HTML: Puppeteer (como antes).
 *    - plantillas con fondo (PDF/PNG/JPG subido por el admin): pdf-lib,
 *      "estampando" cada tag en las coordenadas configuradas en
 *      CertificateTemplate.tagPositions — ver CertificateTemplateManager.tsx.
 * 4. Actualizar `Certificate.pdfAssetId` / `qrUrl`.
 */
export async function processCertificateGenerateJob(job: Job<CertificateGenerateJobData>): Promise<void> {
  const { certificateId } = job.data;

  const certificate = await prisma.certificate.findUnique({
    where: { id: certificateId },
    include: { user: true, course: true, program: true, template: true, enrollment: { include: { company: true } } },
  });

  if (!certificate) {
    logger.warn("certificate no encontrado, se descarta el job", { certificateId });
    return;
  }

  if (certificate.pdfAssetId) {
    logger.info("el certificado ya tiene PDF generado, se omite", { certificateId });
    return;
  }

  const locale = certificate.user.locale ?? "es";
  const offeringTitle = certificate.course?.title ?? certificate.program?.title ?? {};
  const offeringName = pickLocale(offeringTitle as LocalizedText, locale);

  // Misma convención que apps/api/src/modules/certificate/certificate.service.ts
  // (verificationUrl): APP_URL — la página humana del frontend en
  // /verificar/:codigo, no el endpoint JSON de la API.
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const verificationUrl = `${appUrl}/verificar/${certificate.code}`;
  const qrBuffer = await QRCode.toBuffer(verificationUrl, { margin: 1 });
  const qrDataUrl = `data:image/png;base64,${qrBuffer.toString("base64")}`;

  const studentName = certificate.user.displayName ?? `${certificate.user.firstName} ${certificate.user.lastName}`;
  // "Duración, cantidad de horas" — tag pedido explícitamente y que no
  // existía en absoluto antes (el admin no tenía forma de mostrar la
  // duración del curso en el certificado).
  const DURATION_UNIT_ES: Record<string, [string, string]> = {
    HOURS: ["hora", "horas"],
    WEEKS: ["semana", "semanas"],
    MONTHS: ["mes", "meses"],
  };
  const courseDuration = certificate.course
    ? (() => {
        const [singular, plural] = DURATION_UNIT_ES[certificate.course!.durationUnit] ?? DURATION_UNIT_ES.HOURS;
        const hours = certificate.course!.durationHours;
        return `${hours} ${hours === 1 ? singular : plural}`;
      })()
    : "";
  const issuedDate = certificate.issuedAt.toLocaleDateString(locale === "en" ? "en-US" : "es-PE", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Docente del curso (solo aplica a certificados de curso, no de programa).
  // Si hay varios docentes asignados (CourseStaff), se prioriza el rol
  // TEACHER sobre CO_TEACHER/MODERATOR y se toma el primero de ese rol —
  // el certificado muestra un solo nombre de docente, no una lista.
  let teacherName = "";
  let teacherSignatureAssetId: string | null = null;
  if (certificate.courseId) {
    const staff = await prisma.courseStaff.findFirst({
      where: { courseId: certificate.courseId, role: "TEACHER" },
      include: { user: true },
    });
    if (staff) {
      teacherName = staff.user.displayName ?? `${staff.user.firstName} ${staff.user.lastName}`;
      teacherSignatureAssetId = staff.user.signatureAssetId;
    }
  }

  const platformSettings = await prisma.platformSettings.findUnique({ where: { id: "default" } });
  const institutionSignatureAssetId = platformSettings?.institutionSignatureAssetId ?? null;
  const institutionSignatureName = platformSettings?.institutionSignatureName ?? "";
  const institutionSignatureTitle = platformSettings?.institutionSignatureTitle ?? "";
  const logoUrl = platformSettings?.logoUrl || `${appUrl}/brand/logo-horizontal.png`;

  const dateFmt = (d: Date) => d.toLocaleDateString(locale === "en" ? "en-US" : "es-PE", { year: "numeric", month: "long", day: "numeric" });
  // "Fecha de inicio/fin de curso" — Course es un catálogo (sin fechas de
  // cohorte propias); lo que sí tiene fecha real es la matrícula del alumno
  // (Enrollment.enrolledAt/completedAt), que es lo que de verdad varía
  // persona por persona y es lo que un certificado debería reflejar.
  const courseStartDate = certificate.enrollment?.enrolledAt ? dateFmt(certificate.enrollment.enrolledAt) : "";
  const courseEndDate = certificate.enrollment?.completedAt ? dateFmt(certificate.enrollment.completedAt) : issuedDate;
  const companyName = certificate.enrollment?.company?.legalName ?? "";

  // Convenio institucional (3ra firma) — "a veces se tiene un convenio con
  // un instituto o universidad de prestigio, donde debería estar la firma
  // de esa institución también". Solo aplica si el curso tiene un
  // CoursePartnership activo cuyo rango de fechas (si tiene) cubre la
  // emisión del certificado.
  let partnerInstitutionName = "";
  let partnerSignatureName = "";
  let partnerSignatureTitle = "";
  let partnerSignatureAssetId: string | null = null;
  if (certificate.courseId) {
    const partnership = await prisma.coursePartnership.findFirst({
      where: {
        courseId: certificate.courseId,
        partnerInstitution: { active: true },
        OR: [{ startDate: null }, { startDate: { lte: certificate.issuedAt } }],
        AND: [{ OR: [{ endDate: null }, { endDate: { gte: certificate.issuedAt } }] }],
      },
      include: { partnerInstitution: true },
      orderBy: { createdAt: "desc" },
    });
    if (partnership) {
      partnerInstitutionName = partnership.partnerInstitution.name;
      partnerSignatureName = partnership.partnerInstitution.signerName ?? "";
      partnerSignatureTitle = partnership.partnerInstitution.signerTitle ?? "";
      partnerSignatureAssetId = partnership.partnerInstitution.signatureAssetId;
    }
  }

  const textVars: Record<string, string> = {
    studentName,
    companyName,
    courseName: offeringName,
    courseStartDate,
    courseEndDate,
    courseDuration,
    issuedDate,
    finalScore: certificate.finalScore != null ? certificate.finalScore.toFixed(1) : "Aprobado",
    code: certificate.code,
    teacherName,
    institutionSignatureName,
    institutionSignatureTitle,
    partnerInstitutionName,
    partnerSignatureName,
    partnerSignatureTitle,
  };

  let pdfBuffer: Buffer;

  if (certificate.template.sourceType === "BACKGROUND") {
    pdfBuffer = await renderBackgroundTemplate({
      backgroundAssetId: certificate.template.backgroundAssetId,
      backgroundMimeType: certificate.template.backgroundMimeType,
      pageWidthPt: certificate.template.pageWidthPt ?? 841.89,
      pageHeightPt: certificate.template.pageHeightPt ?? 595.28,
      tagPositions: (certificate.template.tagPositions as unknown as TagPosition[] | null) ?? [],
      textVars,
      images: {
        qrDataUrl: qrBuffer,
        teacherSignature: teacherSignatureAssetId,
        institutionSignatureImage: institutionSignatureAssetId,
        partnerSignatureImage: partnerSignatureAssetId,
        logo: logoUrl,
      },
    });
  } else {
    // Modo HTML (Puppeteer): las imágenes se insertan ya como <img> — si no
    // hay firma configurada, el tag se reemplaza por nada (el <img> nunca
    // se renderiza, en vez de mostrar un ícono roto).
    const teacherSignatureUrl = teacherSignatureAssetId ? getPublicUrl(teacherSignatureAssetId) : null;
    const institutionSignatureUrl = institutionSignatureAssetId ? getPublicUrl(institutionSignatureAssetId) : null;
    const partnerSignatureUrl = partnerSignatureAssetId ? getPublicUrl(partnerSignatureAssetId) : null;
    const html = renderPlaceholders(certificate.template.htmlTemplate, {
      ...textVars,
      qrDataUrl,
      appUrl,
      logo: `<img src="${logoUrl}" alt="Inkademy" />`,
      teacherSignature: teacherSignatureUrl ? `<img src="${teacherSignatureUrl}" alt="Firma del docente" />` : "",
      institutionSignatureImage: institutionSignatureUrl ? `<img src="${institutionSignatureUrl}" alt="Firma institucional" />` : "",
      partnerSignatureImage: partnerSignatureUrl ? `<img src="${partnerSignatureUrl}" alt="Firma de la institución del convenio" />` : "",
    });

    const browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle0" });
      pdfBuffer = Buffer.from(await page.pdf({ format: "A4", landscape: true, printBackground: true }));
    } finally {
      await browser.close();
    }
  }

  const upload = await uploadBuffer(`certificates/${certificate.code}.pdf`, pdfBuffer, "application/pdf");

  await prisma.certificate.update({
    where: { id: certificate.id },
    data: { pdfAssetId: upload.assetId, qrUrl: verificationUrl },
  });

  logger.info("PDF de certificado generado", { certificateId, code: certificate.code });
}

/**
 * Genera el PDF para una plantilla con fondo ya diseñado (PDF/PNG/JPG) +
 * tags "estampados" con pdf-lib en las coordenadas configuradas por el
 * admin (ver CertificateTemplateManager.tsx). Si el fondo es un PDF, se
 * reutiliza esa página tal cual (calidad vectorial); si es imagen, se crea
 * una página nueva del tamaño configurado con la imagen de fondo a página completa.
 */
async function renderBackgroundTemplate(opts: {
  backgroundAssetId: string | null;
  backgroundMimeType: string | null;
  pageWidthPt: number;
  pageHeightPt: number;
  tagPositions: TagPosition[];
  textVars: Record<string, string>;
  images: Record<string, string | Buffer | null>;
}): Promise<Buffer> {
  const { backgroundAssetId, backgroundMimeType, tagPositions, textVars, images } = opts;
  if (!backgroundAssetId) throw new Error("La plantilla de tipo BACKGROUND no tiene backgroundAssetId configurado");

  const backgroundBytes = await fetchAssetBuffer(backgroundAssetId);

  let pdfDoc: PDFDocument;
  let page: import("pdf-lib").PDFPage;
  let pageWidth: number;
  let pageHeight: number;

  if (backgroundMimeType === "application/pdf") {
    pdfDoc = await PDFDocument.load(backgroundBytes);
    [page] = pdfDoc.getPages();
    const size = page.getSize();
    pageWidth = size.width;
    pageHeight = size.height;
  } else {
    pdfDoc = await PDFDocument.create();
    pageWidth = opts.pageWidthPt;
    pageHeight = opts.pageHeightPt;
    page = pdfDoc.addPage([pageWidth, pageHeight]);
    const image = backgroundMimeType === "image/png" ? await pdfDoc.embedPng(backgroundBytes) : await pdfDoc.embedJpg(backgroundBytes);
    page.drawImage(image, { x: 0, y: 0, width: pageWidth, height: pageHeight });
  }

  // Se incrustan los 5 fonts una sola vez (barato, son fonts estándar sin
  // archivo real que cargar) y cada tag elige el suyo — antes todo el
  // certificado salía forzosamente en Helvetica sin ninguna opción.
  const fontCache = new Map<string, Awaited<ReturnType<typeof pdfDoc.embedFont>>>();
  async function fontFor(family: TagPosition["fontFamily"]): Promise<Awaited<ReturnType<typeof pdfDoc.embedFont>>> {
    const key = family ?? "helvetica";
    if (!fontCache.has(key)) {
      fontCache.set(key, await pdfDoc.embedFont(FONT_STANDARD[key as NonNullable<TagPosition["fontFamily"]>] ?? StandardFonts.Helvetica));
    }
    return fontCache.get(key)!;
  }

  for (const pos of tagPositions) {
    const custom = isCustomTag(pos.tag);
    const isImageTag = pos.tag in images || (custom && !!pos.customImageAssetId);
    const xPt = (pos.xPercent / 100) * pageWidth;
    // yPercent es "desde arriba" (igual que en la vista previa CSS); pdf-lib
    // dibuja desde abajo-izquierda, por eso se invierte acá.
    const yFromTop = (pos.yPercent / 100) * pageHeight;

    if (isImageTag) {
      const source = custom ? pos.customImageAssetId ?? null : images[pos.tag];
      if (!source) continue; // no configurado (p.ej. no hay firma de docente) — se omite, no rompe el resto
      const widthPt = ((pos.widthPercent ?? 15) / 100) * pageWidth;
      const heightPt = ((pos.heightPercent ?? 8) / 100) * pageHeight;
      try {
        const bytes = typeof source === "string" ? await fetchAssetBuffer(source) : source;
        // El QR y los logos/firmas subidos pueden ser PNG o JPG — se intenta
        // PNG primero (todo lo generado por este mismo sistema es PNG) y si
        // falla se reintenta como JPG, en vez de exigirle al admin que sepa
        // el formato exacto de cada asset.
        const image = await pdfDoc.embedPng(bytes).catch(() => pdfDoc.embedJpg(bytes));
        page.drawImage(image, { x: xPt, y: pageHeight - yFromTop - heightPt, width: widthPt, height: heightPt });
      } catch (err) {
        logger.warn(`No se pudo incrustar la imagen del tag "${pos.tag}"`, { error: (err as Error).message });
      }
      continue;
    }

    const value = custom ? pos.customText ?? "" : textVars[pos.tag];
    if (!value) continue;
    const fontSize = pos.fontSizePt ?? 14;
    const color = hexToRgb01(pos.color);
    const font = await fontFor(pos.fontFamily);
    const lineHeight = fontSize * (pos.lineHeightMultiplier ?? 1.2);

    if (custom) {
      // Texto libre a medida — puede ser largo/multilínea, a diferencia de
      // los tags "de datos" (nombre, fecha, etc.) que son casi siempre una
      // sola línea corta. Se envuelve dentro de un recuadro definido por
      // widthPercent (o el ancho de página menos márgenes) y se aplican
      // márgenes + separación entre líneas.
      const marginLeft = pos.marginLeftPt ?? 0;
      const marginRight = pos.marginRightPt ?? 0;
      const marginTop = pos.marginTopPt ?? 0;
      const boxWidth = pos.widthPercent ? (pos.widthPercent / 100) * pageWidth : pageWidth - xPt - marginRight;
      const lines = wrapText(value, font, fontSize, Math.max(10, boxWidth - marginLeft - marginRight));
      let cursorY = pageHeight - yFromTop - marginTop - fontSize;
      for (const line of lines) {
        const lineWidth = font.widthOfTextAtSize(line, fontSize);
        const alignOffset = pos.align === "center" ? lineWidth / 2 : pos.align === "right" ? lineWidth : 0;
        page.drawText(line, { x: xPt + marginLeft - alignOffset, y: cursorY, size: fontSize, font, color });
        cursorY -= lineHeight;
      }
      continue;
    }

    const textWidth = font.widthOfTextAtSize(value, fontSize);
    const alignOffset = pos.align === "center" ? textWidth / 2 : pos.align === "right" ? textWidth : 0;
    page.drawText(value, { x: xPt - alignOffset, y: pageHeight - yFromTop - fontSize, size: fontSize, font, color });
  }

  return Buffer.from(await pdfDoc.save());
}
