import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import AdmZip from "adm-zip";
import { XMLParser } from "fast-xml-parser";
import type { PrismaClient } from "@inkademy/db";
import { PRISMA } from "../../common/prisma/prisma.module";
import { StorageService } from "../../storage/storage.service";
import { contentTypeFromPath } from "./scorm-content-type";
import { buildScormPlayerHtml } from "./scorm-shim";
import { buildScormContentHtml, buildScormManifestXml, type ScormAuthoredContent } from "@inkademy/shared";

interface ScormSessionPayload {
  sub: string;
  // Ausente en modo "scorm-preview" — el admin/docente prueba el paquete
  // ANTES de que exista ninguna matrícula real (ver createPreviewSession).
  enrollmentId?: string;
  lessonId: string;
  scope: "scorm" | "scorm-preview";
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * "Me gustaría implementar módulos SCORM o paquetes interactivos" —
 * confirmado con el usuario como Fase 1 acotada: subir y reproducir
 * paquetes SCORM 1.2/2004 reales, usando el motor de quizzes/ramificación
 * que YA trae el propio paquete (no se construye un motor de branching
 * propio). Este servicio hace dos cosas separadas:
 * 1. Ingesta (admin): desempaqueta el .zip, ubica el punto de entrada real
 *    leyendo imsmanifest.xml, sube cada archivo a S3/MinIO preservando su
 *    estructura relativa (el paquete referencia sus propios assets por
 *    ruta relativa).
 * 2. Reproducción (alumno): expone el contenido detrás de un shim de la
 *    API SCORM (ver scorm-shim.ts) para que el paquete pueda reportar
 *    avance/nota, sin depender de cookies de sesión — ver createSession.
 */
@Injectable()
export class ScormService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly storage: StorageService,
    private readonly jwt: JwtService,
  ) {}

  /**
   * Desempaqueta el .zip y sube cada archivo a S3/MinIO bajo
   * `scorm/{lessonId}/...`. Path traversal (zip-slip) se rechaza
   * explícitamente — un .zip no es más confiable que cualquier otro upload
   * de terceros solo porque lo suba un docente.
   */
  async ingestPackage(lessonId: string, zipBuffer: Buffer, teacherUserId?: string): Promise<{ entryPath: string; version: string }> {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId }, include: { module: true } });
    if (!lesson) throw new NotFoundException("Lección no encontrada");
    // Mismo criterio que el resto de edición de contenido — TEACHER solo
    // puede subir el paquete si es CourseStaff del curso dueño (ver
    // AdminService.assertTeacherOwnsLesson, mismo patrón replicado acá
    // porque ese helper es privado de AdminService).
    if (teacherUserId) {
      const membership = await this.prisma.courseStaff.findFirst({ where: { courseId: lesson.module.courseId, userId: teacherUserId } });
      if (!membership) throw new ForbiddenException("No tienes asignado este curso");
    }

    let zip: AdmZip;
    try {
      zip = new AdmZip(zipBuffer);
    } catch {
      throw new BadRequestException("El archivo no es un .zip válido");
    }
    const entries = zip.getEntries().filter((e) => !e.isDirectory);
    if (entries.length === 0) throw new BadRequestException("El paquete SCORM está vacío");

    const manifestEntry = entries.find((e) => e.entryName.toLowerCase().endsWith("imsmanifest.xml"));
    if (!manifestEntry) throw new BadRequestException("El paquete no tiene imsmanifest.xml — no parece ser un paquete SCORM válido");

    const { entryPath, version } = this.parseManifest(manifestEntry.getData().toString("utf-8"));

    const prefix = `scorm/${lessonId}/`;
    for (const entry of entries) {
      const relative = entry.entryName.replace(/\\/g, "/");
      // zip-slip: una ruta que intente salir del prefijo del paquete (../,
      // o absoluta) se descarta en vez de subirse — nunca confiamos en el
      // path declarado dentro de un .zip de terceros.
      if (relative.startsWith("/") || relative.split("/").includes("..")) continue;
      const key = prefix + relative;
      await this.storage.uploadBuffer(key, entry.getData(), contentTypeFromPath(relative));
    }

    await this.prisma.lesson.update({
      where: { id: lessonId },
      // scormAuthoredContent en null: si esta lección tenía un paquete
      // armado con el constructor, subir un .zip a mano lo reemplaza por
      // completo — ya no hay una definición editable detrás de este archivo.
      data: { contentType: "SCORM", scormPackagePrefix: prefix, scormEntryPath: entryPath, scormVersion: version, scormAuthoredContent: null as never },
    });

    return { entryPath, version };
  }

  /**
   * Genera el paquete (imsmanifest.xml + index.html) a partir de la
   * definición armada con el constructor y lo sube al mismo prefijo que
   * usaría un .zip subido a mano — el reproductor del alumno (ScormPlayer/
   * scorm-shim.ts) no distingue el origen, así que no necesita ningún
   * cambio para reproducir esto.
   */
  async buildFromAuthoredContent(lessonId: string, content: ScormAuthoredContent, teacherUserId?: string) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId }, include: { module: true } });
    if (!lesson) throw new NotFoundException("Lección no encontrada");
    if (teacherUserId) {
      const membership = await this.prisma.courseStaff.findFirst({ where: { courseId: lesson.module.courseId, userId: teacherUserId } });
      if (!membership) throw new ForbiddenException("No tienes asignado este curso");
    }

    const title = (lesson.title as Record<string, string> | null)?.es ?? "Contenido SCORM";
    const manifestXml = buildScormManifestXml(lessonId, title);
    const contentHtml = buildScormContentHtml(content, title);

    const prefix = `scorm/${lessonId}/`;
    await this.storage.uploadBuffer(prefix + "imsmanifest.xml", Buffer.from(manifestXml, "utf-8"), "application/xml");
    await this.storage.uploadBuffer(prefix + "index.html", Buffer.from(contentHtml, "utf-8"), "text/html");

    await this.prisma.lesson.update({
      where: { id: lessonId },
      data: {
        contentType: "SCORM",
        scormPackagePrefix: prefix,
        scormEntryPath: "index.html",
        scormVersion: "1.2",
        scormAuthoredContent: content as never,
      },
    });

    return { entryPath: "index.html", version: "1.2" };
  }

  /**
   * Arma un .zip real y descargable con lo mismo que ya se generó y subió
   * — sirve para reutilizar el paquete fuera de Inkademy en cualquier otro
   * LMS que lea SCORM 1.2 estándar (ya lo es: mismo imsmanifest.xml/
   * index.html que reproduce esta misma plataforma).
   */
  async exportPackageZip(lessonId: string, teacherUserId?: string): Promise<Buffer> {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId }, include: { module: true } });
    if (!lesson) throw new NotFoundException("Lección no encontrada");
    if (teacherUserId) {
      const membership = await this.prisma.courseStaff.findFirst({ where: { courseId: lesson.module.courseId, userId: teacherUserId } });
      if (!membership) throw new ForbiddenException("No tienes asignado este curso");
    }
    if (!lesson.scormPackagePrefix) throw new BadRequestException("Esta lección todavía no tiene un paquete SCORM generado");

    const manifest = await this.storage.getObjectBuffer(lesson.scormPackagePrefix + "imsmanifest.xml");
    const index = await this.storage.getObjectBuffer(lesson.scormPackagePrefix + (lesson.scormEntryPath ?? "index.html"));

    const zip = new AdmZip();
    zip.addFile("imsmanifest.xml", manifest);
    zip.addFile(lesson.scormEntryPath ?? "index.html", index);
    return zip.toBuffer();
  }

  /**
   * Ubica el punto de entrada real del paquete (organización por defecto →
   * primer item con identifierref → resource con ese identifier → su href)
   * y detecta la versión SCORM. Si el manifest viene mal formado o con una
   * estructura atípica, cae a buscar un index.html/index_lms.html/story.html
   * conocido — mejor un intento razonable que bloquear la subida.
   */
  private parseManifest(xml: string): { entryPath: string; version: string } {
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", parseTagValue: false });
    let doc: any;
    try {
      doc = parser.parse(xml);
    } catch {
      throw new BadRequestException("No se pudo leer imsmanifest.xml — el archivo XML está corrupto");
    }
    const manifest = doc?.manifest;
    if (!manifest) throw new BadRequestException("imsmanifest.xml no tiene un elemento <manifest> raíz");

    const schemaversionRaw = String(manifest?.metadata?.schemaversion ?? "");
    const version = schemaversionRaw.trim().startsWith("1.2") ? "1.2" : "2004";

    const resources = asArray(manifest?.resources?.resource);
    const resourceHrefByIdentifier = new Map(resources.map((r: any) => [String(r?.["@_identifier"] ?? ""), String(r?.["@_href"] ?? "")]));

    const defaultOrgId = manifest?.organizations?.["@_default"];
    const organizations = asArray(manifest?.organizations?.organization);
    const org = organizations.find((o: any) => String(o?.["@_identifier"] ?? "") === String(defaultOrgId)) ?? organizations[0];

    const firstItemRef = org ? this.findFirstItemIdentifierRef(org) : undefined;
    const entryPath = firstItemRef ? resourceHrefByIdentifier.get(firstItemRef) : undefined;

    if (entryPath) return { entryPath, version };

    // Fallback: si no se pudo resolver por el manifest, al menos el primer
    // resource con href sirve casi siempre en la práctica.
    const anyHref = resources.map((r: any) => String(r?.["@_href"] ?? "")).find(Boolean);
    if (anyHref) return { entryPath: anyHref, version };

    throw new BadRequestException("No se pudo determinar el archivo de entrada del paquete SCORM (imsmanifest.xml sin resources con href)");
  }

  /** Recorre <item> recursivamente (pueden anidarse) y devuelve el primer identifierref real (hoja lanzable). */
  private findFirstItemIdentifierRef(node: any): string | undefined {
    const items = asArray(node?.item);
    for (const item of items) {
      const ref = item?.["@_identifierref"];
      if (ref) return String(ref);
      const nested = this.findFirstItemIdentifierRef(item);
      if (nested) return nested;
    }
    return undefined;
  }

  /**
   * Token de sesión de reproducción, con alcance propio ("scope: scorm") —
   * a propósito NO es el access token normal de la sesión del alumno: el
   * contenido SCORM corre JS arbitrario de un tercero (el autor del
   * paquete) dentro de un iframe, así que solo debe poder llegar a estos
   * tres endpoints (player/content/progress) y a nada más de la API.
   */
  async createSession(userId: string, enrollmentId: string, lessonId: string): Promise<{ token: string }> {
    const enrollment = await this.prisma.enrollment.findUnique({ where: { id: enrollmentId } });
    if (!enrollment || enrollment.userId !== userId) throw new ForbiddenException("Esta matrícula no te pertenece");
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId }, include: { module: true } });
    if (!lesson || lesson.module.courseId !== enrollment.courseId) throw new NotFoundException("Lección no encontrada en este curso");
    if (lesson.contentType !== "SCORM" || !lesson.scormPackagePrefix || !lesson.scormEntryPath) {
      throw new BadRequestException("Esta lección no tiene un paquete SCORM cargado");
    }
    const payload: ScormSessionPayload = { sub: userId, enrollmentId, lessonId, scope: "scorm" };
    const token = this.jwt.sign(payload, { expiresIn: "6h" });
    return { token };
  }

  /**
   * "Vista previa" para ADMIN/TEACHER antes de publicar — mismo mecanismo
   * de reproducción que un alumno real (getPlayerHtml/getContentFile no
   * distinguen el scope), pero sin atarse a ninguna Enrollment (no existe
   * ninguna todavía si el curso ni se publicó) y reportProgress ignora este
   * scope explícitamente — probarlo nunca ensucia el progreso de nadie.
   */
  async createPreviewSession(userId: string, lessonId: string, teacherUserId?: string): Promise<{ token: string }> {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId }, include: { module: true } });
    if (!lesson) throw new NotFoundException("Lección no encontrada");
    if (teacherUserId) {
      const membership = await this.prisma.courseStaff.findFirst({ where: { courseId: lesson.module.courseId, userId: teacherUserId } });
      if (!membership) throw new ForbiddenException("No tienes asignado este curso");
    }
    if (lesson.contentType !== "SCORM" || !lesson.scormPackagePrefix || !lesson.scormEntryPath) {
      throw new BadRequestException("Esta lección no tiene un paquete SCORM cargado");
    }
    const payload: ScormSessionPayload = { sub: userId, lessonId, scope: "scorm-preview" };
    const token = this.jwt.sign(payload, { expiresIn: "1h" });
    return { token };
  }

  private verifyToken(token: string): ScormSessionPayload {
    let payload: ScormSessionPayload;
    try {
      payload = this.jwt.verify<ScormSessionPayload>(token);
    } catch {
      throw new UnauthorizedException("Token de sesión SCORM inválido o vencido");
    }
    if (payload.scope !== "scorm" && payload.scope !== "scorm-preview") {
      throw new UnauthorizedException("Token no válido para reproducción SCORM");
    }
    return payload;
  }

  async getPlayerHtml(token: string): Promise<string> {
    const { lessonId, enrollmentId, scope } = this.verifyToken(token);
    const lesson = await this.prisma.lesson.findUniqueOrThrow({ where: { id: lessonId } });
    // El token va COMO SEGMENTO DE RUTA (no query string) en /scorm/content/:token/*path
    // a propósito: el paquete SCORM referencia sus propios assets (imágenes/
    // css/js/otras páginas) con rutas RELATIVAS dentro de su propio HTML, y
    // el navegador las resuelve relativas a la URL actual del documento —
    // si el token/path fueran query params, esas referencias relativas
    // resolverían mal (perderían el token y el prefijo). Con el token en el
    // path, cada archivo hermano/hijo se resuelve correctamente bajo el
    // mismo prefijo /scorm/content/{token}/.
    const contentUrl = `/scorm/content/${encodeURIComponent(token)}/${lesson.scormEntryPath!}`;
    const progressUrl = `/scorm/progress?token=${encodeURIComponent(token)}`;
    // Reanudar: la vista previa (sin Enrollment real detrás) siempre parte
    // de cero — no hay ningún progreso real que reanudar. Una sesión real
    // busca si ya existe progreso guardado para esta matrícula+lección.
    let initialLocation: string | null = null;
    let initialSuspendData: string | null = null;
    if (scope === "scorm" && enrollmentId) {
      const progress = await this.prisma.lessonProgress.findUnique({ where: { enrollmentId_lessonId: { enrollmentId, lessonId } } });
      initialLocation = progress?.scormLessonLocation ?? null;
      initialSuspendData = progress?.scormSuspendData ?? null;
    }
    return buildScormPlayerHtml({
      contentUrl,
      progressUrl,
      title: (lesson.title as Record<string, string>)?.es ?? "Contenido SCORM",
      initialLocation,
      initialEntry: initialLocation ? "resume" : "ab-initio",
      initialSuspendData,
    });
  }

  async getContentFile(token: string, requestedPath: string): Promise<{ buffer: Buffer; contentType: string }> {
    const { lessonId } = this.verifyToken(token);
    const lesson = await this.prisma.lesson.findUniqueOrThrow({ where: { id: lessonId } });
    if (!lesson.scormPackagePrefix) throw new NotFoundException("Paquete SCORM no encontrado");
    // Mismo criterio anti zip-slip que en la subida — nunca se resuelve una
    // ruta relativa pedida por el propio contenido sin sanearla primero.
    const normalized = requestedPath.replace(/\\/g, "/").replace(/^\/+/, "");
    if (normalized.split("/").includes("..")) throw new BadRequestException("Ruta inválida");
    const key = lesson.scormPackagePrefix + normalized;
    let buffer: Buffer;
    try {
      buffer = await this.storage.getObjectBuffer(key);
    } catch {
      throw new NotFoundException("Archivo no encontrado en el paquete SCORM");
    }
    return { buffer, contentType: contentTypeFromPath(normalized) };
  }

  async reportProgress(
    token: string,
    input: {
      completionStatus?: string;
      scoreRaw?: number | null;
      lessonLocation?: string | null;
      suspendData?: string | null;
      interactions?: { id: string; type: string; response: string; correct: boolean }[];
    },
  ): Promise<void> {
    const { sub: userId, enrollmentId, lessonId, scope } = this.verifyToken(token);
    // Modo vista previa: el admin/docente lo está probando antes de
    // publicar, sin ninguna matrícula real detrás — no hay dónde guardar
    // el progreso, y no debería haberlo (no es un intento real de nadie).
    if (scope === "scorm-preview" || !enrollmentId) return;
    const COMPLETED_STATUSES = new Set(["completed", "passed", "satisfied"]);
    const completed = input.completionStatus ? COMPLETED_STATUSES.has(input.completionStatus) : false;
    await this.prisma.lessonProgress.upsert({
      where: { enrollmentId_lessonId: { enrollmentId, lessonId } },
      create: {
        enrollmentId,
        lessonId,
        userId,
        completed,
        scormCompletionStatus: input.completionStatus ?? null,
        scormScoreRaw: input.scoreRaw ?? null,
        scormLessonLocation: input.lessonLocation ?? null,
        scormSuspendData: input.suspendData ?? null,
        scormInteractions: (input.interactions?.length ? input.interactions : null) as never,
      },
      update: {
        // No se "des-completa" una lección que ya estaba marcada completa
        // por un reporte posterior con estado distinto (p.ej. el alumno
        // vuelve a abrir el SCORM solo para repasar).
        completed: completed || undefined,
        scormCompletionStatus: input.completionStatus ?? undefined,
        scormScoreRaw: input.scoreRaw ?? undefined,
        scormLessonLocation: input.lessonLocation ?? undefined,
        scormSuspendData: input.suspendData ?? undefined,
        // Solo se pisa la analítica si este reporte SÍ trae interacciones —
        // los Commit intermedios de "reanudar" (sin cmi.interactions todavía)
        // no deben borrar el detalle de un intento anterior ya completo.
        scormInteractions: input.interactions?.length ? (input.interactions as never) : undefined,
      },
    });
  }

  /**
   * "Analítica por pregunta" — agrega cmi.interactions de TODOS los
   * intentos guardados para esta lección: % de aciertos por pregunta (para
   * ver "la pregunta 3 la falla el 40%"), score promedio, tasa de
   * finalización. Cierra el círculo "se guarda" → "se puede ver".
   */
  async getAnalytics(lessonId: string, teacherUserId?: string) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId }, include: { module: true } });
    if (!lesson) throw new NotFoundException("Lección no encontrada");
    if (teacherUserId) {
      const membership = await this.prisma.courseStaff.findFirst({ where: { courseId: lesson.module.courseId, userId: teacherUserId } });
      if (!membership) throw new ForbiddenException("No tienes asignado este curso");
    }
    const rows = await this.prisma.lessonProgress.findMany({ where: { lessonId } });
    const totalAttempts = rows.length;
    const completedCount = rows.filter((r) => r.completed).length;
    const scores = rows.map((r) => r.scormScoreRaw).filter((s): s is number => s != null);
    const averageScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

    const perQuestion = new Map<string, { id: string; type: string; correct: number; total: number }>();
    for (const row of rows) {
      const interactions = (row.scormInteractions as { id: string; type: string; correct: boolean }[] | null) ?? [];
      for (const it of interactions) {
        const entry = perQuestion.get(it.id) ?? { id: it.id, type: it.type, correct: 0, total: 0 };
        entry.total += 1;
        if (it.correct) entry.correct += 1;
        perQuestion.set(it.id, entry);
      }
    }

    return {
      totalAttempts,
      completedCount,
      completionRate: totalAttempts > 0 ? Math.round((completedCount / totalAttempts) * 100) : 0,
      averageScore,
      perQuestion: Array.from(perQuestion.values()).map((q) => ({
        ...q,
        correctRate: q.total > 0 ? Math.round((q.correct / q.total) * 100) : 0,
      })),
    };
  }
}
