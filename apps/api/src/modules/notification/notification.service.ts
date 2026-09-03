import { InjectQueue } from "@nestjs/bullmq";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Queue } from "bullmq";
import type { PrismaClient } from "@inkademy/db";
import { PRISMA } from "../../common/prisma/prisma.module";
import { EMAIL_JOBS, QUEUE_NAMES } from "../../common/queues/queue.constants";
import { NotificationSettingsService } from "../settings/notification-settings.service";

export interface EmailJobPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
  meta?: Record<string, unknown>;
  attachments?: { filename: string; path: string }[];
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
    private readonly config: ConfigService,
    private readonly notificationSettings: NotificationSettingsService,
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
    const appUrl = this.config.get<string>("APP_URL") ?? "http://localhost:3000";
    const link = `${appUrl}/restablecer-password?token=${encodeURIComponent(token)}`;
    return this.enqueueEmail(
      EMAIL_JOBS.FORGOT_PASSWORD,
      {
        to,
        subject: "Recupera tu contraseña — Inkademy",
        html: `<p>Haz clic para restablecer tu contraseña: <a href="${link}">${link}</a>. Expira en 1 hora.</p>`,
        meta: { token, link },
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

  /**
   * "El texto que acompaña el link del certificado por correo debe ser
   * editable (tipo de letra, justificado, color)" — antes este párrafo
   * estaba escrito a mano acá, sin ningún control desde el admin. Se
   * resuelve desde PlatformSettings.certificateEmailText (localizado,
   * con los mismos placeholders {{courseTitle}}/{{verificationUrl}} que ya
   * usa certificate.processor.ts para la plantilla del PDF) — null/vacío
   * cae al texto de siempre.
   */
  private async renderCertificateReadyBody(courseTitle: string, verificationUrl: string): Promise<string> {
    const settings = await this.prisma.platformSettings.findUnique({ where: { id: "default" } });
    const template =
      (settings?.certificateEmailText as Record<string, string> | null)?.es ||
      'Felicitaciones, tu certificado de "{{courseTitle}}" está disponible. Verifícalo en {{verificationUrl}}.';
    const text = template
      .replace(/\{\{\s*courseTitle\s*\}\}/g, courseTitle)
      .replace(/\{\{\s*verificationUrl\s*\}\}/g, verificationUrl);
    const styles = [
      settings?.certificateEmailFontFamily ? `font-family:${settings.certificateEmailFontFamily}` : null,
      `text-align:${settings?.certificateEmailTextAlign || "left"}`,
      settings?.certificateEmailTextColor ? `color:${settings.certificateEmailTextColor}` : null,
    ]
      .filter(Boolean)
      .join(";");
    return `<p style="${styles}">${text}</p>`;
  }

  async sendCertificateReady(to: string, courseTitle: string, verificationUrl: string, userId: string) {
    return this.enqueueEmail(
      EMAIL_JOBS.CERTIFICATE_READY,
      {
        to,
        subject: "Tu certificado está listo",
        html: await this.renderCertificateReadyBody(courseTitle, verificationUrl),
      },
      userId,
    );
  }

  sendLiveSessionRescheduled(
    to: string,
    courseTitle: string,
    previousStartsAt: Date,
    newStartsAt: Date,
    reason: string,
    userId: string,
  ) {
    const fmt = (d: Date) =>
      d.toLocaleString("es-PE", { dateStyle: "full", timeStyle: "short", timeZone: "America/Lima" });
    return this.enqueueEmail(
      EMAIL_JOBS.LIVE_SESSION_RESCHEDULED,
      {
        to,
        subject: `Cambio de horario: ${courseTitle}`,
        html: `<p>La clase en vivo de <b>${courseTitle}</b> cambió de horario.</p>
<p>Antes: ${fmt(previousStartsAt)}<br/>Ahora: <b>${fmt(newStartsAt)}</b></p>
<p>Motivo: ${reason}</p>
<p>Tu agenda en Inkademy ya se actualizó automáticamente.</p>`,
        meta: { previousStartsAt: previousStartsAt.toISOString(), newStartsAt: newStartsAt.toISOString(), reason },
      },
      userId,
    );
  }

  sendFreeAccessGranted(to: string, offeringTitle: string, userId: string) {
    return this.enqueueEmail(
      EMAIL_JOBS.GENERIC,
      {
        to,
        subject: `Te otorgamos acceso gratuito a "${offeringTitle}"`,
        html: `<p>El equipo de Inkademy te otorgó acceso gratuito a <b>${offeringTitle}</b>. Ya puedes verlo en tu campus.</p>`,
      },
      userId,
    );
  }

  /**
   * "Enviar por correo" desde /campus/certificados — antes solo existía
   * descargar o ir a la verificación pública, sin forma de mandarse (o
   * mandarle a un tercero, p.ej. RR.HH.) el PDF ya firmado por correo.
   * `pdfUrl` es una URL http(s) — nodemailer la adjunta descargándola él
   * mismo, no hace falta traer los bytes a mano en apps/api.
   */
  sendCertificateCopy(to: string, courseTitle: string, pdfUrl: string, userId: string) {
    return this.enqueueEmail(
      EMAIL_JOBS.CERTIFICATE_COPY,
      {
        to,
        subject: `Tu certificado de "${courseTitle}"`,
        html: `<p>Adjunto va tu certificado de <b>${courseTitle}</b>.</p>`,
        attachments: [{ filename: `certificado-${courseTitle}.pdf`.replace(/\s+/g, "-"), path: pdfUrl }],
      },
      userId,
    );
  }

  async sendSupportTicketUpdate(to: string, subject: string, userId: string, ticketId?: string) {
    await this.enqueueEmail(
      EMAIL_JOBS.SUPPORT_TICKET_UPDATE,
      {
        to,
        subject: `Actualización en tu ticket: ${subject}`,
        html: `<p>Hay una nueva respuesta en tu ticket de soporte "${subject}".</p>`,
      },
      userId,
    );
    // Módulo de notificaciones: además del correo (arriba, sin cambios),
    // esto gana la campana in-app — gateado por NotificationSettings, a
    // diferencia del correo que siempre se manda (comportamiento previo
    // intacto).
    const settings = await this.notificationSettings.get();
    if (settings.supportTicketUpdateInApp) {
      await this.prisma.notification.create({
        data: {
          userId,
          channel: "IN_APP",
          template: EMAIL_JOBS.SUPPORT_TICKET_UPDATE,
          type: "SUPPORT_TICKET_UPDATE",
          title: `Actualización en tu ticket: ${subject}`,
          body: `Hay una nueva respuesta en tu ticket de soporte "${subject}".`,
          url: ticketId ? `/campus/soporte/${ticketId}` : undefined,
          status: "SENT",
          sentAt: new Date(),
        },
      });
    }
  }

  /**
   * Respuesta del admin a una sugerencia ("me gustaría un curso de...") —
   * antes las sugerencias solo se marcaban con un estado interno
   * (NEW/REVIEWED/PLANNED/DECLINED) y quien la envió nunca se enteraba de
   * nada.
   */
  /**
   * Aviso automático cuando una sugerencia pasa a PLANNED/DECLINED sin que
   * el admin haya escrito una respuesta manual — le da utilidad real al
   * cambio de estado en vez de ser solo una etiqueta interna que el
   * usuario nunca se enteraría que cambió.
   */
  sendSuggestionStatusChanged(to: string, originalMessage: string, status: "PLANNED" | "DECLINED", userId: string) {
    const isPlanned = status === "PLANNED";
    return this.enqueueEmail(
      EMAIL_JOBS.GENERIC,
      {
        to,
        subject: isPlanned ? "¡Tu sugerencia fue planificada! — Inkademy" : "Actualización sobre tu sugerencia — Inkademy",
        html: `<p>Tu sugerencia:</p><blockquote>${originalMessage}</blockquote><p>${
          isPlanned
            ? "Buenas noticias: la vamos a implementar. Te avisaremos cuando esté disponible."
            : "Por ahora no la vamos a implementar — gracias de todas formas por tomarte el tiempo de escribirnos."
        }</p>`,
      },
      userId,
    );
  }

  sendSuggestionResponse(to: string, originalMessage: string, response: string, userId: string) {
    return this.enqueueEmail(
      EMAIL_JOBS.GENERIC,
      {
        to,
        subject: "Respuesta a tu sugerencia en Inkademy",
        html: `<p>Gracias por tu sugerencia:</p><blockquote>${originalMessage}</blockquote><p>${response}</p>`,
      },
      userId,
    );
  }

  /** Encuesta NPS enviada al administrador de la empresa (B2B, Fase 2) — ver NpsService.sendToCompany. */
  sendNpsSurveyInvite(to: string, companyName: string, html: string, surveyUrl: string, userId: string) {
    return this.enqueueEmail(
      EMAIL_JOBS.GENERIC,
      {
        to,
        subject: `Tu opinión nos importa — ${companyName}`,
        html,
        meta: { surveyUrl },
      },
      userId,
    );
  }

  /** Ventas ya fijó un monto real para la cotización que pidió la empresa (pipeline comercial, Fase 2). */
  sendQuoteResponded(to: string, amount: number, currency: string, userId: string) {
    const formatted = `${currency === "USD" ? "US$" : "S/"} ${amount.toLocaleString("es-PE", { minimumFractionDigits: 2 })}`;
    return this.enqueueEmail(
      EMAIL_JOBS.GENERIC,
      {
        to,
        subject: "Tu cotización está lista — Inkademy",
        html: `<p>Ya tenemos lista la cotización que pediste: <b>${formatted}</b>.</p><p>Ingresa a tu panel de empresa para revisar el detalle y aceptarla o rechazarla.</p>`,
      },
      userId,
    );
  }

  /** "Esto me debería permitir descargarlo o pasarlo a PDF o mandarlo por correo" — envía el reporte financiero como adjunto. */
  sendFinancialReport(to: string, pdfUrl: string, periodLabel: string) {
    return this.enqueueEmail(EMAIL_JOBS.GENERIC, {
      to,
      subject: `Reporte financiero Inkademy — ${periodLabel}`,
      html: `<p>Adjuntamos el estado financiero de Inkademy correspondiente a <b>${periodLabel}</b>.</p>`,
      attachments: [{ filename: `inkademy-finanzas-${periodLabel.replace(/\s+/g, "-")}.pdf`, path: pdfUrl }],
    });
  }
}
