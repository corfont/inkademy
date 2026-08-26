import type { Job } from "bullmq";
import { prisma } from "@inkademy/db";
import type { SubtitlesGenerateJobData } from "../queues";
import { getObjectBuffer, uploadBuffer } from "../lib/storage";
import { transcribeVideoToVtt } from "../lib/gemini";
import { createLogger } from "../lib/logger";

const logger = createLogger("subtitles.processor");

const EXT_MIME: Record<string, string> = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  m4v: "video/x-m4v",
  avi: "video/x-msvideo",
  mkv: "video/x-matroska",
};

function guessMimeType(assetKey: string): string {
  const ext = assetKey.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MIME[ext] ?? "video/mp4";
}

/**
 * "Subtítulos/transcripción" (Fase 2) — apps/api ya marcó
 * Lesson.subtitlesStatus="PROCESSING" antes de encolar (ver
 * AdminService.generateLessonSubtitles). Acá se descarga el video real
 * desde el storage, se sube a Gemini, se espera a que lo procese, se le
 * pide la transcripción en WebVTT, y el .vtt resultante se sube como un
 * asset más — el reproductor lo consume como cualquier <track> de video
 * (ver Classroom.tsx).
 */
export async function processSubtitlesGenerateJob(job: Job<SubtitlesGenerateJobData>): Promise<void> {
  const { lessonId } = job.data;
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });

  if (!lesson) {
    logger.warn("lección no encontrada, se descarta el job", { lessonId });
    return;
  }
  if (!lesson.videoAssetId) {
    logger.warn("la lección ya no tiene video, se descarta el job", { lessonId });
    await prisma.lesson.update({ where: { id: lessonId }, data: { subtitlesStatus: "FAILED", subtitlesError: "La lección ya no tiene video" } });
    return;
  }

  try {
    const mimeType = guessMimeType(lesson.videoAssetId);
    const videoBytes = await getObjectBuffer(lesson.videoAssetId);
    // El idioma real del curso vive en Course.language, no en Lesson —
    // se resuelve con una consulta aparte en vez de cargar toda la cadena
    // module->course solo para esto.
    const module = await prisma.courseModule.findUnique({ where: { id: lesson.moduleId }, select: { course: { select: { language: true } } } });
    const language = module?.course.language === "en" ? "en" : "es";
    const vtt = await transcribeVideoToVtt(videoBytes, mimeType, `lesson-${lessonId}`, language);

    const upload = await uploadBuffer(`subtitles/${lessonId}.vtt`, Buffer.from(vtt, "utf-8"), "text/vtt");
    await prisma.lesson.update({
      where: { id: lessonId },
      data: { subtitlesAssetId: upload.assetId, subtitlesStatus: "READY", subtitlesError: null },
    });
    logger.info("subtítulos generados", { lessonId, assetId: upload.assetId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("fallo al generar subtítulos", { lessonId, err: message });
    await prisma.lesson.update({ where: { id: lessonId }, data: { subtitlesStatus: "FAILED", subtitlesError: message.slice(0, 500) } });
    throw err; // deja que BullMQ registre el intento fallido (attempts:2 configurado al encolar)
  }
}
