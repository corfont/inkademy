import IORedis from "ioredis";

// bullmq requiere maxRetriesPerRequest: null en la conexión usada por Worker.
// Se crea una única conexión y se comparte entre todos los Workers del proceso.
export function createRedisConnection(): IORedis {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  return new IORedis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
}
