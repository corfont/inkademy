import { getQueueToken } from "@nestjs/bullmq";
import { ALL_QUEUE_NAMES } from "../../src/common/queues/queue.constants";

/** Mock mínimo de una cola BullMQ para tests — solo necesitamos `.add()`. */
export function createMockQueue() {
  return { add: jest.fn().mockResolvedValue({ id: "job_1" }) };
}

/**
 * Pares [token, mockQueue] para las 5 colas declaradas en QueuesModule.
 * Se usa para sobreescribir TODAS las colas reales (BullMQ/ioredis) en tests,
 * de forma que ningún test intente conectarse a un Redis real.
 */
export function allMockQueueOverrides(): [string | symbol, ReturnType<typeof createMockQueue>][] {
  return ALL_QUEUE_NAMES.map((name) => [getQueueToken(name), createMockQueue()]);
}
