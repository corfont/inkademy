import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import AdmZip from "adm-zip";
import { XMLParser } from "fast-xml-parser";
import type { PrismaClient } from "@inkademy/db";
import { PRISMA } from "../../common/prisma/prisma.module";
import { StorageService } from "../../storage/storage.service";
import { contentTypeFromPath } from "./scorm-content-type";
import { buildScormPlayerHtml } from "./scorm-shim";
import { buildScormContentHtml, buildScormManifestXml, SCORM_EMBEDDABLE_FONTS, type ScormAuthoredContent } from "@inkademy/shared";
import { fetchEmbeddedFontFaceCss } from "./embed-google-font";

type ScormOwnerType = "lesson" | "material";

interface ScormSessionPayload {
  sub: string;
  // Ausente en modo "scorm-preview" — el admin/docente prueba el paquete
  // ANTES de que exista ninguna matrícula real (ver createPreviewSession).
  enrollmentId?: string;
  // "SCORM ya existe pero solo como contenido principal de la lección, no
  // como material" — un paquete SCORM puede colgar de una Lesson (contenido
  // principal) o de un Material (adjunto complementario). El token no sabe
  // ni le importa cuál es cuál más allá de este par: getPlayerHtml/
  // getContentFile/reportProgress resuelven todo a partir de acá.
  ownerType: ScormOwnerType;
  ownerId: string;
  scope: "scorm" | "scorm-preview";
}

