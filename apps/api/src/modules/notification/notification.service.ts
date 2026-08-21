import { InjectQueue } from "@nestjs/bullmq";
import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Queue } from "bullmq";
import type { PrismaClient } from "@inkademy/db";
import { PRISMA } from "../../common/prisma/prisma.module";
import { EMAIL_JOBS, QUEUE_NAMES } from "../../common/queues/queue.constants";

export interface EmailJobPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
  meta?: Record<string, unknown>;
}

/**
 * Plantillas simples (texto/HTML embebido) + encolado a la cola "email".
 * El envío SMTP real ocurre en apps/worker, que consume estos jobs.
 * También registra una fila en `Notification` para trazabilidad / bandeja
 * in-app del usuario.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @InjectQueue(QUEUE_NAMES.EMAIL) private readonly emailQueue: Queue,
  ) {}

  private async enqueueEmail(jobName: string, payload: EmailJobPayload, userId?: string) {
    await this.emailQueue.add(jobName, payload, {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: true,
      removeOnFail: 100,
    });
    if (userId) {
      await this.prisma.notification.create({
        data: {
          userId,
          channel: "EMAIL",
          template: jobName,
          payload: payload as unknown as object,
          status: "PENDING",
        },
      });
    }
    this.logger.log(`Job "${jobName}" encolado en cola "${QUEUE_NAMES.EMAIL}" -> ${payload.to}`);
  }

  sendWelcome(to: string, firstName: string, userId: string) {
    return this.enqueueEmail(
      EMAIL_JOBS.WELCOME,
      {
        to,
        subject: "¡Bienvenido a Inkademy!",
        html: `<p>Hola ${firstName}, gracias por registrarte en Inkademy. Ya puedes explorar el catálogo de cursos.</p>`,
      },
      userId,
    );
  }

  sendVerifyEmail(to: string, token: string, userId: string) {
    return this.enqueueEmail(
      EMAIL_JOBS.VERIFY_EMAIL,
      {
        to,
        subject: "Verifica tu correo — Inkademy",
        html: `<p>Confirma tu correo con el código: <b>${token}</b></p>`,
        meta: { token },
      },
      userId,
    );
  }

  sendForgotPassword(to: string, token: string, userId: string) {
    return this.enqueueEmail(
      EMAIL_JOBS.FORGOT_PASSWORD,
      {
        to,
        subject: "Recupera tu contraseña — Inkademy",
        html: `<p>Usa este token para restablecer tu contraseña: <b>${token}</b>. Expira en 1 hora.</p>`,
        meta: { token },
      },
      userId,
    );
  }

  sendReceipt(to: string, orderId: string, total: string, currency: string, userId: string) {
    return this.enqueueEmail(
      EMAIL_JOBS.RECEIPT,
      {
        to,
        subject: `Comprobante de tu compra #${orderId.slice(0, 8)}`,
        html: `<p>Gracias por tu compra. Total pagado: ${currency} ${total}.</p>`,
        meta: { orderId },
      },
      userId,
    );
  }

  sendCompanyInvite(to: string, companyName: string, inviteUserId?: string) {
    return this.enqueueEmail(
      EMAIL_JOBS.COMPANY_INVITE,
      {
        to,
        subject: `Te invitaron a ${companyName} en Inkademy`,
        html: `<p>Fuiste invitado a formar parte del equipo de ${companyName} en Inkademy.</p>`,
      },
      inviteUserId,
    );
  }

  sendCertificateReady(to: string, courseTitle: string, verificationUrl: string, userId: string) {
    return this.enqueueEmail(
      EMAIL_JOBS.CERTIFICATE_READY,
      {
        to,
        subject: "Tu certificado está listo",
        html: `<p>Felicitaciones, tu certificado de "${courseTitle}" está disponible. Verifícalo en ${verificationUrl}.</p>`,
      },
      userId,
    );
  }

  sendSupportTicketUpdate(to: string, subject: string, userId: string) {
    return this.enqueueEmail(
      EMAIL_JOBS.SUPPORT_TICKET_UPDATE,
      {
        to,
        subject: `Actualización en tu ticket: ${subject}`,
        html: `<p>Hay una nueva respuesta en tu ticket de soporte "${subject}".</p>`,
      },
      userId,
    );
  }
}
