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
import { QUEUE_NAMES, REMINDER_SWEEP_JOB } from "./queues";
import { createRedisConnection } from "./lib/redis";
import { reminderQueue } from "./lib/queue-client";
import { createLogger } from "./lib/logger";
import { processEmailJob } from "./processors/email.processor";
import { processCertificateGenerateJob } from "./processors/certificate.processor";
import { processReminderJob } from "./processors/reminder.processor";
import { processAttendanceSyncJob } from "./processors/attendance-sync.processor";
import { processRecommendationJob } from "./processors/recommendation.processor";

const logger = createLogger("worker");
const connection = createRedisConnection();

const REMINDER_SWEEP_INTERVAL_MS = 15 * 60 * 1000; // 15 min

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

logger.info("Inkademy worker iniciado", { queues: Object.values(QUEUE_NAMES), redisUrl: process.env.REDIS_URL });

async function shutdown(signal: string) {
  logger.info("apagando worker", { signal });
  await Promise.all(workers.map((w) => w.close()));
  await connection.quit();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
