import JSZip from "jszip";
import { Prisma, prisma } from "@inkademy/db";
import { getObjectBuffer } from "./storage";
import { createLogger } from "./logger";

const logger = createLogger("backup");

// "Toda la base de datos" — se toma la lista de modelos directo del DMMF
// del cliente Prisma generado (Prisma.dmmf.datamodel.models) en vez de
// mantener una lista a mano: así un modelo nuevo que se agregue a
// schema.prisma queda incluido automáticamente en el próximo backup, sin
// que nadie tenga que acordarse de actualizar este archivo también.
// Confirmado en vivo que Prisma.dmmf existe en esta versión (5.22.0) y trae
// los 64 modelos de hoy.
function modelAccessor(modelName: string): string {
  return modelName[0].toLowerCase() + modelName.slice(1);
}

function listModelNames(): string[] {
  return Prisma.dmmf.datamodel.models.map((m) => m.name);
}

interface ManifestEntry {
  model: string;
  id: string;
  key: string;
  error?: string;
}

/**
 * Incrusta en `files/` los binarios chicos con valor legal/de auditoría
 * (certificados, firma de convenios, facturas electrónicas) — el resto del
 * contenido pesado (videos, paquetes SCORM completos, avatares) se deja
 * fuera a propósito, ver decisión #2 del plan: su durabilidad depende del
 * proveedor de storage, igual que la base de datos depende de Supabase.
 * Nunca tumba el backup completo por un objeto S3 faltante/corrupto — el
 * fallo puntual queda anotado en el manifiesto.
 */
async function embedFiles(zip: JSZip, manifest: ManifestEntry[]): Promise<void> {
  const [certificates, partners, invoices, notes] = await Promise.all([
    prisma.certificate.findMany({ where: { pdfAssetId: { not: null } }, select: { id: true, code: true, pdfAssetId: true } }),
    prisma.partnerInstitution.findMany({ where: { signatureAssetId: { not: null } }, select: { id: true, signatureAssetId: true } }),
    prisma.electronicInvoice.findMany({ where: { pdfAssetId: { not: null } }, select: { id: true, pdfAssetId: true } }),
    prisma.electronicNote.findMany({ where: { pdfAssetId: { not: null } }, select: { id: true, pdfAssetId: true } }),
  ]);

  async function embed(model: string, id: string, assetKey: string, zipPath: string) {
    try {
      const buffer = await getObjectBuffer(assetKey);
      zip.file(zipPath, buffer);
      manifest.push({ model, id, key: zipPath });
    } catch (err) {
      manifest.push({ model, id, key: zipPath, error: err instanceof Error ? err.message : String(err) });
    }
  }

  await Promise.all([
    ...certificates.map((c) => embed("Certificate", c.id, c.pdfAssetId as string, `files/certificates/${c.code}.pdf`)),
    ...partners.map((p) => {
      const ext = (p.signatureAssetId as string).split(".").pop() ?? "bin";
      return embed("PartnerInstitution", p.id, p.signatureAssetId as string, `files/convenios/${p.id}-firma.${ext}`);
    }),
    ...invoices.map((i) => embed("ElectronicInvoice", i.id, i.pdfAssetId as string, `files/facturas/${i.id}.pdf`)),
    ...notes.map((n) => embed("ElectronicNote", n.id, n.pdfAssetId as string, `files/facturas/${n.id}.pdf`)),
  ]);
}

export interface FullBackupResult {
  zipBuffer: Buffer;
  sizeBytes: number;
  modelCounts: Record<string, number>;
}

export async function buildFullBackup(): Promise<FullBackupResult> {
  const zip = new JSZip();
  const modelCounts: Record<string, number> = {};
  const manifest: ManifestEntry[] = [];

  for (const modelName of listModelNames()) {
    const accessor = modelAccessor(modelName);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const delegate = (prisma as any)[accessor];
    if (!delegate?.findMany) {
      logger.warn("modelo sin delegate en prisma, se omite", { modelName });
      continue;
    }
    const rows = await delegate.findMany();
    modelCounts[modelName] = rows.length;
    // Prisma.Decimal y Date ya serializan correctamente por defecto
    // (Decimal.toJSON() devuelve el string, Date.toJSON() el ISO) —
    // confirmado en vivo, no hace falta ningún replacer custom.
    zip.file(`data/${modelName}.json`, JSON.stringify(rows, null, 2));
  }

  await embedFiles(zip, manifest);

  zip.file(
    "manifest.json",
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        modelCounts,
        embeddedFiles: manifest,
      },
      null,
      2,
    ),
  );

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return { zipBuffer, sizeBytes: zipBuffer.length, modelCounts };
}
