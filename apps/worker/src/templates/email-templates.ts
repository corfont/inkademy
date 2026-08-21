// Plantillas HTML para los correos que el propio worker decide enviar
// (recordatorios, inasistencia, recomendación). Los correos "de negocio"
// (bienvenida, matrícula/recibo, invitación, certificado listo, soporte)
// ya llegan pre-renderizados desde apps/api (ver
// `apps/api/src/modules/notification/notification.service.ts`) — el
// worker no los vuelve a renderizar, solo los envía (ver
// `processors/email.processor.ts`).

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="background:#4338ca;padding:20px 24px;">
                <span style="color:#ffffff;font-size:18px;font-weight:bold;">Inkademy</span>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 24px;font-size:15px;line-height:1.5;">
                <h1 style="font-size:19px;margin:0 0 16px;">${title}</h1>
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;background:#fafafa;font-size:12px;color:#71717a;">
                Inkademy — Plataforma de educación y capacitación virtual. Si no esperabas este correo, puedes ignorarlo.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function button(label: string, url: string): string {
  return `<p style="margin:20px 0;"><a href="${url}" style="background:#4338ca;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:14px;display:inline-block;">${label}</a></p>`;
}

export function renderCourseStartReminder(offset: "7d" | "24h", data: { firstName: string; courseTitle: string; startsAt: string; courseUrl: string }): RenderedEmail {
  const when = offset === "7d" ? "en 7 días" : "en 24 horas";
  const html = `<p>Hola ${data.firstName},</p><p>Tu curso <strong>${data.courseTitle}</strong> inicia ${when} (${data.startsAt}). ¡Prepárate!</p>${button("Ver detalle del curso", data.courseUrl)}`;
  return { subject: `Tu curso empieza ${when}`, html: layout("Recordatorio de inicio de curso", html), text: `Tu curso ${data.courseTitle} inicia ${when}.` };
}

export function renderLiveClassReminder(offset: "1h" | "10min", data: { firstName: string; courseTitle: string; startsAt: string; joinUrl: string }): RenderedEmail {
  const when = offset === "1h" ? "en 1 hora" : "en 10 minutos";
  const html = `<p>Hola ${data.firstName},</p><p>Tu clase en vivo de <strong>${data.courseTitle}</strong> empieza ${when} (${data.startsAt}).</p>${button("Unirme a la clase", data.joinUrl)}`;
  return { subject: `Tu clase en vivo empieza ${when}`, html: layout("Recordatorio de clase en vivo", html), text: `Tu clase en vivo de ${data.courseTitle} empieza ${when}.` };
}

/** Cubre tanto "assessment-due" como "access-expiring" — ambos son un vencimiento con título/fecha/link. */
export function renderDeadlineReminder(offset: "3d" | "24h", data: { firstName: string; title: string; dueAt: string; url: string }): RenderedEmail {
  const when = offset === "3d" ? "en 3 días" : "en 24 horas";
  const html = `<p>Hola ${data.firstName},</p><p>Recuerda que <strong>${data.title}</strong> vence ${when} (${data.dueAt}).</p>${button("Ir ahora", data.url)}`;
  return { subject: `Vence ${when}: ${data.title}`, html: layout("Recordatorio de vencimiento", html), text: `${data.title} vence ${when}.` };
}

export function renderAbsenceNotice(data: { firstName: string; courseTitle: string; sessionDate: string; recordingUrl: string }): RenderedEmail {
  const html = `<p>Hola ${data.firstName},</p><p>Notamos que no asististe a la clase en vivo de <strong>${data.courseTitle}</strong> del ${data.sessionDate}. Puedes ver la grabación aquí:</p>${button("Ver grabación", data.recordingUrl)}`;
  return { subject: `Grabación disponible: ${data.courseTitle}`, html: layout("Te extrañamos en la clase en vivo", html), text: `No asististe a la clase de ${data.courseTitle}. Grabación: ${data.recordingUrl}` };
}

export function renderCourseRecommendation(data: { firstName: string; courseTitle: string; courseUrl: string }): RenderedEmail {
  const html = `<p>Hola ${data.firstName},</p><p>Basado en tu progreso, te recomendamos continuar con <strong>${data.courseTitle}</strong>.</p>${button("Ver curso", data.courseUrl)}`;
  return { subject: "Un curso pensado para ti", html: layout("Recomendación para ti", html), text: `Te recomendamos el curso ${data.courseTitle}.` };
}
