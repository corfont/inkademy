import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { PrismaClient } from "@inkademy/db";
import { PRISMA } from "../../common/prisma/prisma.module";
import { NotificationService } from "../notification/notification.service";

const SURVEY_ID = "default";
const DEFAULT_QUESTION = {
  es: "Del 0 al 10, ¿qué tan probable es que recomiendes Inkademy a otra empresa?",
};

/**
 * Encuesta NPS de una sola pregunta para empresas B2B (Fase 2). "La
 * estructura de la pregunta la establece el administrador" — una fila
 * singleton (mismo patrón que ChatbotSettings/SunatSettings), y cada envío
 * a una empresa genera un NpsSurveyResponse con un token público (sin
 * login, igual que /verificar/:codigo de certificados) para que el
 * contacto de la empresa responda desde el correo.
 */
@Injectable()
export class NpsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly notifications: NotificationService,
    private readonly config: ConfigService,
  ) {}

  async getQuestion() {
    const row = await this.prisma.npsSurvey.findUnique({ where: { id: SURVEY_ID } });
    return {
      question: (row?.question as Record<string, string>) ?? DEFAULT_QUESTION,
      active: row?.active ?? true,
      updatedAt: row?.updatedAt ?? null,
    };
  }

  async updateQuestion(question: { es: string; en?: string }) {
    await this.prisma.npsSurvey.upsert({
      where: { id: SURVEY_ID },
      create: { id: SURVEY_ID, question },
      update: { question },
    });
    return this.getQuestion();
  }

  /** Empresas con su último envío (si hubo alguno) — para la lista de /admin/encuestas-nps. */
  async listCompaniesWithLastSend() {
    const [companies, lastResponses] = await Promise.all([
      this.prisma.company.findMany({ orderBy: { legalName: "asc" } }),
      this.prisma.npsSurveyResponse.findMany({ orderBy: { sentAt: "desc" } }),
    ]);
    const lastByCompany = new Map<string, (typeof lastResponses)[number]>();
    for (const r of lastResponses) {
      if (!lastByCompany.has(r.companyId)) lastByCompany.set(r.companyId, r);
    }
    return companies.map((c) => {
      const last = lastByCompany.get(c.id);
      return {
        id: c.id,
        legalName: c.legalName,
        lastSentAt: last?.sentAt.toISOString() ?? null,
        lastRespondedAt: last?.respondedAt?.toISOString() ?? null,
        lastScore: last?.score ?? null,
      };
    });
  }

  /**
   * "Se podrá mandar al correo registrado de la empresa" — Company no tiene
   * un email propio en el modelo; el contacto real es quien administra su
   * cuenta en la plataforma (CompanyMembership role=COMPANY_ADMIN), igual
   * criterio que ya usa el resto de notificaciones B2B (ver
   * CompaniesService.respondToQuote, que le escribe a ese mismo usuario).
   */
  async sendToCompany(companyId: string) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException("Empresa no encontrada");

    const survey = await this.prisma.npsSurvey.upsert({
      where: { id: SURVEY_ID },
      create: { id: SURVEY_ID, question: DEFAULT_QUESTION },
      update: {},
    });
    if (!survey.active) throw new BadRequestException("La encuesta NPS está desactivada");

    const admin = await this.prisma.companyMembership.findFirst({
      where: { companyId, role: "COMPANY_ADMIN", status: "ACTIVE" },
      include: { user: true },
      orderBy: { joinedAt: "asc" },
    });
    if (!admin) {
      throw new BadRequestException("Esta empresa no tiene un administrador de empresa activo a quién enviarle la encuesta");
    }

    const response = await this.prisma.npsSurveyResponse.create({
      data: { surveyId: survey.id, companyId, sentToEmail: admin.user.email },
    });

    const appUrl = this.config.get<string>("APP_URL", "http://localhost:3000");
    const surveyUrl = `${appUrl}/encuesta/${response.token}`;
    const question = (survey.question as Record<string, string>).es ?? DEFAULT_QUESTION.es;
    await this.notifications.sendNpsSurveyInvite(admin.user.email, company.legalName, question, surveyUrl, admin.user.id);

    return { sent: true, sentToEmail: admin.user.email };
  }

  /** Resultados agregados (fórmula NPS estándar) + detalle de comentarios. */
  async listResponses(companyId?: string) {
    const responses = await this.prisma.npsSurveyResponse.findMany({
      where: { respondedAt: { not: null }, ...(companyId ? { companyId } : {}) },
      include: { company: true },
      orderBy: { respondedAt: "desc" },
    });
    const total = responses.length;
    const promoters = responses.filter((r) => (r.score ?? 0) >= 9).length;
    const detractors = responses.filter((r) => (r.score ?? 0) <= 6).length;
    const npsScore = total > 0 ? Math.round(((promoters - detractors) / total) * 100) : null;

    return {
      npsScore,
      totalResponses: total,
      promoters,
      passives: total - promoters - detractors,
      detractors,
      responses: responses.map((r) => ({
        id: r.id,
        companyId: r.companyId,
        companyName: r.company.legalName,
        score: r.score,
        comment: r.comment,
        respondedAt: r.respondedAt?.toISOString() ?? null,
      })),
    };
  }

  // --- Público (sin login, vía token — mismo patrón que /verificar/:codigo) ---

  async getByToken(token: string) {
    const response = await this.prisma.npsSurveyResponse.findUnique({
      where: { token },
      include: { survey: true, company: true },
    });
    if (!response) throw new NotFoundException("Encuesta no encontrada");
    return {
      companyName: response.company.legalName,
      question: (response.survey.question as Record<string, string>) ?? DEFAULT_QUESTION,
      alreadyResponded: Boolean(response.respondedAt),
    };
  }

  async submitResponse(token: string, score: number, comment?: string) {
    const response = await this.prisma.npsSurveyResponse.findUnique({ where: { token } });
    if (!response) throw new NotFoundException("Encuesta no encontrada");
    if (response.respondedAt) throw new BadRequestException("Esta encuesta ya fue respondida");

    await this.prisma.npsSurveyResponse.update({
      where: { token },
      data: { score, comment: comment ?? null, respondedAt: new Date() },
    });
    return { saved: true };
  }
}
