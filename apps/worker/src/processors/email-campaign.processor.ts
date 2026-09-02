import { prisma } from "@inkademy/db";
import { WORKER_EMAIL_JOBS } from "../queues";
import { notifyByEmail } from "../lib/notify";
import { callGeminiIfEnabled } from "../lib/gemini";
import { createLogger } from "../lib/logger";

const logger = createLogger("email-campaign.processor");

function pickEs(text: unknown): string {
  const t = text as Record<string, string> | null | undefined;
  return t?.es ?? t?.en ?? "";
}

function appUrl(): string {
  return process.env.APP_URL ?? "http://localhost:3000";
}

interface AudienceFilter {
  interests?: string[];
  areaIds?: string[];
  courseIds?: string[];
  companyId?: string;
  inactiveDays?: number;
  enrollmentStatus?: "ANY" | "HAS_ACTIVE" | "COMPLETED_NO_ACTIVE" | "NONE";
  countries?: string[];
  globalRole?: string;
  excludeRecentPurchaseDays?: number;
}

/**
 * Espejo de `AdminService.resolveEmailAudience` (apps/api/src/modules/admin/admin.service.ts)
 * — duplicado a propósito porque el envío real ocurre acá, en el sweep del
 * worker, no en apps/api (mismo patrón de duplicación mínima ya usado para
 * SUNAT/Gemini). SI TOCAS UNO, TOCA EL OTRO — hasta ahora este solo
 * implementaba 4 de los 9 filtros (courseIds/enrollmentStatus/countries/
 * globalRole/excludeRecentPurchaseDays quedaban silenciosamente
 * ignorados al enviar de verdad, aunque la vista previa del admin sí los
 * aplicaba) — bug real de auditoría, corregido acá con el mismo algoritmo
 * exacto que usa admin.service.ts.
 */
async function resolveAudience(filter: AudienceFilter | null | undefined) {
  let enrolledUserIds: string[] | undefined;
  if (filter?.areaIds?.length || filter?.courseIds?.length) {
    const rows = await prisma.enrollment.findMany({
      where: {
        OR: [
          ...(filter?.areaIds?.length ? [{ course: { areaId: { in: filter.areaIds } } }] : []),
          ...(filter?.courseIds?.length ? [{ courseId: { in: filter.courseIds } }] : []),
        ],
      },
      select: { userId: true },
      distinct: ["userId"],
    });
    enrolledUserIds = rows.map((r) => r.userId);
  }

  let inactiveBeforeUserIds: string[] | undefined;
  if (filter?.inactiveDays) {
    const cutoff = new Date(Date.now() - filter.inactiveDays * 24 * 60 * 60 * 1000);
    const recentlyActive = await prisma.lessonProgress.findMany({
      where: { updatedAt: { gte: cutoff } },
      select: { userId: true },
      distinct: ["userId"],
    });
    const activeIds = new Set(recentlyActive.map((r) => r.userId));
    const all = await prisma.user.findMany({ where: { status: "active" }, select: { id: true } });
    inactiveBeforeUserIds = all.map((u) => u.id).filter((id) => !activeIds.has(id));
  }

  // "Los que están llevando un curso o más, los que ya culminaron y no
  // están llevando nada, los que aún no han llevado ninguno" — mismo
  // criterio que admin.service.ts (semáforo de /admin/usuarios).
  let enrollmentStatusUserIds: string[] | undefined;
  if (filter?.enrollmentStatus && filter.enrollmentStatus !== "ANY") {
    const rows = await prisma.enrollment.groupBy({ by: ["userId", "status"] });
    const byUser = new Map<string, Set<string>>();
    for (const r of rows) {
      (byUser.get(r.userId) ?? byUser.set(r.userId, new Set()).get(r.userId)!).add(r.status);
    }
    const allUsers = await prisma.user.findMany({ where: { status: "active" }, select: { id: true } });
    enrollmentStatusUserIds = allUsers
      .map((u) => u.id)
      .filter((id) => {
        const statuses = byUser.get(id);
        if (filter.enrollmentStatus === "NONE") return !statuses || statuses.size === 0;
        if (filter.enrollmentStatus === "HAS_ACTIVE") return Boolean(statuses?.has("ACTIVE"));
        return Boolean(statuses && statuses.size > 0 && statuses.has("COMPLETED") && !statuses.has("ACTIVE"));
      });
  }

  let recentPurchaserIds: string[] | undefined;
  if (filter?.excludeRecentPurchaseDays) {
    const cutoff = new Date(Date.now() - filter.excludeRecentPurchaseDays * 24 * 60 * 60 * 1000);
    const rows = await prisma.order.findMany({
      where: { status: "PAID", createdAt: { gte: cutoff } },
      select: { userId: true },
      distinct: ["userId"],
    });
    recentPurchaserIds = rows.map((r) => r.userId);
  }

  return prisma.user.findMany({
    where: {
      status: "active",
      marketingConsentEmail: true,
      globalRole: (filter?.globalRole as never) ?? undefined,
      ...(enrolledUserIds ? { id: { in: enrolledUserIds } } : {}),
      ...(inactiveBeforeUserIds ? { id: { in: inactiveBeforeUserIds } } : {}),
      ...(enrollmentStatusUserIds ? { id: { in: enrollmentStatusUserIds } } : {}),
      ...(recentPurchaserIds?.length ? { id: { notIn: recentPurchaserIds } } : {}),
      ...(filter?.interests?.length ? { interests: { hasSome: filter.interests } } : {}),
      ...(filter?.countries?.length ? { country: { in: filter.countries } } : {}),
      ...(filter?.companyId ? { companyMemberships: { some: { companyId: filter.companyId } } } : {}),
    },
    select: { id: true, email: true, firstName: true, interests: true },
  });
}

