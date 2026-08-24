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
import type { PrismaClient } from "@inkademy/db";
import type { CertificateDTO } from "@inkademy/shared";
import { PRISMA } from "../../common/prisma/prisma.module";
import { StorageService } from "../../storage/storage.service";
import { CERTIFICATE_JOBS, QUEUE_NAMES } from "../../common/queues/queue.constants";
import { NotificationService } from "../notification/notification.service";

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
    if (!enrollment.course?.certificationIncluded) return;

    const rule = await this.prisma.approvalRule.findUnique({ where: { courseId: enrollment.courseId } });
    if (!rule) return;

    const progressOk = enrollment.progressPct >= rule.minProgressPct;
    let attendanceOk = true;
    if (rule.minAttendancePct !== null) {
      const totalSessions = await this.prisma.liveSession.count({ where: { courseId: enrollment.courseId } });
      if (totalSessions > 0) {
        const attended = await this.prisma.attendance.count({
          where: {
            userId: enrollment.userId,
            liveSession: { courseId: enrollment.courseId },
            joinedAt: { not: null },
          },
        });
        attendanceOk = (attended / totalSessions) * 100 >= rule.minAttendancePct;
      }
    }
    const bestAttempt = await this.prisma.assessmentAttempt.findFirst({
      where: { enrollmentId, score: { not: null } },
      orderBy: { score: "desc" },
    });
    const scoreOk = (bestAttempt?.score ?? 0) >= rule.minScore;

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

    const certificate = await this.prisma.certificate.create({
      data: {
        userId: enrollment.userId,
        courseId: enrollment.courseId,
        enrollmentId: enrollment.id,
        templateId: fallbackTemplate.id,
        templateVersion: fallbackTemplate.version,
        finalScore: bestAttempt?.score ?? null,
        criteriaSnapshot: {
          minProgressPct: rule.minProgressPct,
          minAttendancePct: rule.minAttendancePct,
          minScore: rule.minScore,
          requiresAssignment: rule.requiresAssignment,
          achievedProgressPct: enrollment.progressPct,
          achievedScore: bestAttempt?.score ?? null,
        },
      },
    });

    await this.certificateQueue.add(
      CERTIFICATE_JOBS.GENERATE,
      { certificateId: certificate.id },
      { attempts: 3, backoff: { type: "exponential", delay: 10000 }, removeOnComplete: true },
    );

    const courseTitle = ((enrollment.course?.title as Record<string, string>) ?? {}).es ?? "tu curso";
    await this.notifications.sendCertificateReady(
      enrollment.user.email,
      courseTitle,
      this.verificationUrl(certificate.code),
      enrollment.userId,
    );
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
    }));
  }

  /**
   * Antes /admin/certificados y /empresa/:id/certificados mostraban
   * siempre datos de referencia porque no existía ningún endpoint para
   * listar certificados emitidos fuera de "los míos" (GET /me/certificates).
   */
  async listAll(): Promise<Array<CertificateDTO & { holderName: string; revoked: boolean }>> {
    const certificates = await this.prisma.certificate.findMany({
      include: { user: true, course: true, program: true },
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
    }));
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
    return this.storage.getSignedUrl(certificate.pdfAssetId);
  }
}
