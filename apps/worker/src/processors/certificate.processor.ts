import type { Job } from "bullmq";
import puppeteer from "puppeteer";
import QRCode from "qrcode";
import { prisma } from "@inkademy/db";
import type { CertificateGenerateJobData } from "../queues";
import { uploadBuffer } from "../lib/storage";
import { createLogger } from "../lib/logger";

const logger = createLogger("certificate.processor");

type LocalizedText = Record<string, string> | null | undefined;

function pickLocale(text: LocalizedText, locale: string): string {
  if (!text) return "";
  return text[locale] ?? text.es ?? Object.values(text)[0] ?? "";
}

function renderPlaceholders(html: string, vars: Record<string, string>): string {
  return html.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => vars[key] ?? "");
}

/**
 * `apps/api` (`CertificateService.checkAndIssueIfEligible`) ya creó la fila
 * `Certificate` — con `finalScore`/`criteriaSnapshot` ya calculados — y ya
 * envió el correo "certificate-ready" (con la URL de verificación, sin
 * esperar el PDF). El trabajo del worker es solo:
 * 1. Resolver la plantilla, el usuario y el curso/programa asociados.
 * 2. Generar el QR -> {API_URL}/certificates/verify/{code} (misma URL que
 *    ya usó `apps/api` en el correo — ver `CertificateService.verificationUrl`).
 * 3. Renderizar el HTML -> PDF con puppeteer y subirlo a S3/MinIO.
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
  // (verificationUrl): API_URL, no APP_URL — es el endpoint público de la API,
  // no una página del frontend.
  const apiUrl = process.env.API_URL ?? "http://localhost:4000";
  const verificationUrl = `${apiUrl}/certificates/verify/${certificate.code}`;
  const qrDataUrl = await QRCode.toDataURL(verificationUrl);

  const studentName = certificate.user.displayName ?? `${certificate.user.firstName} ${certificate.user.lastName}`;
  const issuedDate = certificate.issuedAt.toLocaleDateString(locale === "en" ? "en-US" : "es-PE", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const html = renderPlaceholders(certificate.template.htmlTemplate, {
    studentName,
    courseName: offeringName,
    issuedDate,
    finalScore: certificate.finalScore != null ? certificate.finalScore.toFixed(1) : "Aprobado",
    code: certificate.code,
    qrDataUrl,
  });

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  let pdfBuffer: Buffer;
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    pdfBuffer = Buffer.from(
      await page.pdf({ format: "A4", landscape: true, printBackground: true }),
    );
  } finally {
    await browser.close();
  }

  const upload = await uploadBuffer(`certificates/${certificate.code}.pdf`, pdfBuffer, "application/pdf");

  await prisma.certificate.update({
    where: { id: certificate.id },
    data: { pdfAssetId: upload.assetId, qrUrl: verificationUrl },
  });

  logger.info("PDF de certificado generado", { certificateId, code: certificate.code });
}
