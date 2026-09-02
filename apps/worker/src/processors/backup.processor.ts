import type { Job } from "bullmq";
import { prisma } from "@inkademy/db";
import type { BackupGenerateJobData } from "../queues";
import { buildFullBackup } from "../lib/backup";
import { uploadBuffer } from "../lib/storage";
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
    const { zipBuffer, sizeBytes, modelCounts } = await buildFullBackup();
    const key = `backups/${new Date().toISOString().replace(/[:.]/g, "-")}.zip`;
    const { assetId } = await uploadBuffer(key, zipBuffer, "application/zip");

    await prisma.backupRecord.update({
      where: { id: record.id },
      data: { status: "DONE", s3Key: assetId, sizeBytes, modelCounts, finishedAt: new Date() },
    });
    logger.info("backup generado", { backupRecordId: record.id, sizeBytes, trigger });
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