type Recipient = { id: string; email: string; firstName: string; interests: string[] };

/**
 * Agrupa la audiencia por "interés principal" (primer valor de
 * `interests`, o "general" si no tiene ninguno) para redactar UN correo
 * con IA por grupo en vez de uno por persona — full-personalización 1:1
 * dispararía una llamada a Gemini por destinatario, lo cual no escala y no
 * fue lo pedido ("por área de interés" alcanza con agrupar). Simplificación
 * deliberada, documentada también en el resumen de este batch.
 */
function bucketByInterest(recipients: Recipient[]): Map<string, Recipient[]> {
  const buckets = new Map<string, Recipient[]>();
  for (const r of recipients) {
    const key = r.interests[0] || "general";
    (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(r);
  }
  return buckets;
}

async function coursesForGoal(goal: string, interestKey?: string) {
  if (goal === "DISCOUNTED_COURSES") {
    return prisma.course.findMany({
      where: { status: "PUBLISHED", discountPercent: { gt: 0 }, OR: [{ discountExpiresAt: null }, { discountExpiresAt: { gt: new Date() } }] },
      orderBy: { discountPercent: "desc" },
      take: 5,
      select: { slug: true, title: true, discountPercent: true, priceAmount: true, priceCurrency: true },
    });
  }
  if (goal === "NEW_COURSES") {
    return prisma.course.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { slug: true, title: true, priceAmount: true, priceCurrency: true },
    });
  }
  // RELATED_COURSES / BY_INTEREST — cursos del área/interés del grupo. El
  // filtro es best-effort por nombre de área (interests guarda texto libre,
  // no un areaId), y si no calza nada cae a los más nuevos publicados.
  const byInterest = interestKey
    ? await prisma.course.findMany({
        where: { status: "PUBLISHED", area: { name: { path: ["es"], string_contains: interestKey } } },
        take: 5,
        select: { slug: true, title: true, priceAmount: true, priceCurrency: true },
      })
    : [];
  if (byInterest.length > 0) return byInterest;
  return prisma.course.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { slug: true, title: true, priceAmount: true, priceCurrency: true },
  });
}

async function draftWithAI(campaign: { goal: string | null }, courses: Array<{ slug: string; title: unknown }>): Promise<{ subject: string; html: string } | null> {
  const courseList = courses.map((c) => `- ${pickEs(c.title)} (${appUrl()}/cursos/${c.slug})`).join("\n");
  const goalInstruction: Record<string, string> = {
    RELATED_COURSES: "Redacta un correo breve recomendando estos cursos relacionados a lo que ya estudia el destinatario.",
    NEW_COURSES: "Redacta un correo breve anunciando estos cursos nuevos del catálogo.",
    DISCOUNTED_COURSES: "Redacta un correo breve y persuasivo destacando el descuento de estos cursos (menciona el % de descuento).",
    BY_INTEREST: "Redacta un correo breve recomendando estos cursos según el área de interés del destinatario.",
  };
  const systemPrompt = [
    "Eres el equipo de marketing de Inkademy, una plataforma peruana de cursos y capacitación online.",
    goalInstruction[campaign.goal ?? "NEW_COURSES"] ?? goalInstruction.NEW_COURSES,
    "Responde ÚNICAMENTE con JSON válido de la forma {\"subject\": \"...\", \"html\": \"...\"} sin texto adicional ni bloques de código.",
    "El HTML debe ser simple (párrafos, una lista, un link por curso), en español, cordial y breve — no inventes precios ni datos que no te doy.",
  ].join("\n");

  const userMessage = courseList ? `Cursos a promocionar:\n${courseList}` : "No hay cursos específicos disponibles — redacta algo genérico invitando a explorar el catálogo.";
  const reply = await callGeminiIfEnabled(systemPrompt, userMessage);
  if (!reply) return null;
  try {
    const cleaned = reply.trim().replace(/^```(json)?/i, "").replace(/```$/, "");
    const parsed = JSON.parse(cleaned) as { subject?: string; html?: string };
    if (!parsed.subject || !parsed.html) return null;
    return { subject: parsed.subject, html: parsed.html };
  } catch {
    logger.warn("la IA no devolvió JSON válido para la campaña, se omite este grupo");
    return null;
  }
}

