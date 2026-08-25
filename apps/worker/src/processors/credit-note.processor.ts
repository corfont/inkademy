import type { Job } from "bullmq";
import { prisma } from "@inkademy/db";
import type { InvoiceGenerateNoteJobData } from "../queues";
import { createLogger } from "../lib/logger";
import { buildUblNoteXml, type SunatNoteType } from "../lib/sunat/ubl-credit-note";
import { resolveSunatCertificate, signUblXml } from "../lib/sunat/sign";
import { buildFileName, sendBill, zipSignedXml } from "../lib/sunat/soap-client";
import { resolveSunatConfig } from "../lib/sunat/config";

const logger = createLogger("credit-note.processor");

/**
 * `apps/api` (`CommerceService.cancelOrder`) ya creó la fila
 * `ElectronicNote` en estado PENDING, ya reembolsó el pago original vía el
 * proveedor correspondiente, y ya resolvió series/correlativo. Mismo
 * pipeline que invoice.processor.ts (construir XML -> firmar -> enviar o
 * simular), pero con el XML de Nota de Crédito/Débito que referencia el
 * comprobante original.
 */
export async function processInvoiceGenerateNoteJob(job: Job<InvoiceGenerateNoteJobData>): Promise<void> {
  const { noteId } = job.data;

  const note = await prisma.electronicNote.findUnique({ where: { id: noteId } });
  if (!note) {
    logger.warn("electronicNote no encontrada, se descarta el job", { noteId });
    return;
  }
  if (note.status === "ACCEPTED" || note.status === "SIMULATED") {
    logger.info("la nota ya fue procesada, se omite", { noteId, status: note.status });
    return;
  }

  // ElectronicNote no repite los datos del comprador (ya viven en la
  // ElectronicInvoice original, 1:1 con la orden) — se reutilizan tal cual
  // para que la nota quede a nombre del mismo comprador que la boleta/factura.
  const originalInvoice = await prisma.electronicInvoice.findUnique({ where: { orderId: note.orderId } });
  const buyer = originalInvoice
    ? {
        documentType: originalInvoice.buyerDocumentType,
        documentNumber: originalInvoice.buyerDocumentNumber,
        legalName: originalInvoice.buyerLegalName,
      }
    : { documentType: "1", documentNumber: "00000000", legalName: "Cliente varios" };

  const sunatConfig = await resolveSunatConfig();
  const { ruc: sunatRuc, solUser, solPassword } = sunatConfig;
  const hasRealCredentials = Boolean(sunatRuc && solUser && solPassword);

  if (note.currency !== "PEN") {
    await prisma.electronicNote.update({
      where: { id: note.id },
      data: { status: "ERROR", sunatDescription: `Nota en ${note.currency} todavía no soportada — solo PEN.` },
    });
    return;
  }

  const igvExempt = sunatConfig.taxAffectation !== "GRAVADO";
  const referenceDocTypeCode: "01" | "03" = note.referenceDocType === "FACTURA" ? "01" : "03";
  const noteDocTypeCode: "07" | "08" = note.noteType === "CREDIT" ? "07" : "08";

  const unsignedXml = buildUblNoteXml({
    noteType: note.noteType as SunatNoteType,
    series: note.series,
    correlativo: note.correlativo,
    issueDate: note.createdAt,
    currency: note.currency as "PEN" | "USD",
    reference: {
      documentTypeCode: referenceDocTypeCode,
      series: note.referenceSeries,
      correlativo: note.referenceCorrelativo,
    },
    reasonCode: note.reasonCode,
    reasonDescription: note.reasonDescription,
    supplier: {
      ruc: sunatRuc ?? "20000000001",
      legalName: sunatConfig.razonSocial,
      address: sunatConfig.address,
      ubigeo: sunatConfig.ubigeo,
    },
    buyer,
    igvExempt,
    igvPercent: sunatConfig.igvPercent,
    line: { description: `Anulación: ${note.reasonDescription}`, quantity: 1, unitPrice: Number(note.totalAmount) },
  });

  const cert = resolveSunatCertificate(sunatRuc ?? "20000000001", sunatConfig.certPem, sunatConfig.certKeyPem);
  const signedXml = signUblXml(unsignedXml, cert);

  if (!hasRealCredentials) {
    await prisma.electronicNote.update({ where: { id: note.id }, data: { status: "SIMULATED", xml: signedXml } });
    logger.info("credenciales SUNAT no configuradas — nota generada en modo simulado", { noteId });
    return;
  }

  try {
    const fileName = buildFileName(sunatRuc!, noteDocTypeCode, note.series, note.correlativo);
    const zipBuffer = await zipSignedXml(fileName, signedXml);

    const result = await sendBill({ env: sunatConfig.env, solUser: solUser!, solPassword: solPassword!, ruc: sunatRuc!, fileName, zipBuffer });

    if (result.hasCdr && result.responseCode === "0") {
      await prisma.electronicNote.update({
        where: { id: note.id },
        data: { status: "ACCEPTED", xml: signedXml, cdrXml: result.cdrXml, sunatResponseCode: result.responseCode, sunatDescription: result.description },
      });
      logger.info("nota aceptada por SUNAT", { noteId, responseCode: result.responseCode });
    } else if (result.hasCdr) {
      await prisma.electronicNote.update({
        where: { id: note.id },
        data: { status: "REJECTED", xml: signedXml, cdrXml: result.cdrXml, sunatResponseCode: result.responseCode, sunatDescription: result.description },
      });
      logger.warn("SUNAT rechazó la nota", { noteId, description: result.description });
    } else {
      await prisma.electronicNote.update({
        where: { id: note.id },
        data: { status: "ERROR", xml: signedXml, sunatDescription: result.rawFault ?? "Sin CDR ni fault reconocible" },
      });
      logger.error("fallo técnico al enviar nota a SUNAT", { noteId, rawFault: result.rawFault });
    }
  } catch (err) {
    await prisma.electronicNote.update({ where: { id: note.id }, data: { status: "ERROR", xml: signedXml, sunatDescription: String(err) } });
    throw err;
  }
}
