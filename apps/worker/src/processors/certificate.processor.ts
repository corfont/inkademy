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
  widthPercent?: number;
  heightPercent?: number;
}

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
    include: { user: true, course: true, program: true, template: true },
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

  const textVars: Record<string, string> = {
    studentName,
    courseName: offeringName,
    issuedDate,
    finalScore: certificate.finalScore != null ? certificate.finalScore.toFixed(1) : "Aprobado",
    code: certificate.code,
    teacherName,
    institutionSignatureName,
    institutionSignatureTitle,
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
      images: { qrDataUrl: qrBuffer, teacherSignature: teacherSignatureAssetId, institutionSignatureImage: institutionSignatureAssetId, logo: logoUrl },
    });
  } else {
    // Modo HTML (Puppeteer): las imágenes se insertan ya como <img> — si no
    // hay firma configurada, el tag se reemplaza por nada (el <img> nunca
    // se renderiza, en vez de mostrar un ícono roto).
    const teacherSignatureUrl = teacherSignatureAssetId ? getPublicUrl(teacherSignatureAssetId) : null;
    const institutionSignatureUrl = institutionSignatureAssetId ? getPublicUrl(institutionSignatureAssetId) : null;
    const html = renderPlaceholders(certificate.template.htmlTemplate, {
      ...textVars,
      qrDataUrl,
      appUrl,
      logo: `<img src="${logoUrl}" alt="Inkademy" />`,
      teacherSignature: teacherSignatureUrl ? `<img src="${teacherSignatureUrl}" alt="Firma del docente" />` : "",
      institutionSignatureImage: institutionSignatureUrl ? `<img src="${institutionSignatureUrl}" alt="Firma institucional" />` : "",
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

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  for (const pos of tagPositions) {
    const isImageTag = pos.tag in images;
    const xPt = (pos.xPercent / 100) * pageWidth;
    // yPercent es "desde arriba" (igual que en la vista previa CSS); pdf-lib
    // dibuja desde abajo-izquierda, por eso se invierte acá.
    const yFromTop = (pos.yPercent / 100) * pageHeight;

    if (isImageTag) {
      const source = images[pos.tag];
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

    const value = textVars[pos.tag];
    if (!value) continue;
    const fontSize = pos.fontSizePt ?? 14;
    const color = hexToRgb01(pos.color);
    const textWidth = font.widthOfTextAtSize(value, fontSize);
    const alignOffset = pos.align === "center" ? textWidth / 2 : pos.align === "right" ? textWidth : 0;
    page.drawText(value, { x: xPt - alignOffset, y: pageHeight - yFromTop - fontSize, size: fontSize, font, color });
  }

  return Buffer.from(await pdfDoc.save());
}
