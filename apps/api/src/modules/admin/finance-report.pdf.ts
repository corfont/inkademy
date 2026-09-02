import { rgb } from "pdf-lib";
import { createReport, drawTitle, drawSubtitle, drawKpiRow, drawComboChart, drawDonutChart, drawParagraph, finalizeReport } from "./reports/report-kit";

/**
 * "Tiene que ser como un dashboard en PDF, profesional y ejecutivo" —
 * antes era puro texto plano (drawText línea por línea, sin tablas ni
 * gráficos). Ahora usa el mismo kit compartido (report-kit.ts: logo,
 * marca de agua, Trebuchet/Helvetica de respaldo) que ya usan el resto de
 * reportes, con tarjetas KPI de color y dos gráficos vectoriales nuevos
 * (drawComboChart/drawDonutChart) — sin sumar ninguna dependencia de
 * renderizado (nada de Puppeteer/canvas/chart.js, solo primitivas de
 * pdf-lib que ya se usaban en el proyecto para otros reportes).
 *
 * Este es el generador que consume EL BOTÓN REAL que el admin usa
 * ("Descargar PDF" en /admin/finanzas, GET admin/finance/report.pdf) — una
 * sesión anterior ya había hecho una versión "profesional" separada
 * (ver ReportsService.estadoFinanciero) pero la puso en OTRA pantalla
 * (/admin/reportes), así que la mejora nunca le llegó a este botón. Ahora
 * ese método delega acá mismo, para que no vuelva a pasar.
 */
const money = (n: number, currency: string) => `${currency === "USD" ? "US$" : "S/"} ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function monthLabel(month: string): string {
  // "2026-01" -> "Ene 26"
  const [year, m] = month.split("-");
  const date = new Date(Number(year), Number(m) - 1, 1);
  const label = date.toLocaleDateString("es-PE", { month: "short", year: "2-digit" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// Mismos 4 orígenes de "otros gastos" que ya se ven en pantalla
// (OtherExpensesDetail.tsx, que los arma en cliente sin endpoint propio) —
// el PDF nunca los mostró, ni la versión vieja ni la "profesional" separada.
const EXPENSE_ORIGIN_COLORS = {
  teaching: rgb(0.34, 0.42, 0.86), // indigo — Docencia
  partners: rgb(0.85, 0.55, 0.05), // ámbar — Convenios
  royalties: rgb(0.09, 0.64, 0.29), // verde — Regalías
  manual: rgb(0.55, 0.56, 0.6), // gris — Manuales
};

export async function buildFinancialReportPdf(summary: any, pnl: any, logoBytes?: Buffer | null): Promise<Buffer> {
  const ctx = await createReport({ title: "Estado financiero", watermarkText: "INKADEMY", logoBytes });

  drawTitle(ctx, "Estado financiero");
  drawSubtitle(ctx, `Periodo: ${new Date(summary.from).toLocaleDateString("es-PE")} — ${new Date(summary.to).toLocaleDateString("es-PE")}.`);

  for (const row of summary.rows as any[]) {
    drawSubtitle(ctx, `Balance en ${row.currency}`, { gapAfter: 8 });
    drawKpiRow(ctx, [
      { label: "Ingresos", value: money(row.income, row.currency) },
      { label: "IGV a pagar a SUNAT", value: money(row.igv, row.currency) },
      { label: "Detracción SUNAT", value: money(row.detraction, row.currency) },
      { label: "Comisión de pasarela", value: money(row.providerFees, row.currency) },
      { label: "Otros gastos", value: money(row.otherExpenses, row.currency) },
      { label: "Saldo total", value: money(row.balance, row.currency), tone: row.balance >= 0 ? "success" : "danger" },
    ]);
    if (row.currency !== "PEN" && row.detractionPenEquivalent > 0) {
      drawParagraph(ctx, `Detracción equivalente a depositar: PEN ${row.detractionPenEquivalent.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (T.C. ${summary.usdExchangeRate}).`, {
        size: 9,
        gapAfter: 6,
      });
    }

    // "Otros gastos" desglosado por origen — mismo criterio que
    // OtherExpensesDetail.tsx en pantalla, nunca antes visible en el PDF.
    const partnersTotal = (summary.partnerCosts ?? []).filter((p: any) => p.currency === row.currency).reduce((s: number, p: any) => s + p.amount, 0);
    const royaltiesTotal = (summary.royaltyCosts ?? []).filter((r: any) => r.currency === row.currency).reduce((s: number, r: any) => s + r.amount, 0);
    const teachingTotal = summary.teachingHoursCost?.byCurrency?.[row.currency] ?? 0;
    const manualTotal = summary.manualExpensesByCurrency?.[row.currency] ?? 0;
    drawDonutChart(ctx, {
      title: `Otros gastos por origen (${row.currency})`,
      centerLabel: money(row.otherExpenses, row.currency),
      data: [
        { label: "Docencia", value: teachingTotal, color: EXPENSE_ORIGIN_COLORS.teaching },
        { label: "Convenios", value: partnersTotal, color: EXPENSE_ORIGIN_COLORS.partners },
        { label: "Regalías", value: royaltiesTotal, color: EXPENSE_ORIGIN_COLORS.royalties },
        { label: "Manuales", value: manualTotal, color: EXPENSE_ORIGIN_COLORS.manual },
      ],
    });
  }

  drawComboChart(ctx, {
    title: "Estado de resultados mensual (PEN)",
    data: (pnl.months as any[]).map((m) => ({ label: monthLabel(m.month), income: m.income, expenses: m.expenses, profit: m.profit })),
    breakEvenIncome: pnl.breakEvenIncome,
  });

  drawParagraph(
    ctx,
    `Punto de equilibrio mensual: ${pnl.breakEvenIncome ? money(pnl.breakEvenIncome, "PEN") : "no calculable todavía"}. Crecimiento mensual promedio: ${
      pnl.avgGrowthPct !== null ? `${pnl.avgGrowthPct.toFixed(1)}%` : "—"
    }. Proyección próximo mes: ${pnl.forecastNextMonth !== null ? money(pnl.forecastNextMonth, "PEN") : "—"}. Estado: ${pnl.status}.`,
  );

  return finalizeReport(ctx);
}
