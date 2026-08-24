import nodemailer, { type Transporter } from "nodemailer";
import { createLogger } from "./logger";

const logger = createLogger("mailer");

let transporter: Transporter | null = null;

/** Transport SMTP compartido (Mailhog en dev, SMTP real en prod). */
export function getMailTransport(): Transporter {
  if (transporter) return transporter;

  // "127.0.0.1" en vez de "localhost": en macOS/Docker Desktop, Node puede
  // resolver "localhost" a "::1" (IPv6) primero, y el mapeo de puertos de
  // Docker a veces no escucha ahí — eso produce timeouts largos e
  // intermitentes ("Greeting never received") en vez de un error inmediato.
  const host = process.env.SMTP_HOST ?? "127.0.0.1";
  const port = Number(process.env.SMTP_PORT ?? 1025);
  const secure = process.env.SMTP_SECURE === "true";
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user ? { user, pass } : undefined,
  });

  return transporter;
}

export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /**
   * `path` puede ser una URL http(s) — nodemailer la descarga él mismo al
   * enviar, no hace falta traer los bytes a mano (usado para adjuntar el
   * PDF de un certificado, ver certificate.processor / "reenviar por correo").
   */
  attachments?: { filename: string; path: string }[];
}

export async function sendMail(input: SendMailInput): Promise<void> {
  const from = process.env.EMAIL_FROM ?? "Inkademy <no-reply@inkademy.com>";
  const transport = getMailTransport();
  await transport.sendMail({
    from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    attachments: input.attachments,
  });
  logger.info("email enviado", { to: input.to, subject: input.subject, attachments: input.attachments?.length ?? 0 });
}
