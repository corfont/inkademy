import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@inkademy/db";
import type { PublicQuoteRequestInput } from "@inkademy/shared";
import { PRISMA } from "../../common/prisma/prisma.module";
import { NotificationService } from "../notification/notification.service";
import { CrmBridgeProvider } from "../commerce/providers/crm-bridge.provider";
import { logAudit } from "../admin/audit-log.util";

@Injectable()
export class QuoteLeadsService {
  private readonly logger = new Logger(QuoteLeadsService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly notifications: NotificationService,
    private readonly crm: CrmBridgeProvider,
  ) {}

  /** Recibe la solicitud pública: la guarda primero (nunca se pierde), y los avisos y el CRM van después sin poder tumbarla. */
  async create(input: PublicQuoteRequestInput) {
    // Campo trampa lleno = bot: se responde "ok" igual, sin guardar nada.
    if (input.website) return { received: true };
    const lead = await this.prisma.quoteLead.create({
      data: {
        legalName: input.legalName,
        taxIdType: input.taxIdType,
        taxId: input.taxId || null,
        contactName: input.contactName,
        contactEmail: input.contactEmail.toLowerCase(),
        contactPhone: input.contactPhone || null,
        seatsRange: input.seatsRange,
        interest: input.interest || null,
        message: input.message,
      },
    });

    try {
      const settings = await this.prisma.platformSettings.findFirst({ select: { contactEmail: true } });
      const teamEmail = settings?.contactEmail || "hola@inkademy.com";
      await this.notifications.sendQuoteLeadToTeam(teamEmail, lead);
      await this.notifications.sendQuoteLeadAck(lead.contactEmail, lead.contactName);
    } catch (err) {
      this.logger.error(`No se pudo avisar la solicitud ${lead.id}: ${(err as Error).message}`);
    }

    const sync = await this.crm.sincronizarContacto({
      docType: lead.taxIdType === "RUC" ? "RUC" : null,
      docNumber: lead.taxId,
      name: lead.legalName,
      email: lead.contactEmail,
      phone: lead.contactPhone,
    });
    await this.prisma.quoteLead.update({
      where: { id: lead.id },
      data: { crmSyncedAt: sync.sincronizado ? new Date() : null, crmSyncNote: sync.sincronizado ? null : sync.motivo ?? "no_sincronizado" },
    });
    return { received: true };
  }

  list(status?: "NEW" | "CONTACTED" | "CLOSED") {
    return this.prisma.quoteLead.findMany({ where: status ? { status } : {}, orderBy: { createdAt: "desc" }, take: 200 });
  }

  async update(actorId: string, id: string, input: { status?: "NEW" | "CONTACTED" | "CLOSED"; internalNotes?: string | null }) {
    const before = await this.prisma.quoteLead.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Solicitud no encontrada");
    const updated = await this.prisma.quoteLead.update({
      where: { id },
      data: { ...(input.status ? { status: input.status } : {}), ...(input.internalNotes !== undefined ? { internalNotes: input.internalNotes } : {}) },
    });
    await logAudit(this.prisma, {
      actorId,
      action: "UPDATE_QUOTE_LEAD",
      entity: "QuoteLead",
      entityId: id,
      before: { status: before.status },
      after: { status: updated.status },
    });
    return updated;
  }
}
