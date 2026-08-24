import type { Job } from "bullmq";
import { prisma } from "@inkademy/db";
import type { InvoiceGenerateJobData } from "../queues";
import { createLogger } from "../lib/logger";
import { buildUblInvoiceXml, type SunatDocumentType } from "../lib/sunat/ubl-invoice";
import { resolveSunatCertificate, signUblXml } from "../lib/sunat/sign";
import { buildFileName, sendBill, zipSignedXml, type SunatEnv } from "../lib/sunat/soap-client";

const logger = createLogger("invoice.processor");

type LocalizedText = Record<string, string> | null | undefined;

function pickLocale(text: LocalizedText, locale = "es"): string {
  if (!text) return "";
  return text[locale] ?? text.es ?? Object.values(text)[0] ?? "";
}

/**
 * `apps/api` (`CommerceService.createElectronicInvoiceIfNeeded`) ya creó la
 * fila `ElectronicInvoice` en estado PENDING con el documentType/series/
 * correlativo/datos del comprador ya resueltos, y ya validó que el monto no
 * es 0 (no se factura nada gratuito). El trabajo del worker es:
 * 1. Armar la línea de detalle a partir de los items de la orden.
 * 2. Construir el XML UBL 2.1, firmarlo (certificado real si está
 *    configurado, autofirmado si no — ver sign.ts).
 * 3. Si no hay credenciales SOL reales configuradas: quedarse en modo
 *    SIMULATED (guarda el XML firmado, no llama a SUNAT) — mismo patrón que
 *    CulqiProvider/StripeProvider cuando falta la secret key.
 * 4. Si hay credenciales: empaquetar en zip y enviar por SOAP (`sendBill`),
 *    parsear la CDR y guardar el resultado (ACCEPTED/REJECTED/ERROR).
 */