// "completed"/"passed"/"satisfied" (no "failed"): mismo criterio en el
// reporte de una lección y en el de un material — terminar en falla no
// "des-completa" el intento a ojos de este set, pero tampoco lo cuenta.
const COMPLETED_STATUSES = new Set(["completed", "passed", "satisfied"]);

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
 *
 * Los métodos de LECCIÓN (ingestPackage/buildFromAuthoredContent/
 * exportPackageZip/createSession/createPreviewSession/getAnalytics) son los
 * originales, sin cambios de comportamiento — se extrajeron helpers
 * privados (validateAndParseZip/uploadZipEntries/uploadAuthoredContent/
 * downloadPackageZip) para que los métodos hermanos de MATERIAL los
 * reutilicen sin duplicar la lógica de zip-slip/manifest/subida.
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

    const { entries, entryPath, version } = this.validateAndParseZip(zipBuffer);
    const prefix = `scorm/${lessonId}/`;
    await this.uploadZipEntries(prefix, entries);

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
    const prefix = `scorm/${lessonId}/`;
    await this.uploadAuthoredContent(prefix, lessonId, title, content);

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

    return this.downloadPackageZip(lesson.scormPackagePrefix, lesson.scormEntryPath ?? "index.html");
  }

  // ============ Material: paquete SCORM como adjunto complementario ============

  /**
   * Mismo criterio que assertTeacherCanEditCourse (admin.service.ts) —
   * replicado acá porque es privado de AdminService — pero exigiendo
   * canEdit=true (no solo membresía). Los métodos de LECCIÓN de arriba solo
   * verifican membresía por una inconsistencia preexistente que no se toca
   * en este pase; para material se usa el criterio correcto desde el
   * principio.
   */
  private async assertTeacherCanEditMaterialCourse(materialId: string, teacherUserId: string): Promise<{ courseId: string }> {
    const material = await this.prisma.material.findUnique({
      where: { id: materialId },
      include: { lesson: { include: { module: true } }, module: true },
    });
    if (!material) throw new NotFoundException("Material no encontrado");
    const courseId = material.lesson?.module.courseId ?? material.module?.courseId;
    if (!courseId) throw new NotFoundException("Material sin curso asociado");
    const membership = await this.prisma.courseStaff.findFirst({ where: { courseId, userId: teacherUserId } });
    if (!membership) throw new ForbiddenException("No tienes asignado este curso");
    if (!membership.canEdit) throw new ForbiddenException("El administrador restringió tu acceso de edición a este curso");
    return { courseId };
  }

  async ingestMaterialPackage(materialId: string, zipBuffer: Buffer, teacherUserId?: string): Promise<{ entryPath: string; version: string }> {
    const material = await this.prisma.material.findUnique({ where: { id: materialId } });
    if (!material) throw new NotFoundException("Material no encontrado");
    if (teacherUserId) await this.assertTeacherCanEditMaterialCourse(materialId, teacherUserId);

    const { entries, entryPath, version } = this.validateAndParseZip(zipBuffer);
    const prefix = `scorm/material/${materialId}/`;
    await this.uploadZipEntries(prefix, entries);

    await this.prisma.material.update({
      where: { id: materialId },
      data: { kind: "scorm", scormPackagePrefix: prefix, scormEntryPath: entryPath, scormVersion: version, scormAuthoredContent: null as never },
    });

    return { entryPath, version };
  }

  async buildMaterialFromAuthoredContent(materialId: string, content: ScormAuthoredContent, teacherUserId?: string) {
    const material = await this.prisma.material.findUnique({ where: { id: materialId } });
    if (!material) throw new NotFoundException("Material no encontrado");
    if (teacherUserId) await this.assertTeacherCanEditMaterialCourse(materialId, teacherUserId);

    const prefix = `scorm/material/${materialId}/`;
    await this.uploadAuthoredContent(prefix, materialId, material.title, content);

    await this.prisma.material.update({
      where: { id: materialId },
      data: { kind: "scorm", scormPackagePrefix: prefix, scormEntryPath: "index.html", scormVersion: "1.2", scormAuthoredContent: content as never },
    });

    return { entryPath: "index.html", version: "1.2" };
  }

  async exportMaterialPackageZip(materialId: string, teacherUserId?: string): Promise<Buffer> {
    const material = await this.prisma.material.findUnique({ where: { id: materialId } });
    if (!material) throw new NotFoundException("Material no encontrado");
    if (teacherUserId) await this.assertTeacherCanEditMaterialCourse(materialId, teacherUserId);
    if (!material.scormPackagePrefix) throw new BadRequestException("Este material todavía no tiene un paquete SCORM generado");

    return this.downloadPackageZip(material.scormPackagePrefix, material.scormEntryPath ?? "index.html");
  }

  async createMaterialSession(userId: string, enrollmentId: string, materialId: string): Promise<{ token: string }> {
    const enrollment = await this.prisma.enrollment.findUnique({ where: { id: enrollmentId } });
    if (!enrollment || enrollment.userId !== userId) throw new ForbiddenException("Esta matrícula no te pertenece");
    const material = await this.prisma.material.findUnique({
      where: { id: materialId },
      include: { lesson: { include: { module: true } }, module: true },
    });
    if (!material) throw new NotFoundException("Material no encontrado");
    const courseId = material.lesson?.module.courseId ?? material.module?.courseId;
    if (!courseId || courseId !== enrollment.courseId) throw new NotFoundException("Material no encontrado en este curso");
    if (material.kind !== "scorm" || !material.scormPackagePrefix || !material.scormEntryPath) {
      throw new BadRequestException("Este material no tiene un paquete SCORM cargado");
    }
    const payload: ScormSessionPayload = { sub: userId, enrollmentId, ownerType: "material", ownerId: materialId, scope: "scorm" };
    const token = this.jwt.sign(payload, { expiresIn: "6h" });
    return { token };
  }

  async createMaterialPreviewSession(userId: string, materialId: string, teacherUserId?: string): Promise<{ token: string }> {
    const material = await this.prisma.material.findUnique({ where: { id: materialId } });
    if (!material) throw new NotFoundException("Material no encontrado");
    if (teacherUserId) await this.assertTeacherCanEditMaterialCourse(materialId, teacherUserId);
    if (material.kind !== "scorm" || !material.scormPackagePrefix || !material.scormEntryPath) {
      throw new BadRequestException("Este material no tiene un paquete SCORM cargado");
    }
    const payload: ScormSessionPayload = { sub: userId, ownerType: "material", ownerId: materialId, scope: "scorm-preview" };
    const token = this.jwt.sign(payload, { expiresIn: "1h" });
    return { token };
  }

  /** Mismo criterio de agregación que getAnalytics, sobre MaterialScormProgress en vez de LessonProgress. */
  async getMaterialAnalytics(materialId: string, teacherUserId?: string) {
    const material = await this.prisma.material.findUnique({ where: { id: materialId } });
    if (!material) throw new NotFoundException("Material no encontrado");
    if (teacherUserId) await this.assertTeacherCanEditMaterialCourse(materialId, teacherUserId);

    const rows = await this.prisma.materialScormProgress.findMany({ where: { materialId } });
    return this.aggregateAnalytics(
      rows.map((r) => ({
        completed: Boolean(r.scormCompletionStatus && COMPLETED_STATUSES.has(r.scormCompletionStatus)),
        scormScoreRaw: r.scormScoreRaw,
        scormInteractions: r.scormInteractions,
      })),
    );
  }

  // ============ Helpers privados compartidos (lección + material) ============

  /** Valida el .zip, exige imsmanifest.xml, y devuelve las entradas + el punto de entrada/versión ya resueltos. */
  private validateAndParseZip(zipBuffer: Buffer): { entries: AdmZip.IZipEntry[]; entryPath: string; version: string } {
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
    return { entries, entryPath, version };
  }

  /** Sube cada entrada del zip bajo `prefix`, rechazando cualquier ruta que intente escapar (zip-slip). */
  private async uploadZipEntries(prefix: string, entries: AdmZip.IZipEntry[]): Promise<void> {
    for (const entry of entries) {
      const relative = entry.entryName.replace(/\\/g, "/");
      if (relative.startsWith("/") || relative.split("/").includes("..")) continue;
      const key = prefix + relative;
      await this.storage.uploadBuffer(key, entry.getData(), contentTypeFromPath(relative));
    }
  }

  /**
   * Genera manifest+HTML desde una definición de autoría y los sube bajo
   * `prefix`. Si el tema elige una tipografía de marca (Google Fonts), se
   * incrusta como datos ACÁ (el servidor sí tiene red) para que el .zip
   * final quede autocontenido — ver embed-google-font.ts. Best-effort: si
   * falla la descarga, el paquete se genera igual con el fallback de
   * sistema del propio stack, nunca bloquea al docente.
   */
  private async uploadAuthoredContent(prefix: string, ownerId: string, title: string, content: ScormAuthoredContent): Promise<void> {
    let embeddedFontFaceCss: string | null = null;
    if (content.theme?.fontFamilyKind === "embedded") {
      const match = SCORM_EMBEDDABLE_FONTS.find((f) => content.theme!.fontFamily.includes(f.googleName));
      if (match) embeddedFontFaceCss = await fetchEmbeddedFontFaceCss(match.googleName);
    }
    const manifestXml = buildScormManifestXml(ownerId, title);
    const contentHtml = buildScormContentHtml(content, title, embeddedFontFaceCss ?? undefined);
    await this.storage.uploadBuffer(prefix + "imsmanifest.xml", Buffer.from(manifestXml, "utf-8"), "application/xml");
    await this.storage.uploadBuffer(prefix + "index.html", Buffer.from(contentHtml, "utf-8"), "text/html");
  }

  /** Vuelve a armar un .zip descargable a partir de lo ya subido bajo `prefix`. */
  private async downloadPackageZip(prefix: string, entryPath: string): Promise<Buffer> {
    const manifest = await this.storage.getObjectBuffer(prefix + "imsmanifest.xml");
    const index = await this.storage.getObjectBuffer(prefix + entryPath);
    const zip = new AdmZip();
    zip.addFile("imsmanifest.xml", manifest);
    zip.addFile(entryPath, index);
    return zip.toBuffer();
  }

  /** Resuelve dónde vive el paquete (Lesson o Material) a partir del par (ownerType, ownerId) del token. */
  private async resolveScormOwner(
    ownerType: ScormOwnerType,
    ownerId: string,
  ): Promise<{ scormPackagePrefix: string | null; scormEntryPath: string | null; title: string }> {
    if (ownerType === "lesson") {
      const lesson = await this.prisma.lesson.findUniqueOrThrow({ where: { id: ownerId } });
      return {
        scormPackagePrefix: lesson.scormPackagePrefix,
        scormEntryPath: lesson.scormEntryPath,
        title: (lesson.title as Record<string, string> | null)?.es ?? "Contenido SCORM",
      };
    }
    const material = await this.prisma.material.findUniqueOrThrow({ where: { id: ownerId } });
    return { scormPackagePrefix: material.scormPackagePrefix, scormEntryPath: material.scormEntryPath, title: material.title };
  }

  private aggregateAnalytics(rows: { completed: boolean; scormScoreRaw: number | null; scormInteractions: unknown }[]) {
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
    const payload: ScormSessionPayload = { sub: userId, enrollmentId, ownerType: "lesson", ownerId: lessonId, scope: "scorm" };
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
    const payload: ScormSessionPayload = { sub: userId, ownerType: "lesson", ownerId: lessonId, scope: "scorm-preview" };
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
    const { ownerType, ownerId, enrollmentId, scope } = this.verifyToken(token);
    const owner = await this.resolveScormOwner(ownerType, ownerId);
    // El token va COMO SEGMENTO DE RUTA (no query string) en /scorm/content/:token/*path
    // a propósito: el paquete SCORM referencia sus propios assets (imágenes/
    // css/js/otras páginas) con rutas RELATIVAS dentro de su propio HTML, y
    // el navegador las resuelve relativas a la URL actual del documento —
    // si el token/path fueran query params, esas referencias relativas
    // resolverían mal (perderían el token y el prefijo). Con el token en el
    // path, cada archivo hermano/hijo se resuelve correctamente bajo el
    // mismo prefijo /scorm/content/{token}/.
    const contentUrl = `/scorm/content/${encodeURIComponent(token)}/${owner.scormEntryPath!}`;
    const progressUrl = `/scorm/progress?token=${encodeURIComponent(token)}`;
    // Reanudar: la vista previa (sin Enrollment real detrás) siempre parte
    // de cero — no hay ningún progreso real que reanudar. Una sesión real
    // busca si ya existe progreso guardado para esta matrícula+dueño.
    let initialLocation: string | null = null;
    let initialSuspendData: string | null = null;
    if (scope === "scorm" && enrollmentId) {
      if (ownerType === "lesson") {
        const progress = await this.prisma.lessonProgress.findUnique({ where: { enrollmentId_lessonId: { enrollmentId, lessonId: ownerId } } });
        initialLocation = progress?.scormLessonLocation ?? null;
        initialSuspendData = progress?.scormSuspendData ?? null;
      } else {
        const progress = await this.prisma.materialScormProgress.findUnique({
          where: { enrollmentId_materialId: { enrollmentId, materialId: ownerId } },
        });
        initialLocation = progress?.scormLessonLocation ?? null;
        initialSuspendData = progress?.scormSuspendData ?? null;
      }
    }
    return buildScormPlayerHtml({
      contentUrl,
      progressUrl,
      title: owner.title,
      initialLocation,
      initialEntry: initialLocation ? "resume" : "ab-initio",
      initialSuspendData,
    });
  }

  async getContentFile(token: string, requestedPath: string): Promise<{ buffer: Buffer; contentType: string }> {
    const { ownerType, ownerId } = this.verifyToken(token);
    const owner = await this.resolveScormOwner(ownerType, ownerId);
    if (!owner.scormPackagePrefix) throw new NotFoundException("Paquete SCORM no encontrado");
    // Mismo criterio anti zip-slip que en la subida — nunca se resuelve una
    // ruta relativa pedida por el propio contenido sin sanearla primero.
    const normalized = requestedPath.replace(/\\/g, "/").replace(/^\/+/, "");
    if (normalized.split("/").includes("..")) throw new BadRequestException("Ruta inválida");
    const key = owner.scormPackagePrefix + normalized;
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
    const { sub: userId, enrollmentId, ownerType, ownerId, scope } = this.verifyToken(token);
    // Modo vista previa: el admin/docente lo está probando antes de
    // publicar, sin ninguna matrícula real detrás — no hay dónde guardar
    // el progreso, y no debería haberlo (no es un intento real de nadie).
    if (scope === "scorm-preview" || !enrollmentId) return;
    const completed = input.completionStatus ? COMPLETED_STATUSES.has(input.completionStatus) : false;

    if (ownerType === "lesson") {
      await this.prisma.lessonProgress.upsert({
        where: { enrollmentId_lessonId: { enrollmentId, lessonId: ownerId } },
        create: {
          enrollmentId,
          lessonId: ownerId,
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
      return;
    }

    // Material: tabla aparte (MaterialScormProgress), deliberadamente NO
    // conectada a MaterialProgress/progressPct — ver nota en prisma/schema.prisma.
    await this.prisma.materialScormProgress.upsert({
      where: { enrollmentId_materialId: { enrollmentId, materialId: ownerId } },
      create: {
        enrollmentId,
        materialId: ownerId,
        userId,
        scormCompletionStatus: input.completionStatus ?? null,
        scormScoreRaw: input.scoreRaw ?? null,
        scormLessonLocation: input.lessonLocation ?? null,
        scormSuspendData: input.suspendData ?? null,
        scormInteractions: (input.interactions?.length ? input.interactions : null) as never,
      },
      update: {
        scormCompletionStatus: input.completionStatus ?? undefined,
        scormScoreRaw: input.scoreRaw ?? undefined,
        scormLessonLocation: input.lessonLocation ?? undefined,
        scormSuspendData: input.suspendData ?? undefined,
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
    return this.aggregateAnalytics(rows.map((r) => ({ completed: r.completed, scormScoreRaw: r.scormScoreRaw, scormInteractions: r.scormInteractions })));
  }
}
