import { existsSync } from "node:fs";
import { join } from "node:path";
import dotenv from "dotenv";

// En Docker las variables llegan como env reales del contenedor (no hay
// .env que leer, y dotenv simplemente no encuentra nada, lo cual está bien).
// En desarrollo local ("pnpm --filter @inkademy/worker dev"), el cwd es
// apps/worker, así que buscamos primero un .env local y si no existe caemos
// al de la raíz del monorepo — igual que hace apps/api en app.module.ts.
const localEnv = join(process.cwd(), ".env");
const rootEnv = join(__dirname, "../../../.env");
dotenv.config({ path: existsSync(localEnv) ? localEnv : rootEnv });

import { Worker, type Job } from "bullmq";
import { INVOICE_JOBS, QUEUE_NAMES, REMINDER_SWEEP_JOB, EMAIL_CAMPAIGN_SWEEP_JOB } from "./queues";
import { createRedisConnection } from "./lib/redis";
import { reminderQueue } from "./lib/queue-client";
import { createLogger } from "./lib/logger";
import { processEmailJob } from "./processors/email.processor";
import { processCertificateGenerateJob } from "./processors/certificate.processor";
import { processReminderJob } from "./processors/reminder.processor";
import { processAttendanceSyncJob } from "./processors/attendance-sync.processor";
import { processRecommendationJob } from "./processors/recommendation.processor";
import { processInvoiceGenerateJob } from "./processors/invoice.processor";
import { processInvoiceGenerateNoteJob } from "./processors/credit-note.processor";
import { processSuggestionAutoRespondJob } from "./processors/suggestion.processor";
import { processSubtitlesGenerateJob } from "./processors/subtitles.processor";
import { processExpireAttemptJob } from "./processors/assessment-expiry.processor";

/**
 * La cola "invoice" tiene dos jobs (boleta/factura y nota de crédito/
 * débito) — comparten el mismo dominio SUNAT así que van en la misma cola,
 * despachados por nombre de job en vez de crear una cola separada.
 */
function processInvoiceQueueJob(job: Job): Promise<void> {
  if (job.name === INVOICE_JOBS.GENERATE_NOTE) return processInvoiceGenerateNoteJob(job);
  return processInvoiceGenerateJob(job);
}

const logger = createLogger("worker");
const connection = createRedisConnection();

const REMINDER_SWEEP_INTERVAL_MS = 15 * 60 * 1000; // 15 min
// Más corto que el de recordatorios: "enviar ahora" una campaña de correo
// (ver AdminService.sendEmailCampaignNow) solo pone scheduledAt=ahora — este
// sweep es lo que realmente la recoge y la manda, así que un intervalo largo
// se sentiría como que "enviar ahora" no hizo nada por varios minutos.
const EMAIL_CAMPAIGN_SWEEP_INTERVAL_MS = 2 * 60 * 1000; // 2 min

function attachLifecycleLogs(worker: Worker, queueName: string) {
  worker.on("completed", (job: Job) => logger.info("job completado", { queue: queueName, jobId: job.id, jobName: job.name }));
  worker.on("failed", (job: Job | undefined, err: Error) =>
    logger.error("job falló", { queue: queueName, jobId: job?.id, jobName: job?.name, err: err.message }),
  );
  worker.on("error", (err: Error) => logger.error("error del worker", { queue: queueName, err: err.message }));
}

const workers: Worker[] = [
  new Worker(QUEUE_NAMES.EMAIL, processEmailJob, { connection, concurrency: 10 }),
  new Worker(QUEUE_NAMES.CERTIFICATE, processCertificateGenerateJob, { connection, concurrency: 2 }),
  new Worker(QUEUE_NAMES.REMINDER, processReminderJob, { connection, concurrency: 5 }),
  new Worker(QUEUE_NAMES.ATTENDANCE_SYNC, processAttendanceSyncJob, { connection, concurrency: 3 }),
  new Worker(QUEUE_NAMES.RECOMMENDATION, processRecommendationJob, { connection, concurrency: 5 }),
  new Worker(QUEUE_NAMES.INVOICE, processInvoiceQueueJob, { connection, concurrency: 2 }),
  new Worker(QUEUE_NAMES.SUGGESTION, processSuggestionAutoRespondJob, { connection, concurrency: 3 }),
  // Concurrencia baja a propósito: cada job sube un video entero a Gemini y
  // espera a que lo procese — varios en paralelo competirían por el mismo
  // ancho de banda de subida sin ganar nada.
  new Worker(QUEUE_NAMES.SUBTITLES, processSubtitlesGenerateJob, { connection, concurrency: 1 }),
  new Worker(QUEUE_NAMES.ASSESSMENT_EXPIRY, processExpireAttemptJob, { connection, concurrency: 5 }),
];

workers.forEach((worker, i) => attachLifecycleLogs(worker, Object.values(QUEUE_NAMES)[i]));

/**
 * `apps/api` todavía no encola ningún job en la cola "reminder" (ver
 * IMPLEMENTATION-NOTES.md sección 1) — el worker se autoprograma un job
 * repetible ("reminder.sweep") que escanea la base cada 15 minutos y
 * termina generando los recordatorios reales (`reminder.live-session-
 * upcoming`, `reminder.course-access-expiring`, `reminder.assessment-due`)
 * como delayed jobs. BullMQ identifica los jobs repetibles por
 * nombre+opciones de `repeat`, así que reiniciar el worker y volver a
 * llamar `add` no duplica el scheduler.
 */
async function registerReminderSweep(): Promise<void> {
  await reminderQueue().add(REMINDER_SWEEP_JOB, {}, { repeat: { every: REMINDER_SWEEP_INTERVAL_MS }, jobId: REMINDER_SWEEP_JOB });
}

registerReminderSweep()
  .then(() => logger.info("sweep de recordatorios programado", { everyMs: REMINDER_SWEEP_INTERVAL_MS }))
  .catch((err) => logger.error("no se pudo programar el sweep de recordatorios", { err: String(err) }));

/** Mismo mecanismo que registerReminderSweep, misma cola "reminder" — ver EMAIL_CAMPAIGN_SWEEP_JOB. */
async function registerEmailCampaignSweep(): Promise<void> {
  await reminderQueue().add(EMAIL_CAMPAIGN_SWEEP_JOB, {}, { repeat: { every: EMAIL_CAMPAIGN_SWEEP_INTERVAL_MS }, jobId: EMAIL_CAMPAIGN_SWEEP_JOB });
}

registerEmailCampaignSweep()
  .then(() => logger.info("sweep de campañas de correo programado", { everyMs: EMAIL_CAMPAIGN_SWEEP_INTERVAL_MS }))
  .catch((err) => logger.error("no se pudo programar el sweep de campañas de correo", { err: String(err) }));

logger.info("Inkademy worker iniciado", { queues: Object.values(QUEUE_NAMES), redisUrl: process.env.REDIS_URL });

async function shutdown(signal: string) {
  logger.info("apagando worker", { signal });
  await Promise.all(workers.map((w) => w.close()));
  await connection.quit();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
