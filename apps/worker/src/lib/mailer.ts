import nodemailer, { type Transporter } from "nodemailer";
import { prisma } from "@inkademy/db";
import { createLogger } from "./logger";

const logger = createLogger("mailer");
const SETTINGS_ID = "default";

let transporter: Transporter | null = null;
let transporterSignature = "";
let cachedFrom = "";

/**
 * "Configurar los servidores para poder mandar correos" — antes el SMTP
 * SOLO se leía de variables de entorno; ahora se lee primero de
 * `EmailServerSettings` (configurable en /admin/configuracion) y cae a las
 * mismas env vars de siempre si no hay fila o el campo viene vacío — mismo
 * patrón "DB primero, env de respaldo" que SunatSettings/ChatbotSettings.
 * El transporter se reconstruye solo si la configuración efectiva cambió
 * (comparando una "firma" host:port:secure:user), para no reabrir la
 * conexión SMTP en cada correo.
 */
async function resolveConfig() {
  const row = await prisma.emailServerSettings.findUnique({ where: { id: SETTINGS_ID } }).catch(() => null);

  const host = row?.host || process.env.SMTP_HOST || "127.0.0.1";
  const port = row?.port ?? Number(process.env.SMTP_PORT ?? 1025);
  const secure = row?.host ? row.secure : process.env.SMTP_SECURE === "true";
  const user = row?.username || process.env.SMTP_USER;
  const pass = row?.password || process.env.SMTP_PASS;
  const from = row?.fromEmail
    ? `${row.fromName || "Inkademy"} <${row.fromEmail}>`
    : (process.env.EMAIL_FROM ?? "Inkademy <no-reply@inkademy.com>");

  return { host, port, secure, user, pass, from };
}

export async function getMailTransport(): Promise<Transporter> {
  const config = await resolveConfig();
  const signature = `${config.host}:${config.port}:${config.secure}:${config.user ?? ""}`;
  cachedFrom = config.from;

  if (transporter && signature === transporterSignature) return transporter;

  // "127.0.0.1" en vez de "localhost": en macOS/Docker Desktop, Node puede
  // resolver "localhost" a "::1" (IPv6) primero, y el mapeo de puertos de
  // Docker a veces no escucha ahí — eso produce timeouts largos e
  // intermitentes ("Greeting never received") en vez de un error inmediato.
  transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user ? { user: config.user, pass: config.pass } : undefined,
  });
  transporterSignature = signature;
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
  const transport = await getMailTransport();
  await transport.sendMail({
    from: cachedFrom,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    attachments: input.attachments,
  });
  logger.info("email enviado", { to: input.to, subject: input.subject, attachments: input.attachments?.length ?? 0 });
}
