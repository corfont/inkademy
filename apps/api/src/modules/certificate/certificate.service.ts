import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { ConfigService } from "@nestjs/config";
import type { Queue } from "bullmq";
import { ZipArchive } from "archiver";
import type { PrismaClient } from "@inkademy/db";
import type { CertificateDTO } from "@inkademy/shared";
import { PRISMA } from "../../common/prisma/prisma.module";
import { StorageService } from "../../storage/storage.service";
import { CERTIFICATE_JOBS, QUEUE_NAMES } from "../../common/queues/queue.constants";
import { NotificationService } from "../notification/notification.service";
import { computeCourseScore } from "../assessment/course-score";

@Injectable()
export class CertificateService {
  private readonly logger = new Logger(CertificateService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly storage: StorageService,
    private readonly notifications: NotificationService,
    private readonly config: ConfigService,
    @InjectQueue(QUEUE_NAMES.CERTIFICATE) private readonly certificateQueue: Queue,
  ) {}

  /**
   * Link público de verificación (va en el QR del PDF y en el DTO expuesto
   * al alumno). Debe apuntar a la página humana del frontend (`/verificar/:codigo`,
   * ver apps/web), NO al endpoint JSON de la API — este último (`GET
   * /certificates/verify/:code`) es el que esa página consume por debajo.
   */
  private verificationUrl(code: string) {
    const appUrl = this.config.get<string>("APP_URL", "http://localhost:3000");
    return `${appUrl}/verificar/${code}`;
  }

