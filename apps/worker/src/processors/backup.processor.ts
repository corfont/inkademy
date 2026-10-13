import type { Job } from "bullmq";
import { prisma } from "@inkademy/db";
import type { BackupGenerateJobData } from "../queues";
import { createHash } from "node:crypto";
import { buildFullBackup, verifyBackup } from "../lib/backup";
import { uploadBuffer } from "../lib/storage";
import { copyBackupOffsite } from "../lib/offsite-backup";
import { createLogger } from "../lib/logger";

const logger = createLogger("backup.processor");

/**
 * El propio processor crea la fila `BackupRecord` al empezar (no
 * apps/api) — así no queda ninguna fila PENDING huérfana si el job nunca
 * llega a correr (p.ej. Redis caído entre el encolado y el consumo). Ver
 * decisión de diseño §3 del plan de esta funcionalidad.
 */
export async function processBackupGenerateJob(job: Job<BackupGenerateJobData>): Promise<void> {
  const { trigger, triggeredById } = job.data;
  const record = await prisma.backupRecord.create({
    data: { trigger, triggeredById, status: "RUNNING" },
  });

  try {
    const { zipBuffer, sizeBytes, modelCounts, fileErrorCount } = await buildFullBackup();
    const sha256 = createHash("sha256").update(zipBuffer).digest("hex");
    const key = `backups/${new Date().toISOString().replace(/[:.]/g, "-")}.zip`;
    const { assetId } = await uploadBuffer(key, zipBuffer, "application/zip");

    // Generado ≠ comprobado: se vuelve a leer lo guardado y se verifica antes de dar el respaldo por bueno.
    const verification = await verifyBackup(assetId, sha256, modelCounts);
    // Copia externa (SharePoint) solo si el respaldo pasó la comprobación: no se replica un archivo malo.
    const offsite = verification.ok ? await copyBackupOffsite(zipBuffer, record.createdAt) : { status: null as null, encrypted: false };
    await prisma.backupRecord.update({
      where: { id: record.id },
      data: {
        status: "DONE",
        s3Key: assetId,
        sizeBytes,
        modelCounts,
        finishedAt: new Date(),
        sha256,
        fileErrorCount,
        rowCount: verification.rowCount,
        verificationStatus: verification.ok ? "OK" : "FAILED",
        verifiedAt: new Date(),
        verificationNote: verification.note,
        offsiteStatus: offsite.status,
        offsiteUrl: offsite.url,
        offsiteNote: offsite.note,
        offsiteAt: offsite.status ? new Date() : null,
        offsiteEncrypted: offsite.encrypted,
      },
    });
    logger.info("backup generado", { backupRecordId: record.id, sizeBytes, trigger, verified: verification.ok });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await prisma.backupRecord.update({
      where: { id: record.id },
      data: { status: "FAILED", errorMessage, finishedAt: new Date() },
    });
    logger.error("no se pudo generar el backup", { backupRecordId: record.id, err: errorMessage });
    throw err;
  }
}
