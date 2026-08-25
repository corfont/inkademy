import { BadRequestException } from "@nestjs/common";

/**
 * "Cualquier tipo de archivo se acepta hasta 50MB — sin filtro de mimetype
 * en ningún FileInterceptor" — hallazgo de auditoría de seguridad: un
 * alumno subiendo la respuesta de un examen "cualitativo" (o cualquier
 * otro upload) podía subir un `.html`/`.svg` con script embebido, que
 * luego un docente/admin abre directo desde la cola de calificación —
 * XSS/phishing alojado en el bucket de la plataforma. `multer` llama a
 * este `fileFilter` ANTES de guardar nada en memoria/disco.
 *
 * Nota: esto valida el `Content-Type` que el navegador declaró al armar
 * el FormData — no es una garantía criptográfica de que el contenido real
 * coincida (para eso haría falta inspeccionar los bytes/magic numbers, o
 * un escáner de contenido de verdad), pero cierra el caso más simple y
 * barato de explotar: declarar `text/html` a propósito para que el
 * navegador de quien lo abra lo interprete y ejecute.
 */
export function fileMimeFilter(allowedPrefixes: string[]) {
  return (
    _req: unknown,
    file: { mimetype: string; originalname: string },
    callback: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    const ok = allowedPrefixes.some((prefix) => file.mimetype === prefix || file.mimetype.startsWith(prefix));
    if (!ok) {
      callback(new BadRequestException(`Tipo de archivo no permitido: ${file.mimetype || "desconocido"}`), false);
      return;
    }
    callback(null, true);
  };
}

// Documentos de examen/curso: PDF, Word, Excel, PowerPoint, imágenes — lo
// que puede ser un "examen de archivo" o material de lectura. Sin video/
// audio/html/svg.
export const DOCUMENT_MIME_PREFIXES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];

// Uploads generales de admin/docente: lo anterior + video (portada de
// curso, video de lección) — pero sigue excluyendo html/svg/ejecutables.
export const COURSE_ASSET_MIME_PREFIXES = [...DOCUMENT_MIME_PREFIXES, "video/"];

// Avatar de usuario: solo imágenes rasterizadas comunes (ni SVG, que puede
// llevar script embebido).
export const AVATAR_MIME_PREFIXES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