  /**
   * Evalúa la ApprovalRule del curso contra el estado actual de la matrícula
   * y, si se cumple y no existe certificado aún, lo crea y encola el job
   * "certificate" para que apps/worker genere el PDF real.
   */
  async checkAndIssueIfEligible(enrollmentId: string): Promise<void> {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      include: { certificate: true, user: true, course: true },
    });
    if (!enrollment || enrollment.certificate || enrollment.offeringKind !== "COURSE" || !enrollment.courseId) {
      return;
    }
    // "Si un alumno hace el curso varias veces, no debería generarse tantos
    // certificados — solo uno por curso, se crea una sola vez y ya se da
    // por realizado" — si YA existe un certificado de este usuario para
    // este curso (emitido desde una matrícula anterior, p.ej. antes de un
    // retake), no se emite uno nuevo. La matrícula sigue completándose con
    // normalidad (ver EnrollmentService.refreshCompletionStatus) — esto
    // solo evita el segundo PDF/código duplicado.
    const existingCertificate = await this.prisma.certificate.findFirst({
      where: { userId: enrollment.userId, courseId: enrollment.courseId, revoked: false },
    });
    if (existingCertificate) return;
    // "Si no responde [las estrellas] el curso no se podrá dar por
    // finalizado y el certificado no se podrá emitir" — cross-matrícula
    // (mismo criterio que EnrollmentService.computeApprovalMissing): si ya
    // calificó este curso alguna vez, cuenta para cualquier matrícula al
    // mismo curso, no solo para la que originó la calificación.
    const rating = await this.prisma.courseRating.findFirst({ where: { userId: enrollment.userId, courseId: enrollment.courseId } });
    if (!rating) return;
    if (!enrollment.course?.certificationIncluded) return;
    // Si el plazo de acceso del curso ya venció, no se emite certificado —
    // el alumno debía terminar antes de esa fecha (ver Course.accessDurationPolicy).
    // Un admin puede ampliar el plazo como caso especial (AdminService.extendEnrollmentAccess),
    // lo que revierte esto para el siguiente intento.
    if (enrollment.accessExpiresAt && enrollment.accessExpiresAt < new Date()) return;

    // Antes, un curso SIN ApprovalRule (nunca configurada a mano — no había
    // ninguna pantalla de admin para crearla, solo prisma/seed.ts) nunca
    // emitía certificado, sin ningún aviso. Ahora se cae a un default
    // razonable (100% de avance, nota mínima 70) en vez de bloquear en
    // silencio — "también pueden haber cursos sin evaluación", eso no
    // debería impedir jamás el certificado.
    const rule = (await this.prisma.approvalRule.findUnique({ where: { courseId: enrollment.courseId } })) ?? {
      minProgressPct: 100,
      minAttendancePct: null as number | null,
      minConnectionMinutes: null as number | null,
      minScore: 70,
      requiresAssignment: false,
      scoreMode: "BEST_ATTEMPT",
    };

    const progressOk = enrollment.progressPct >= rule.minProgressPct;
    let attendanceOk = true;
    if (rule.minAttendancePct !== null) {
      const totalSessions = await this.prisma.liveSession.count({ where: { courseId: enrollment.courseId } });
      if (totalSessions > 0) {
        // "Si el alumno ha estado 20 min o más se le considera presente" —
        // con minConnectionMinutes configurado, "asistió" exige ese mínimo
        // de minutos reales, no solo haberse conectado un instante.
        const attended = await this.prisma.attendance.count({
          where: {
            userId: enrollment.userId,
            liveSession: { courseId: enrollment.courseId },
            ...(rule.minConnectionMinutes !== null
              ? { durationMin: { gte: rule.minConnectionMinutes } }
              : { joinedAt: { not: null } }),
          },
        });
        attendanceOk = (attended / totalSessions) * 100 >= rule.minAttendancePct;
      }
    }
    // "Este curso no tiene examen, por lo cual no debería aparecer este
    // mensaje" — reporte real: un Assessment vacío (creado desde el editor
    // pero sin ninguna Question ni examen de archivo cargado, p.ej. "A
    // curso" → assessment "prueba" con 0 preguntas) igual contaba como "el
    // curso SÍ tiene examen", exigiendo una nota mínima que el alumno JAMÁS
    // podía alcanzar (no hay nada que responder) — el certificado quedaba
    // bloqueado para siempre. Ahora solo cuenta como examen real si tiene
    // preguntas o un archivo de examen cualitativo configurado.
    const { hasAssessments, finalScore } = await computeCourseScore(this.prisma, enrollmentId, enrollment.courseId, rule.scoreMode ?? "BEST_ATTEMPT");
    const scoreOk = !hasAssessments || (finalScore ?? 0) >= rule.minScore;

    let assignmentOk = true;
    if (rule.requiresAssignment) {
      const gradedAssignment = await this.prisma.answer.findFirst({
        where: { attempt: { enrollmentId }, question: { type: "OPEN" }, isCorrect: true },
      });
      assignmentOk = Boolean(gradedAssignment);
    }

    if (!(progressOk && attendanceOk && scoreOk && assignmentOk)) return;

    // El curso puede tener una plantilla asignada explícitamente desde
    // /admin/catalogo/:id (ver CourseEditor) — se respeta esa elección
    // siempre que siga activa. Si no hay ninguna asignada (o quedó
    // desactivada), cae al comportamiento anterior: la plantilla activa más
    // reciente que coincida con el locale del alumno, y si no hay ninguna
    // en ese locale, cualquier plantilla activa.
    let fallbackTemplate = null as Awaited<ReturnType<typeof this.prisma.certificateTemplate.findFirst>>;
    if (enrollment.course?.certificateTemplateId) {
      fallbackTemplate = await this.prisma.certificateTemplate.findFirst({
        where: { id: enrollment.course.certificateTemplateId, active: true },
      });
    }
    if (!fallbackTemplate) {
      fallbackTemplate = await this.prisma.certificateTemplate.findFirst({
        where: { active: true, locale: enrollment.user.locale },
        orderBy: { version: "desc" },
      });
    }
    if (!fallbackTemplate) {
      fallbackTemplate = await this.prisma.certificateTemplate.findFirst({ where: { active: true } });
    }
    if (!fallbackTemplate) {
      this.logger.warn("No hay CertificateTemplate activo — no se puede emitir certificado todavía");
      return;
    }

    // "El administrador puede escoger si quiere que los certificados le
    // lleguen al administrador, al usuario o a ambos" — solo aplica a
    // matrículas de empresa (enrollment.companyId); una compra B2C siempre
    // va al alumno, como siempre. deliveredTo queda grabado en el
    // certificado (no se recalcula después) para que el aviso que ve el
    // alumno en /campus/certificados sea fiel a lo que de verdad pasó al
    // emitirse, aunque la empresa cambie su preferencia más adelante.
    const deliveredTo = enrollment.companyId
      ? ((await this.prisma.company.findUnique({ where: { id: enrollment.companyId } }))?.certificateDeliveryTarget ?? "STUDENT")
      : "STUDENT";

    const certificate = await this.prisma.certificate.create({
      data: {
        userId: enrollment.userId,
        courseId: enrollment.courseId,
        enrollmentId: enrollment.id,
        templateId: fallbackTemplate.id,
        templateVersion: fallbackTemplate.version,
        finalScore: finalScore ?? null,
        deliveredTo,
        criteriaSnapshot: {
          minProgressPct: rule.minProgressPct,
          minAttendancePct: rule.minAttendancePct,
          minScore: rule.minScore,
          scoreMode: rule.scoreMode ?? "BEST_ATTEMPT",
          requiresAssignment: rule.requiresAssignment,
          achievedProgressPct: enrollment.progressPct,
          achievedScore: finalScore ?? null,
        },
      },
    });

    // El Certificate YA quedó creado arriba (fuente de verdad de "se emitió"
    // — checkAndIssueIfEligible es idempotente por el chequeo de
    // existingCertificate al inicio). Encolar el PDF y avisar por correo son
    // efectos secundarios best-effort: si BullMQ/Redis tiene un problema
    // transitorio acá, NO debe tumbar la acción del alumno que disparó esto
    // (marcar una lección leída, terminar un examen) con un 500 — esa
    // acción ya tuvo éxito antes de llegar a este método. Un log de error
    // deja rastro para investigar; la fila de Certificate sin pdfAssetId
    // (o el Notification en FAILED) queda visible para el admin, ver
    // /admin/certificados y /admin/soporte → "Notificaciones fallidas".
    try {
      await this.certificateQueue.add(
        CERTIFICATE_JOBS.GENERATE,
        { certificateId: certificate.id },
        { attempts: 3, backoff: { type: "exponential", delay: 10000 }, removeOnComplete: true, removeOnFail: 100 },
      );
    } catch (err) {
      this.logger.error(`No se pudo encolar la generación del PDF del certificado ${certificate.id}: ${(err as Error).message}`);
    }

    const courseTitle = ((enrollment.course?.title as Record<string, string>) ?? {}).es ?? "tu curso";
    const verificationUrl = this.verificationUrl(certificate.code);
    const recipients: string[] = [];
    if (deliveredTo === "STUDENT" || deliveredTo === "BOTH") recipients.push(enrollment.user.email);
    if (deliveredTo === "COMPANY_ADMIN" || deliveredTo === "BOTH") {
      const admins = await this.prisma.companyMembership.findMany({
        where: { companyId: enrollment.companyId!, role: "COMPANY_ADMIN", status: "ACTIVE" },
        include: { user: true },
      });
      recipients.push(...admins.map((m) => m.user.email));
    }
    for (const email of recipients) {
      try {
        await this.notifications.sendCertificateReady(email, courseTitle, verificationUrl, enrollment.userId);
      } catch (err) {
        this.logger.error(`No se pudo avisar por correo el certificado ${certificate.id} a ${email}: ${(err as Error).message}`);
      }
    }
  }

  /**
   * Vuelve a generar el PDF de un certificado ya emitido — el worker solo
   * renderiza una vez ("el certificado ya tiene PDF generado, se omite"),
   * así que si el admin configura/actualiza la firma del docente o de la
   * institución DESPUÉS de que un certificado ya se emitió, ese PDF queda
   * congelado sin la firma para siempre. Reporte real: "cuando pongo emitir
   * certificado no me aparece ni una firma y debería aparecer si ya se
   * tiene configurada" — el certificado se había generado antes de
   * configurar la firma.
   */
  async regenerate(certificateId: string) {
    const certificate = await this.prisma.certificate.findUnique({ where: { id: certificateId } });
    if (!certificate) throw new NotFoundException("Certificado no encontrado");
    await this.prisma.certificate.update({ where: { id: certificateId }, data: { pdfAssetId: null } });
    await this.certificateQueue.add(
      CERTIFICATE_JOBS.GENERATE,
      { certificateId },
      { attempts: 3, backoff: { type: "exponential", delay: 10000 }, removeOnComplete: true, removeOnFail: 100 },
    );
    return { regenerating: true };
  }

  async listMine(userId: string): Promise<CertificateDTO[]> {
    const certificates = await this.prisma.certificate.findMany({
      where: { userId },
      include: { course: true, program: true },
      orderBy: { issuedAt: "desc" },
    });
    return certificates.map((c) => ({
      id: c.id,
      code: c.code,
      issuedAt: c.issuedAt.toISOString(),
      title: (c.course?.title ?? c.program?.title ?? {}) as Record<string, string>,
      finalScore: c.finalScore,
      pdfUrl: c.pdfAssetId ? this.storage.getPublicUrl(c.pdfAssetId) : null,
      verificationUrl: this.verificationUrl(c.code),
      deliveredTo: c.deliveredTo,
    }));
  }

  /**
   * Antes /admin/certificados y /empresa/:id/certificados mostraban
   * siempre datos de referencia porque no existía ningún endpoint para
   * listar certificados emitidos fuera de "los míos" (GET /me/certificates).
   */
  async listAll(): Promise<
    Array<CertificateDTO & { holderName: string; revoked: boolean; courseId: string | null; companyId: string | null; companyName: string | null }>
  > {
    const certificates = await this.prisma.certificate.findMany({
      include: { user: true, course: true, program: true, enrollment: { include: { company: true } } },
      orderBy: { issuedAt: "desc" },
      take: 200,
    });
    return certificates.map((c) => ({
      id: c.id,
      code: c.code,
      issuedAt: c.issuedAt.toISOString(),
      title: (c.course?.title ?? c.program?.title ?? {}) as Record<string, string>,
      finalScore: c.finalScore,
      pdfUrl: c.pdfAssetId ? this.storage.getPublicUrl(c.pdfAssetId) : null,
      verificationUrl: this.verificationUrl(c.code),
      holderName: c.user.displayName ?? `${c.user.firstName} ${c.user.lastName}`,
      revoked: c.revoked,
      courseId: c.courseId,
      companyId: c.enrollment.companyId,
      companyName: c.enrollment.company?.legalName ?? null,
    }));
  }

  /**
   * Descarga masiva de certificados en un solo .zip — antes solo se podía
   * descargar de a uno (GET /certificates/:id/pdf). Admite los mismos
   * filtros que la tabla de /admin/certificados (curso/empresa) para no
   * forzar a descargar los 200 si el admin ya filtró la vista.
   */
  async exportZip(filters: { courseId?: string; companyId?: string }): Promise<{ filename: string; archive: ZipArchive }> {
    const certificates = await this.prisma.certificate.findMany({
      where: {
        pdfAssetId: { not: null },
        ...(filters.courseId ? { courseId: filters.courseId } : {}),
        ...(filters.companyId ? { enrollment: { companyId: filters.companyId } } : {}),
      },
      include: { user: true, course: true, program: true },
      orderBy: { issuedAt: "desc" },
    });

    // archiver@8 cambió su API: ya no exporta una función factory
    // (archiver('zip', opts), como en versiones anteriores) sino la clase
    // ZipArchive directamente.
    const archive = new ZipArchive({ zlib: { level: 9 } });
    // Se arma en segundo plano mientras Nest ya empezó a mandar la respuesta
    // (streaming) — si un PDF individual falla (p.ej. se borró del bucket),
    // se lo salta con un log en vez de tirar abajo el ZIP completo.
    void (async () => {
      for (const c of certificates) {
        if (!c.pdfAssetId) continue;
        try {
          const buffer = await this.storage.getObjectBuffer(c.pdfAssetId);
          const holderName = (c.user.displayName ?? `${c.user.firstName} ${c.user.lastName}`).replace(/[^\w\s-]/g, "").trim();
          const courseTitle = ((c.course?.title ?? c.program?.title ?? {}) as Record<string, string>).es ?? "curso";
          archive.append(buffer, { name: `${courseTitle} - ${holderName} - ${c.code}.pdf` });
        } catch (err) {
          this.logger.warn(`No se pudo incluir el certificado ${c.code} en el ZIP: ${(err as Error).message}`);
        }
      }
      await archive.finalize();
    })();

    return { filename: `certificados-${new Date().toISOString().slice(0, 10)}.zip`, archive };
  }

  async listForCompany(companyId: string): Promise<Array<CertificateDTO & { holderName: string; revoked: boolean }>> {
    const certificates = await this.prisma.certificate.findMany({
      where: { enrollment: { companyId } },
      include: { user: true, course: true, program: true },
      orderBy: { issuedAt: "desc" },
    });
    return certificates.map((c) => ({
      id: c.id,
      code: c.code,
      issuedAt: c.issuedAt.toISOString(),
      title: (c.course?.title ?? c.program?.title ?? {}) as Record<string, string>,
      finalScore: c.finalScore,
      pdfUrl: c.pdfAssetId ? this.storage.getPublicUrl(c.pdfAssetId) : null,
      verificationUrl: this.verificationUrl(c.code),
      holderName: c.user.displayName ?? `${c.user.firstName} ${c.user.lastName}`,
      revoked: c.revoked,
    }));
  }

  async verifyByCode(code: string) {
    const certificate = await this.prisma.certificate.findUnique({
      where: { code },
      include: { user: true, course: true, program: true },
    });
    if (!certificate) throw new NotFoundException("Certificado no encontrado");

    return {
      valid: !certificate.revoked,
      code: certificate.code,
      holderName: `${certificate.user.firstName} ${certificate.user.lastName}`,
      title: (certificate.course?.title ?? certificate.program?.title ?? {}) as Record<string, string>,
      issuedAt: certificate.issuedAt.toISOString(),
      status: certificate.revoked ? "REVOKED" : "VALID",
      // Antes /verificar/:codigo solo mostraba texto (titular/curso/fecha)
      // sin forma de ver el PDF real ya llenado — es información pública
      // (cualquiera con el código puede verificar), así que exponer el PDF
      // acá es consistente con el propósito mismo de la verificación.
      pdfUrl: certificate.pdfAssetId ? this.storage.getPublicUrl(certificate.pdfAssetId) : null,
    };
  }

  /**
   * "Enviar por correo" en /campus/certificados — antes solo había
   * descarga directa o ir a la página pública de verificación, sin forma
   * de mandárselo al propio correo (o para reenviarlo a un tercero, p.ej.
   * RR.HH. de una empresa que lo pide como respaldo).
   */
  async emailToSelf(certificateId: string, requestingUserId: string) {
    const certificate = await this.prisma.certificate.findUnique({
      where: { id: certificateId },
      include: { user: true, course: true, program: true },
    });
    if (!certificate) throw new NotFoundException("Certificado no encontrado");
    if (certificate.userId !== requestingUserId) {
      throw new ForbiddenException("No puedes enviar el certificado de otro usuario");
    }
    if (!certificate.pdfAssetId) {
      throw new NotFoundException("El PDF del certificado todavía se está generando");
    }
    const pdfUrl = this.storage.getPublicUrl(certificate.pdfAssetId) ?? (await this.storage.getSignedUrl(certificate.pdfAssetId));
    const courseTitle = ((certificate.course?.title ?? certificate.program?.title ?? {}) as Record<string, string>).es ?? "tu curso";
    await this.notifications.sendCertificateCopy(certificate.user.email, courseTitle, pdfUrl, certificate.userId);
    return { sent: true };
  }

  async getDownloadRedirectUrl(certificateId: string, requestingUserId: string, isAdmin: boolean) {
    const certificate = await this.prisma.certificate.findUnique({ where: { id: certificateId } });
    if (!certificate) throw new NotFoundException("Certificado no encontrado");
    if (!isAdmin && certificate.userId !== requestingUserId) {
      throw new ForbiddenException("No puedes descargar el certificado de otro usuario");
    }
    if (!certificate.pdfAssetId) {
      throw new NotFoundException("El PDF del certificado todavía se está generando");
    }
    // Bug real encontrado en vivo: esto usaba getSignedUrl a secas, construida
    // sobre S3_ENDPOINT (host interno, p.ej. "http://minio:9000" dentro de
    // docker-compose) — inalcanzable desde el navegador del alumno en cuanto
    // S3_ENDPOINT difiere de S3_PUBLIC_BASE_URL. El resto del servicio
    // (listMine/listAll/listForCompany/verifyByCode, y sendCopyToSelf arriba)
    // ya usa getPublicUrl con este mismo fallback — se alinea acá también.
    return this.storage.getPublicUrl(certificate.pdfAssetId) ?? (await this.storage.getSignedUrl(certificate.pdfAssetId));
  }
}
