import { BadRequestException, Inject, Injectable, Logger } from "@nestjs/common";
import type { PrismaClient } from "@inkademy/db";
import { PRISMA } from "../../../common/prisma/prisma.module";
import { AdminService } from "../admin.service";
import { createReport, drawBarChart, drawParagraph, drawSubtitle, drawTable, drawTitle, finalizeReport, type ReportContext } from "./report-kit";
import { buildFinancialReportPdf } from "../finance-report.pdf";

const fullName =(u: { firstName?: string | null; lastName?: string | null; email?: string } | null | undefined) =>
  u ? [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || "—" : "—";

export interface ReportDefinition {
  key: string;
  label: string;
  description: string;
}

/**
 * "El sistema en alguna parte me debería emitir reportes en PDF... deben
 * ser muy profesionales" — antes solo existía el reporte financiero
 * (ver finance-report.pdf.ts). Este servicio agrega el resto que pidió el
 * admin (alumnos registrados, cursos vs alumnos, empresas registradas,
 * cursos sin movimiento, alumnos que más contratan) + 2 sugeridos
 * (docentes por liquidar, certificados emitidos) — todos sobre el mismo
 * kit de apariencia (report-kit.ts) para que se vean como una sola familia
 * de documentos, no reportes sueltos con estilos distintos.
 */
@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly adminService: AdminService,
  ) {}

  static readonly CATALOG: ReportDefinition[] = [
    { key: "alumnos-registrados", label: "Alumnos registrados", description: "Listado completo de alumnos con su fecha de registro y cursos matriculados." },
    { key: "cursos-vs-alumnos", label: "Cursos vs. alumnos matriculados", description: "Ranking de cursos por número de matrículas, con gráfico." },
    { key: "empresas-registradas", label: "Empresas registradas", description: "Listado de empresas B2B con cupos comprados y usados." },
    { key: "cursos-sin-movimiento", label: "Cursos sin movimiento", description: "Cursos publicados sin ninguna matrícula nueva en el periodo." },
    { key: "alumnos-top-compradores", label: "Alumnos que más cursos han contratado", description: "Ranking de alumnos por número de matrículas." },
    { key: "estado-financiero", label: "Estado financiero (EEFF)", description: "Ingresos, IGV, detracción, comisiones y saldo — mismo reporte de /admin/finanzas con el nuevo formato." },
    { key: "liquidaciones-pendientes", label: "Liquidaciones de docentes pendientes", description: "Docentes con liquidaciones en borrador o aprobadas sin pagar." },
    { key: "certificados-emitidos", label: "Certificados emitidos", description: "Certificados emitidos en el periodo, por curso." },
  ];

  private async logoBytes(): Promise<Buffer | null> {
    const settings = await this.prisma.platformSettings.findUnique({ where: { id: "default" } });
    if (!settings?.logoUrl) return null;
    try {
      const res = await fetch(settings.logoUrl);
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      this.logger.warn(`No se pudo descargar el logo para el PDF: ${String(err)}`);
      return null;
    }
  }

  private async open(title: string): Promise<ReportContext> {
    return createReport({ title, watermarkText: "INKADEMY", logoBytes: await this.logoBytes(), logger: this.logger });
  }

  private periodRange(from?: string, to?: string) {
    const toDate = to ? new Date(to) : new Date();
    const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 90 * 24 * 60 * 60 * 1000);
    return { fromDate, toDate };
  }

  async generate(key: string, params: { from?: string; to?: string }): Promise<{ pdf: Buffer; filename: string }> {
    switch (key) {
      case "alumnos-registrados":
        return this.alumnosRegistrados();
      case "cursos-vs-alumnos":
        return this.cursosVsAlumnos(params);
      case "empresas-registradas":
        return this.empresasRegistradas();
      case "cursos-sin-movimiento":
        return this.cursosSinMovimiento(params);
      case "alumnos-top-compradores":
        return this.alumnosTopCompradores();
      case "liquidaciones-pendientes":
        return this.liquidacionesPendientes();
      case "certificados-emitidos":
        return this.certificadosEmitidos(params);
      case "estado-financiero":
        return this.estadoFinanciero(params);
      default:
        throw new BadRequestException(`Reporte desconocido: ${key}`);
    }
  }

  private async alumnosRegistrados() {
    const students = await this.prisma.user.findMany({
      where: { globalRole: "STUDENT" },
      select: { firstName: true, lastName: true, email: true, createdAt: true, country: true, _count: { select: { enrollments: true } } },
      orderBy: { createdAt: "desc" },
    });
    const ctx = await this.open("Alumnos registrados");
    drawTitle(ctx, "Alumnos registrados");
    drawSubtitle(ctx, `${students.length} alumnos en total, a la fecha de este reporte.`);
    drawParagraph(ctx, "Listado completo de personas registradas con rol de alumno en la plataforma, ordenado por fecha de registro más reciente, con el total de cursos/programas en los que se han matriculado alguna vez.");
    drawTable(
      ctx,
      [
        { header: "Nombre", width: 2.6 },
        { header: "Correo", width: 2.6 },
        { header: "País", width: 0.9 },
        { header: "Registrado", width: 1.2 },
        { header: "Cursos matr.", width: 1.6, align: "right" },
      ],
      students.map((s) => [fullName(s), s.email, s.country ?? "—", s.createdAt.toLocaleDateString("es-PE"), String(s._count.enrollments)]),
    );
    return { pdf: await finalizeReport(ctx), filename: "inkademy-alumnos-registrados.pdf" };
  }

  private async cursosVsAlumnos(params: { from?: string; to?: string }) {
    const { fromDate, toDate } = this.periodRange(params.from, params.to);
    const courses = await this.prisma.course.findMany({
      select: { title: true, status: true, _count: { select: { enrollments: true } } },
      orderBy: { enrollments: { _count: "desc" } },
    });
    const ctx = await this.open("Cursos vs. alumnos matriculados");
    drawTitle(ctx, "Cursos vs. alumnos matriculados");
    drawSubtitle(ctx, `Periodo de referencia del gráfico: ${fromDate.toLocaleDateString("es-PE")} — ${toDate.toLocaleDateString("es-PE")}. La tabla es acumulado histórico.`);
    const top = courses.slice(0, 10).map((c) => ({ label: (c.title as any)?.es ?? "—", value: c._count.enrollments }));
    if (top.some((t) => t.value > 0)) {
      drawBarChart(ctx, { title: "Top 10 cursos por matrículas (acumulado)", seriesLabel: "Alumnos matriculados", data: top });
    }
    drawTable(
      ctx,
      [
        { header: "Curso", width: 4 },
        { header: "Estado", width: 1.2 },
        { header: "Matrículas", width: 1.2, align: "right" },
      ],
      courses.map((c) => [(c.title as any)?.es ?? "—", c.status, String(c._count.enrollments)]),
    );
    return { pdf: await finalizeReport(ctx), filename: "inkademy-cursos-vs-alumnos.pdf" };
  }

  private async empresasRegistradas() {
    const companies = await this.prisma.company.findMany({
      select: {
        legalName: true,
        taxId: true,
        country: true,
        status: true,
        createdAt: true,
        _count: { select: { memberships: true } },
        seatPools: { select: { seatsPurchased: true, seatsUsed: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    const ctx = await this.open("Empresas registradas");
    drawTitle(ctx, "Empresas registradas (B2B)");
    drawSubtitle(ctx, `${companies.length} empresas en total.`);
    drawTable(
      ctx,
      [
        { header: "Empresa", width: 3 },
        { header: "RUC/Tax ID", width: 1.4 },
        { header: "País", width: 0.8 },
        { header: "Colaboradores", width: 1.1, align: "right" },
        { header: "Cupos comprados", width: 1.2, align: "right" },
        { header: "Cupos usados", width: 1.1, align: "right" },
        { header: "Estado", width: 0.9 },
      ],
      companies.map((c) => [
        c.legalName,
        c.taxId,
        c.country,
        String(c._count.memberships),
        String(c.seatPools.reduce((s, p) => s + p.seatsPurchased, 0)),
        String(c.seatPools.reduce((s, p) => s + p.seatsUsed, 0)),
        c.status,
      ]),
    );
    return { pdf: await finalizeReport(ctx), filename: "inkademy-empresas-registradas.pdf" };
  }

  private async cursosSinMovimiento(params: { from?: string; to?: string }) {
    const { fromDate, toDate } = this.periodRange(params.from, params.to);
    const courses = await this.prisma.course.findMany({
      where: { status: "PUBLISHED" },
      select: { title: true, slug: true, createdAt: true, enrollments: { where: { enrolledAt: { gte: fromDate, lte: toDate } }, select: { id: true }, take: 1 } },
    });
    const withoutMovement = courses.filter((c) => c.enrollments.length === 0);
    const ctx = await this.open("Cursos sin movimiento");
    drawTitle(ctx, "Cursos sin movimiento");
    drawSubtitle(ctx, `Periodo evaluado: ${fromDate.toLocaleDateString("es-PE")} — ${toDate.toLocaleDateString("es-PE")}.`);
    drawParagraph(ctx, `Cursos publicados que no tuvieron ninguna matrícula nueva en el periodo — candidatos a revisar precio, promoción, o si conviene despublicarlos. Se encontraron ${withoutMovement.length} de ${courses.length} cursos publicados.`);
    drawTable(
      ctx,
      [
        { header: "Curso", width: 3.5 },
        { header: "Slug", width: 1.8 },
        { header: "Publicado desde", width: 1.2 },
      ],
      withoutMovement.map((c) => [(c.title as any)?.es ?? "—", c.slug, c.createdAt.toLocaleDateString("es-PE")]),
    );
    return { pdf: await finalizeReport(ctx), filename: "inkademy-cursos-sin-movimiento.pdf" };
  }

  private async alumnosTopCompradores() {
    const rows = await this.prisma.enrollment.groupBy({
      by: ["userId"],
      _count: { _all: true },
      orderBy: { _count: { userId: "desc" } },
      take: 30,
    });
    const users = await this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.userId) } }, select: { id: true, firstName: true, lastName: true, email: true } });
    const userById = new Map(users.map((u) => [u.id, u]));
    const ctx = await this.open("Alumnos que más cursos han contratado");
    drawTitle(ctx, "Alumnos que más cursos han contratado");
    drawSubtitle(ctx, "Top 30 por número total de matrículas históricas (propias o vía cupo B2B).");
    const top = rows.slice(0, 10).map((r) => ({ label: fullName(userById.get(r.userId)), value: r._count._all }));
    drawBarChart(ctx, { title: "Top 10 alumnos por matrículas", seriesLabel: "Cursos/programas matriculados", data: top });
    drawTable(
      ctx,
      [
        { header: "Alumno", width: 3 },
        { header: "Correo", width: 3 },
        { header: "Cursos matriculados", width: 1.4, align: "right" },
      ],
      rows.map((r) => [fullName(userById.get(r.userId)), userById.get(r.userId)?.email ?? "—", String(r._count._all)]),
    );
    return { pdf: await finalizeReport(ctx), filename: "inkademy-alumnos-top-compradores.pdf" };
  }

  private async liquidacionesPendientes() {
    const liquidations = await this.prisma.teacherLiquidation.findMany({
      where: { status: { in: ["DRAFT", "APPROVED"] } },
      include: { teacher: { select: { firstName: true, lastName: true, email: true } } },
      orderBy: { periodStart: "desc" },
    });
    const ctx = await this.open("Liquidaciones de docentes pendientes");
    drawTitle(ctx, "Liquidaciones de docentes pendientes de pago");
    drawSubtitle(ctx, `${liquidations.length} liquidaciones en borrador o aprobadas sin marcar como pagadas.`);
    const totalPen = liquidations.filter((l) => l.currency === "PEN").reduce((s, l) => s + Number(l.netAmount), 0);
    const totalUsd = liquidations.filter((l) => l.currency === "USD").reduce((s, l) => s + Number(l.netAmount), 0);
    drawParagraph(ctx, `Total pendiente de abonar: S/ ${totalPen.toFixed(2)} + US$ ${totalUsd.toFixed(2)}.`);
    drawTable(
      ctx,
      [
        { header: "Docente", width: 2.5 },
        { header: "Periodo", width: 1.8 },
        { header: "Neto a pagar", width: 1.2, align: "right" },
        { header: "Estado", width: 1 },
      ],
      liquidations.map((l) => [
        fullName(l.teacher),
        `${l.periodStart.toLocaleDateString("es-PE")} — ${l.periodEnd.toLocaleDateString("es-PE")}`,
        `${l.currency === "USD" ? "US$" : "S/"} ${Number(l.netAmount).toFixed(2)}`,
        l.status,
      ]),
    );
    return { pdf: await finalizeReport(ctx), filename: "inkademy-liquidaciones-pendientes.pdf" };
  }

  private async certificadosEmitidos(params: { from?: string; to?: string }) {
    const { fromDate, toDate } = this.periodRange(params.from, params.to);
    const certificates = await this.prisma.certificate.findMany({
      where: { issuedAt: { gte: fromDate, lte: toDate } },
      include: { user: { select: { firstName: true, lastName: true, email: true } }, course: { select: { title: true } } },
      orderBy: { issuedAt: "desc" },
    });
    const ctx = await this.open("Certificados emitidos");
    drawTitle(ctx, "Certificados emitidos");
    drawSubtitle(ctx, `Periodo: ${fromDate.toLocaleDateString("es-PE")} — ${toDate.toLocaleDateString("es-PE")}. ${certificates.length} certificados emitidos.`);
    const byCourse = new Map<string, number>();
    for (const c of certificates) {
      const title = (c.course?.title as any)?.es ?? "—";
      byCourse.set(title, (byCourse.get(title) ?? 0) + 1);
    }
    const top = Array.from(byCourse.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
    if (top.length > 0) drawBarChart(ctx, { title: "Certificados emitidos por curso", seriesLabel: "Certificados", data: top });
    drawTable(
      ctx,
      [
        { header: "Alumno", width: 2.5 },
        { header: "Curso", width: 2.5 },
        { header: "Código", width: 1.3 },
        { header: "Emitido", width: 1 },
      ],
      certificates.map((c) => [fullName(c.user), (c.course?.title as any)?.es ?? "—", c.code, c.issuedAt.toLocaleDateString("es-PE")]),
    );
    return { pdf: await finalizeReport(ctx), filename: "inkademy-certificados-emitidos.pdf" };
  }

  /**
   * "Estado financiero (EEFF)" en /admin/reportes — MISMO generador que el
   * botón "Descargar PDF" de /admin/finanzas (finance-report.pdf.ts). Antes
   * este método armaba su propio PDF por separado (con logo/tabla/un solo
   * gráfico de barras) mientras el botón real de Finanzas se quedaba con la
   * versión vieja de puro texto — la mejora nunca le llegó al usuario
   * porque quedó en una pantalla distinta. Ahora hay un solo generador
   * (con tarjetas KPI, combo de barras+línea, y donut de gastos por
   * origen) y ambos botones producen el mismo PDF.
   */
  private async estadoFinanciero(params: { from?: string; to?: string }) {
    const summary = await this.adminService.getFinancialSummary({ from: params.from, to: params.to });
    const pnl = await this.adminService.getProfitAndLoss({ months: 6 });
    const pdf = await buildFinancialReportPdf(summary, pnl, await this.logoBytes());
    return { pdf, filename: "inkademy-estado-financiero.pdf" };
  }
}
