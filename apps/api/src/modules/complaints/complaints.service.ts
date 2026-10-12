import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@inkademy/db";
import type { ComplaintInput } from "@inkademy/shared";
import { PRISMA } from "../../common/prisma/prisma.module";
import { NotificationService } from "../notification/notification.service";
import { logAudit } from "../admin/audit-log.util";

/** Suma días hábiles (lunes a viernes). No considera feriados: el plazo real puede ser algo más largo, nunca más corto. */
export function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from);
  let left = days;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) left -= 1;
  }
  return d;
}

export function complaintFolio(number: number, createdAt: Date): string {
  return `LR-${createdAt.getUTCFullYear()}-${String(number).padStart(6, "0")}`;
}

@Injectable()
export class ComplaintsService {
  private readonly logger = new Logger(ComplaintsService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly notifications: NotificationService,
  ) {}

  /** Registra primero (la constancia nunca se pierde) y avisa después como mejor esfuerzo. */
  async create(input: ComplaintInput) {
    // Campo trampa lleno = bot: se responde igual que un éxito, sin guardar.
    if (input.website) return { folio: "LR-0000-000000", dueAt: new Date().toISOString() };
    const now = new Date();
    const created = await this.prisma.complaint.create({
      data: {
        kind: input.kind,
        fullName: input.fullName,
        docType: input.docType,
        docNumber: input.docNumber,
        email: input.email.toLowerCase(),
        phone: input.phone,
        service: input.service,
        description: input.description,
        request: input.request,
        dueAt: addBusinessDays(now, 15),
      },
    });
    const folio = complaintFolio(created.number, created.createdAt);
    try {
      const settings = await this.prisma.platformSettings.findFirst({ select: { contactEmail: true } });
      await this.notifications.sendComplaintAck(created.email, { folio, kind: created.kind, fullName: created.fullName, description: created.description, request: created.request, dueAt: created.dueAt });
      await this.notifications.sendComplaintToTeam(settings?.contactEmail || "hola@inkademy.com", { folio, kind: created.kind, fullName: created.fullName, service: created.service, dueAt: created.dueAt });
    } catch (err) {
      this.logger.error(`No se pudieron enviar los avisos del reclamo ${folio}: ${(err as Error).message}`);
    }
    return { folio, dueAt: created.dueAt.toISOString() };
  }

  async list(status?: "PENDING" | "RESPONDED") {
    const rows = await this.prisma.complaint.findMany({ where: status ? { status } : {}, orderBy: { createdAt: "desc" }, take: 300 });
    return rows.map((r) => ({ ...r, folio: complaintFolio(r.number, r.createdAt) }));
  }

  async respond(actorId: string, id: string, response: string) {
    const complaint = await this.prisma.complaint.findUnique({ where: { id } });
    if (!complaint) throw new NotFoundException("Reclamo no encontrado");
    if (complaint.status === "RESPONDED") throw new BadRequestException("Este registro ya fue respondido");
    const updated = await this.prisma.complaint.update({
      where: { id },
      data: { response, status: "RESPONDED", respondedAt: new Date(), respondedById: actorId },
    });
    const folio = complaintFolio(updated.number, updated.createdAt);
    await logAudit(this.prisma, { actorId, action: "RESPOND_COMPLAINT", entity: "Complaint", entityId: id, after: { folio } });
    try {
      await this.notifications.sendComplaintResponse(updated.email, { folio, fullName: updated.fullName, response });
    } catch (err) {
      this.logger.error(`No se pudo enviar la respuesta del reclamo ${folio}: ${(err as Error).message}`);
    }
    return { ...updated, folio };
  }
}
