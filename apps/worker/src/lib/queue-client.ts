import { Queue } from "bullmq";
import { QUEUE_NAMES, type QueueName } from "../queues";
import { createRedisConnection } from "./redis";

// Los processors también producen jobs (p.ej. certificate.processor encola un
// email "certificate-issued"; reminder.processor encola jobs delayed en
// "email"). Se reusa una única conexión Redis y se memoizan las Queue.
const connection = createRedisConnection();
const queues = new Map<QueueName, Queue>();

export function getQueue(name: QueueName): Queue {
  let queue = queues.get(name);
  if (!queue) {
    queue = new Queue(name, { connection });
    queues.set(name, queue);
  }
  return queue;
}

export const emailQueue = () => getQueue(QUEUE_NAMES.EMAIL);
export const certificateQueue = () => getQueue(QUEUE_NAMES.CERTIFICATE);
export const reminderQueue = () => getQueue(QUEUE_NAMES.REMINDER);
export const attendanceSyncQueue = () => getQueue(QUEUE_NAMES.ATTENDANCE_SYNC);
export const recommendationQueue = () => getQueue(QUEUE_NAMES.RECOMMENDATION);
export const backupQueue = () => getQueue(QUEUE_NAMES.BACKUP);
