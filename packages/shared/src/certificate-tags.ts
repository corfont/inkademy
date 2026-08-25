/**
 * Catálogo único de tags disponibles para plantillas de certificado —
 * compartido entre apps/api (validación), apps/worker (generación real con
 * Puppeteer/pdf-lib) y apps/web (editor + vista previa), para que los tres
 * lugares nunca se desincronicen sobre qué tags existen.
 *
 * - kind "text": se reemplaza por texto plano (HTML) o se dibuja con
 *   `page.drawText` (plantillas con fondo PDF/PNG/JPG).
 * - kind "image": en HTML se reemplaza por un <img src="..."> ya armado;
 *   en plantillas con fondo se dibuja con `page.drawImage`.
 */
export interface CertificateTagDef {
  tag: string;
  kind: "text" | "image";
  label: string;
  /** Ejemplo mostrado en la vista previa cuando no hay datos reales. */
  sample: string;
}

export const CERTIFICATE_TAGS: CertificateTagDef[] = [
  { tag: "studentName", kind: "text", label: "Nombre del alumno", sample: "María Fernanda Quispe Rojas" },
  { tag: "courseName", kind: "text", label: "Nombre del curso/programa", sample: "Liderazgo de Equipos Remotos" },
  { tag: "courseDuration", kind: "text", label: "Duración del curso (horas/semanas)", sample: "40 horas" },
  { tag: "issuedDate", kind: "text", label: "Fecha de emisión", sample: "24 de agosto de 2026" },
  { tag: "finalScore", kind: "text", label: "Nota final", sample: "17.8" },
  { tag: "code", kind: "text", label: "Código de verificación", sample: "INK-2026-00456" },
  { tag: "teacherName", kind: "text", label: "Nombre del docente", sample: "Jorge Salazar" },
  { tag: "institutionSignatureName", kind: "text", label: "Nombre de quien firma por Inkapitales", sample: "Juan Pérez López" },
  { tag: "institutionSignatureTitle", kind: "text", label: "Cargo de quien firma por Inkapitales", sample: "Gerente General" },
  { tag: "qrDataUrl", kind: "image", label: "Código QR de verificación", sample: "" },
  { tag: "teacherSignature", kind: "image", label: "Firma del docente", sample: "" },
  { tag: "institutionSignatureImage", kind: "image", label: "Firma institucional (Inkapitales)", sample: "" },
  { tag: "logo", kind: "image", label: "Logo de Inkademy", sample: "" },
];

/** Solo aplica a plantillas HTML (no tiene sentido en un fondo ya diseñado). */
export const HTML_ONLY_TAGS: CertificateTagDef[] = [
  { tag: "appUrl", kind: "text", label: "URL base del sitio (para armar rutas de imagen)", sample: "https://inkademy.com" },
];

export interface CertificateTagPosition {
  tag: string;
  /** 0-100, relativo al ancho/alto de la página, origen arriba-izquierda (igual que en la vista previa). */
  xPercent: number;
  yPercent: number;
  /** Solo para tags de texto. */
  fontSizePt?: number;
  color?: string; // hex, ej. "#1c2038"
  align?: "left" | "center" | "right";
  /** Tipografía — uno de los 14 fonts estándar de PDF (sin necesidad de incrustar un archivo de fuente). Default "helvetica" si no se especifica. */
  fontFamily?: "helvetica" | "helvetica-bold" | "times" | "times-bold" | "courier";
  /** Solo para tags de imagen (QR, firmas, logo) — porcentaje del ancho/alto de página. */
  widthPercent?: number;
  heightPercent?: number;
}