async function sendCampaignToRecipients(campaign: { id: string; name: string }, subject: string, html: string, recipients: Recipient[]) {
  let sent = 0;
  for (const r of recipients) {
    try {
      await notifyByEmail({
        userId: r.id,
        to: r.email,
        template: WORKER_EMAIL_JOBS.EMAIL_CAMPAIGN,
        subject,
        html,
        // "No hay ninguna clave de idempotencia por destinatario — si el
        // worker se reinicia a mitad de envío, el reintento manda de
        // nuevo a todos" — hallazgo de auditoría. jobId determinístico por
        // (campaña, destinatario): BullMQ ignora un `add` con un jobId que
        // ya está esperando/completado en la cola.
        jobId: `email.campaign:${campaign.id}:${r.id}`,
      });
      sent += 1;
    } catch (err) {
      logger.error("no se pudo encolar el envío de la campaña a un destinatario", { campaignId: campaign.id, to: r.email, err: String(err) });
    }
  }
  return sent;
}

function nextScheduledAt(current: Date, recurrence: string): Date | null {
  if (recurrence === "WEEKLY") return new Date(current.getTime() + 7 * 24 * 60 * 60 * 1000);
  if (recurrence === "MONTHLY") {
    const next = new Date(current);
    next.setMonth(next.getMonth() + 1);
    return next;
  }
  return null; // ONCE
}

async function processOneCampaign(campaign: {
  id: string;
  name: string;
  mode: string;
  goal: string | null;
  subject: string | null;
  bodyHtml: string | null;
  audienceFilter: unknown;
  scheduledAt: Date | null;
  recurrence: string;
}) {
  const filter = (campaign.audienceFilter ?? null) as AudienceFilter | null;
  const recipients = await resolveAudience(filter);

  let totalSent = 0;

  if (campaign.mode === "MANUAL") {
    totalSent = await sendCampaignToRecipients(campaign, campaign.subject || campaign.name, campaign.bodyHtml || "", recipients);
  } else {
    // AUTOMATIC_AI: un correo por grupo de interés (ver bucketByInterest).
    const buckets = bucketByInterest(recipients);
    for (const [interestKey, group] of buckets) {
      const courses = await coursesForGoal(campaign.goal ?? "NEW_COURSES", interestKey === "general" ? undefined : interestKey);
      const draft = await draftWithAI({ goal: campaign.goal }, courses);
      if (!draft) {
        logger.warn("no se pudo redactar con IA (asistente apagado, sin API key, o Gemini no respondió) — grupo omitido", {
          campaignId: campaign.id,
          interestKey,
        });
        continue;
      }
      totalSent += await sendCampaignToRecipients(campaign, draft.subject, draft.html, group);
    }
  }

  const next = nextScheduledAt(campaign.scheduledAt ?? new Date(), campaign.recurrence);
  await prisma.emailCampaign.update({
    where: { id: campaign.id },
    data: next
      ? { status: "SCHEDULED", scheduledAt: next, sentAt: new Date(), recipientCount: totalSent }
      : { status: "SENT", sentAt: new Date(), recipientCount: totalSent },
  });

  logger.info("campaña de correo procesada", { campaignId: campaign.id, name: campaign.name, recipients: totalSent, recurrence: campaign.recurrence });
}

export async function runEmailCampaignSweep(): Promise<void> {
  const due = await prisma.emailCampaign.findMany({
    where: { status: "SCHEDULED", scheduledAt: { lte: new Date() } },
  });
  for (const campaign of due) {
    // Reclamo atómico: si el worker se cayó a mitad de un envío anterior,
    // la campaña habría quedado en SENDING (no vuelve a SCHEDULED sola) —
    // este `updateMany` con el guard en el `where` es lo que garantiza que
    // solo UN sweep concurrente/reintentado la toma. El jobId por
    // destinatario (ver sendCampaignToRecipients) es la segunda capa: si
    // de todos modos se reprocesara, no duplicaría los correos ya encolados.
    const claimed = await prisma.emailCampaign.updateMany({
      where: { id: campaign.id, status: "SCHEDULED" },
      data: { status: "SENDING" },
    });
    if (claimed.count === 0) continue;
    try {
      await processOneCampaign(campaign);
    } catch (err) {
      logger.error("fallo al procesar campaña de correo, se reintentará en el próximo sweep", { campaignId: campaign.id, err: String(err) });
      // Sin esto, una campaña que falla a mitad de camino quedaría
      // atascada en SENDING para siempre (el sweep solo busca SCHEDULED) —
      // se libera para que el próximo sweep la vuelva a intentar de verdad.
      await prisma.emailCampaign.update({ where: { id: campaign.id }, data: { status: "SCHEDULED" } }).catch(() => {});
    }
  }
}