export async function processInvoiceGenerateJob(job: Job<InvoiceGenerateJobData>): Promise<void> {
  const { invoiceId } = job.data;

  const invoice = await prisma.electronicInvoice.findUnique({
    where: { id: invoiceId },
    include: { order: { include: { items: true } } },
  });

  if (!invoice) {
    logger.warn("electronicInvoice no encontrada, se descarta el job", { invoiceId });
    return;
  }
  if (invoice.status === "ACCEPTED" || invoice.status === "SIMULATED") {
    logger.info("la boleta/factura ya fue procesada, se omite", { invoiceId, status: invoice.status });
    return;
  }

  // OrderItem solo guarda courseId/programId (sin relación Prisma
  // declarada) — se resuelven los títulos aparte en dos findMany.
  const courseIds = invoice.order.items.map((i) => i.courseId).filter((v): v is string => Boolean(v));
  const programIds = invoice.order.items.map((i) => i.programId).filter((v): v is string => Boolean(v));
  const [courses, programs] = await Promise.all([
    courseIds.length ? prisma.course.findMany({ where: { id: { in: courseIds } } }) : Promise.resolve([]),
    programIds.length ? prisma.program.findMany({ where: { id: { in: programIds } } }) : Promise.resolve([]),
  ]);
  const courseTitleById = new Map(courses.map((c) => [c.id, pickLocale(c.title as LocalizedText)]));
  const programTitleById = new Map(programs.map((p) => [p.id, pickLocale(p.title as LocalizedText)]));

  // Une los items de la orden en una sola línea de detalle — el modelo
  // ElectronicInvoice factura la orden completa como documento único (no
  // hay líneas por item), suficiente para el volumen de este proyecto.
  const description =
    invoice.order.items
      .map((item) => (item.courseId ? courseTitleById.get(item.courseId) : item.programId ? programTitleById.get(item.programId) : null))
      .filter(Boolean)
      .join(" + ") || "Servicio educativo Inkademy";

  const sunatRuc = process.env.SUNAT_RUC;
  const solUser = process.env.SUNAT_SOL_USER;
  const solPassword = process.env.SUNAT_SOL_PASSWORD;
  const hasRealCredentials = Boolean(sunatRuc && solUser && solPassword);

  if (invoice.currency !== "PEN") {
    // Facturar en USD (venta de exportación de servicios) exige un
    // tratamiento tributario distinto (tipo de operación 0200, etc.) que
    // esta integración todavía no implementa — se documenta como error en
    // vez de emitir un comprobante incorrecto.
    await prisma.electronicInvoice.update({
      where: { id: invoice.id },
      data: {
        status: "ERROR",
        sunatDescription: `Facturación en ${invoice.currency} (venta de exportación) todavía no soportada — solo PEN.`,
      },
    });
    logger.warn("moneda no soportada para SUNAT, se marca ERROR", { invoiceId, currency: invoice.currency });
    return;
  }

  // Servicios de enseñanza reglada están exonerados de IGV en Perú
  // (Apéndice II, Ley del IGV, numeral 8) — este es el default razonable,
  // pero CADA EMPRESA debe confirmarlo con su contador según su caso
  // específico (p.ej. capacitación corporativa no reglada podría estar
  // gravada). Configurable vía SUNAT_TAX_AFFECTATION=GRAVADO para cambiarlo.
  const igvExempt = (process.env.SUNAT_TAX_AFFECTATION ?? "EXONERADO").toUpperCase() !== "GRAVADO";

  const documentTypeCode: "01" | "03" = invoice.documentType === "FACTURA" ? "01" : "03";

  const unsignedXml = buildUblInvoiceXml({
    documentType: invoice.documentType as SunatDocumentType,
    series: invoice.series,
    correlativo: invoice.correlativo,
    issueDate: invoice.createdAt,
    currency: invoice.currency as "PEN" | "USD",
    supplier: {
      ruc: sunatRuc ?? "20000000001",
      legalName: process.env.SUNAT_RAZON_SOCIAL ?? "Inkapitales SAC",
      address: process.env.SUNAT_ADDRESS ?? "Lima, Peru",
      ubigeo: process.env.SUNAT_UBIGEO ?? "150101",
    },
    buyer: {
      documentType: invoice.buyerDocumentType,
      documentNumber: invoice.buyerDocumentNumber,
      legalName: invoice.buyerLegalName,
    },
    igvExempt,
    line: { description, quantity: 1, unitPrice: Number(invoice.totalAmount) },
  });

  const cert = resolveSunatCertificate(sunatRuc ?? "20000000001");
  const signedXml = signUblXml(unsignedXml, cert);

  if (!hasRealCredentials) {
    await prisma.electronicInvoice.update({
      where: { id: invoice.id },
      data: { status: "SIMULATED", xml: signedXml },
    });
    logger.info("SUNAT_SOL_USER/SUNAT_SOL_PASSWORD no configurados — comprobante generado en modo simulado", {
      invoiceId,
      series: invoice.series,
      correlativo: invoice.correlativo,
    });
    return;
  }

  try {
    const fileName = buildFileName(sunatRuc!, documentTypeCode, invoice.series, invoice.correlativo);
    const zipBuffer = await zipSignedXml(fileName, signedXml);
    const env: SunatEnv = (process.env.SUNAT_ENV ?? "beta").toLowerCase() === "production" ? "production" : "beta";

    const result = await sendBill({
      env,
      solUser: solUser!,
      solPassword: solPassword!,
      ruc: sunatRuc!,
      fileName,
      zipBuffer,
    });

    if (result.hasCdr && result.responseCode === "0") {
      await prisma.electronicInvoice.update({
        where: { id: invoice.id },
        data: {
          status: "ACCEPTED",
          xml: signedXml,
          cdrXml: result.cdrXml,
          sunatResponseCode: result.responseCode,
          sunatDescription: result.description,
        },
      });
      logger.info("boleta/factura aceptada por SUNAT", { invoiceId, responseCode: result.responseCode });
    } else if (result.hasCdr) {
      await prisma.electronicInvoice.update({
        where: { id: invoice.id },
        data: {
          status: "REJECTED",
          xml: signedXml,
          cdrXml: result.cdrXml,
          sunatResponseCode: result.responseCode,
          sunatDescription: result.description,
        },
      });
      logger.warn("SUNAT rechazó el comprobante", { invoiceId, responseCode: result.responseCode, description: result.description });
    } else {
      await prisma.electronicInvoice.update({
        where: { id: invoice.id },
        data: { status: "ERROR", xml: signedXml, sunatDescription: result.rawFault ?? "Sin CDR ni fault reconocible" },
      });
      logger.error("fallo técnico al enviar a SUNAT", { invoiceId, rawFault: result.rawFault });
    }
  } catch (err) {
    // Se guarda el XML firmado igual — permite reintentar sin reconstruirlo.
    await prisma.electronicInvoice.update({
      where: { id: invoice.id },
      data: { status: "ERROR", xml: signedXml, sunatDescription: String(err) },
    });
    throw err; // deja que BullMQ reintente según attempts/backoff configurados en commerce.service.ts
  }
}
