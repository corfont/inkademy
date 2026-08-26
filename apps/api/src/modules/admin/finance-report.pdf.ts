import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/**
 * PDF simple (texto plano, sin Puppeteer) para el estado financiero — "esto
 * me debería permitir descargarlo o pasarlo a PDF o mandarlo por correo".
 * Se genera con pdf-lib (ya usado por apps/worker para certificados) en vez
 * de sumar una dependencia de renderizado HTML pesada solo para un reporte
 * tabular.
 */
export async function buildFinancialReportPdf(summary: any, pnl: any): Promise<Buffer> {
  const doc = await PDFDocument.create();
  let page = doc.addPage([595.28, 841.89]); // A4 vertical
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const margin = 48;
  let y = 841.89 - margin;
  const ink = rgb(0.11, 0.12, 0.22);
  const gray = rgb(0.45, 0.46, 0.52);

  function line(text: string, opts: { size?: number; f?: typeof font; color?: typeof ink; gapAfter?: number } = {}) {
    const size = opts.size ?? 10;
    if (y < margin + 40) {
      page = doc.addPage([595.28, 841.89]);
      y = 841.89 - margin;
    }
    page.drawText(text, { x: margin, y, size, font: opts.f ?? font, color: opts.color ?? ink });
    y -= size + (opts.gapAfter ?? 6);
  }

  line("Inkademy — Estado financiero", { size: 18, f: bold, gapAfter: 4 });
  line(`Periodo: ${new Date(summary.from).toLocaleDateString("es-PE")} — ${new Date(summary.to).toLocaleDateString("es-PE")}`, {
    size: 10,
    color: gray,
    gapAfter: 16,
  });

  for (const row of summary.rows) {
    line(`Balance en ${row.currency}`, { size: 13, f: bold, gapAfter: 8 });
    const fmt = (n: number) => `${row.currency} ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    line(`Ingresos: ${fmt(row.income)}`);
    line(`IGV a pagar a SUNAT: ${fmt(row.igv)}`);
    line(`Detracción SUNAT: ${fmt(row.detraction)}`);
    if (row.currency !== "PEN" && row.detractionPenEquivalent > 0) {
      line(`  (equivalente a depositar: PEN ${row.detractionPenEquivalent.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}, T.C. ${summary.usdExchangeRate})`, {
        size: 9,
        color: gray,
      });
    }
    line(`Comisión de pasarela: ${fmt(row.providerFees)}`);
    line(`Otros gastos: ${fmt(row.otherExpenses)}`);
    line(`Saldo total: ${fmt(row.balance)}`, { f: bold, gapAfter: 16 });
  }

  line("Estado de resultados mensual (PEN)", { size: 13, f: bold, gapAfter: 8 });
  for (const m of pnl.months) {
    line(`${m.month}  —  Ingresos: S/ ${m.income.toFixed(2)}   Gastos: S/ ${m.expenses.toFixed(2)}   Utilidad: S/ ${m.profit.toFixed(2)}`, {
      size: 9,
    });
  }
  y -= 6;
  line(`Punto de equilibrio mensual: ${pnl.breakEvenIncome ? `S/ ${pnl.breakEvenIncome.toFixed(2)}` : "—"}`, { gapAfter: 4 });
  line(`Crecimiento mensual promedio: ${pnl.avgGrowthPct !== null ? `${pnl.avgGrowthPct.toFixed(1)}%` : "—"}`, { gapAfter: 4 });
  line(`Proyección próximo mes: ${pnl.forecastNextMonth !== null ? `S/ ${pnl.forecastNextMonth.toFixed(2)}` : "—"}`, { gapAfter: 4 });
  line(`Estado: ${pnl.status}`, { f: bold });

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
