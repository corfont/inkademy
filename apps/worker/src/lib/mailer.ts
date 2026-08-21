import nodemailer, { type Transporter } from "nodemailer";
import { createLogger } from "./logger";

const logger = createLogger("mailer");

let transporter: Transporter | null = null;

/** Transport SMTP compartido (Mailhog en dev, SMTP real en prod). */
export function getMailTransport(): Transporter {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST ?? "localhost";
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
  });
  logger.info("email enviado", { to: input.to, subject: input.subject });
}
