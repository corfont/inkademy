import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@inkademy/db";
import { limaDayRange, parseListQuery } from "../../common/utils/list-query";
import { buildCsv, buildSimpleXlsx, type ExportSheet } from "../../common/utils/export";
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

  // ---- Listado del Libro de Reclamaciones: filtros, orden y paginación en el servidor, resumen y exportación ----

  static readonly SORTS = ["attention", "created", "due", "status", "kind"] as const;

  private where(f: { q?: string; status?: string; kind?: string; overdue?: string; from?: string; to?: string }): Prisma.ComplaintWhereInput {
    const and: Prisma.ComplaintWhereInput[] = [];
    const q = (f.q ?? "").trim();
    if (q) {
      // El folio es «LR-2026-000012»: se busca por su número correlativo (también si solo se escribe el número).
      const folio = /^LR-\d{4}-(\d{1,9})$/i.exec(q);
      const asNumber = folio ? Number(folio[1]) : /^\d{1,9}$/.test(q) ? Number(q) : null;
      for (const token of q.split(/\s+/).filter(Boolean).slice(0, 5)) {
        and.push({
          OR: [
            { fullName: { contains: token, mode: "insensitive" } },
            { email: { contains: token, mode: "insensitive" } },
            { docNumber: { contains: token, mode: "insensitive" } },
            { service: { contains: token, mode: "insensitive" } },
            ...(asNumber !== null && !q.includes(" ") ? [{ number: asNumber }] : []),
          ],
        });
      }
    }
    if (f.status === "PENDING" || f.status === "RESPONDED") and.push({ status: f.status });
    if (f.kind === "RECLAMO" || f.kind === "QUEJA") and.push({ kind: f.kind });
    // «Plazo vencido» = sin responder y con la fecha límite ya pasada (el plazo legal es de 15 días hábiles).
    if (f.overdue === "1") and.push({ status: "PENDING", dueAt: { lt: new Date() } });
    const range = limaDayRange(f.from, f.to);
    if (range.gte || range.lte) and.push({ createdAt: range });
    return and.length ? { AND: and } : {};
  }

  private orderBy(sort: (typeof ComplaintsService.SORTS)[number], dir: "asc" | "desc"): Prisma.ComplaintOrderByWithRelationInput[] {
    // Por defecto: lo que hay que atender primero (sin responder, con el plazo más cercano arriba). PENDING va antes que RESPONDED al ordenar asc.
    const primary: Prisma.ComplaintOrderByWithRelationInput[] =
      sort === "attention" ? [{ status: "asc" }, { dueAt: "asc" }]
      : sort === "due" ? [{ dueAt: dir }]
      : sort === "status" ? [{ status: dir }]
      : sort === "kind" ? [{ kind: dir }]
      : [{ createdAt: dir }];
    return [...primary, { number: "asc" }];
  }

  async list(
    filter: { q?: string; status?: string; kind?: string; overdue?: string; from?: string; to?: string },
    rawQuery: { page?: unknown; pageSize?: unknown; sort?: unknown; dir?: unknown },
  ) {
    const query = parseListQuery(rawQuery, { sortable: ComplaintsService.SORTS, defaultSort: "attention", defaultDir: "asc", defaultPageSize: 25 });
    const where = this.where(filter);
    const [total, rows] = await Promise.all([
      this.prisma.complaint.count({ where }),
      this.prisma.complaint.findMany({ where, orderBy: this.orderBy(query.sort, query.dir), skip: query.skip, take: query.take }),
    ]);
    return {
      rows: rows.map((r) => ({ ...r, folio: complaintFolio(r.number, r.createdAt) })),
      total,
      page: query.page,
      pageSize: query.pageSize,
      sort: query.sort,
      dir: query.dir,
    };
  }

  /** Conteos de las tarjetas, sobre el libro completo (no sobre una página). */
  async summary() {
    const now = new Date();
    const [total, pending, overdue, responded] = await Promise.all([
      this.prisma.complaint.count(),
      this.prisma.complaint.count({ where: { status: "PENDING" } }),
      this.prisma.complaint.count({ where: { status: "PENDING", dueAt: { lt: now } } }),
      this.prisma.complaint.count({ where: { status: "RESPONDED" } }),
    ]);
    return { total, pending, overdue, responded };
  }

  /** Exporta el libro filtrado (el consumidor tiene derecho a que el libro se exhiba; el registro debe poder entregarse a INDECOPI). */
  async export(
    filter: { q?: string; status?: string; kind?: string; overdue?: string; from?: string; to?: string },
    rawQuery: { sort?: unknown; dir?: unknown },
    format: "xlsx" | "csv",
    actor: { id: string; email?: string },
  ) {
    const query = parseListQuery(rawQuery, { sortable: ComplaintsService.SORTS, defaultSort: "created", defaultDir: "asc" });
    const where = this.where(filter);
    const count = await this.prisma.complaint.count({ where });
    if (count > 20000) throw new BadRequestException(`El filtro devuelve ${count.toLocaleString("es-PE")} registros y el máximo por descarga es 20 000. Acota el rango de fechas.`);
    const found = await this.prisma.complaint.findMany({ where, orderBy: this.orderBy(query.sort, query.dir) });
    const rows = found.map((r) => ({ ...r, folio: complaintFolio(r.number, r.createdAt) }));
    const sheet: ExportSheet<(typeof rows)[number]> = {
      sheetName: "Libro de Reclamaciones",
      rows,
      columns: [
        { header: "Folio", width: 16, value: (r) => r.folio },
        { header: "Tipo", width: 9, value: (r) => (r.kind === "QUEJA" ? "Queja" : "Reclamo") },
        { header: "Registrado el", type: "datetime", width: 18, value: (r) => r.createdAt },
        { header: "Plazo de respuesta", type: "datetime", width: 18, value: (r) => r.dueAt },
        { header: "Estado", width: 12, value: (r) => (r.status === "RESPONDED" ? "Respondido" : r.dueAt.getTime() < Date.now() ? "Plazo vencido" : "Pendiente") },
        { header: "Respondido el", type: "datetime", width: 18, value: (r) => r.respondedAt },
        { header: "Consumidor", width: 28, value: (r) => r.fullName },
        { header: "Tipo de documento", width: 12, value: (r) => r.docType },
        { header: "Documento", width: 14, value: (r) => r.docNumber },
        { header: "Correo", width: 30, value: (r) => r.email },
        { header: "Teléfono", width: 14, value: (r) => r.phone },
        { header: "Servicio", width: 28, value: (r) => r.service },
        { header: "Descripción", width: 50, value: (r) => r.description },
        { header: "Pedido del consumidor", width: 40, value: (r) => r.request },
        { header: "Respuesta", width: 50, value: (r) => r.response },
      ],
      criteria: [
        ["Listado", "Libro de Reclamaciones"],
        ["Generado el", new Date().toLocaleString("es-PE", { timeZone: "America/Lima" }) + " (hora de Lima)"],
        ["Generado por", actor.email ?? actor.id],
        ["Búsqueda", filter.q?.trim() || "—"],
        ["Estado", filter.status === "PENDING" ? "Pendiente" : filter.status === "RESPONDED" ? "Respondido" : "todos"],
        ["Tipo", filter.kind === "RECLAMO" ? "Reclamo" : filter.kind === "QUEJA" ? "Queja" : "todos"],
        ["Solo plazo vencido", filter.overdue === "1" ? "Sí" : "No"],
        ["Registrado desde", filter.from || "—"],
        ["Registrado hasta", filter.to || "—"],
        ["Filas", String(rows.length)],
      ],
    };
    await logAudit(this.prisma, { actorId: actor.id, action: "LIST_EXPORT", entity: "Complaint", after: { format, rows: rows.length, filters: filter } });
    return { buffer: format === "csv" ? buildCsv(sheet) : buildSimpleXlsx(sheet), rows: rows.length };
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
