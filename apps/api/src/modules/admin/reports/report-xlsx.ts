import * as XLSX from "xlsx";
import type { ReportContext } from "./report-kit";

/** Un valor que es solo un número se guarda como número (para poder sumar y ordenar en Excel); el resto queda como texto tal cual se vio en el PDF. */
function cell(v: string | number): string | number {
  if (typeof v === "number") return v;
  return /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : v;
}

const safeSheetName = (name: string, used: Set<string>) => {
  const base = name.replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 28) || "Datos";
  let candidate = base;
  let n = 2;
  while (used.has(candidate.toLowerCase())) candidate = `${base.slice(0, 25)} ${n++}`;
  used.add(candidate.toLowerCase());
  return candidate;
};

/**
 * Convierte lo que dibujó el reporte (indicadores, tablas y gráficos) en un libro de Excel limpio: una hoja «Resumen» con título, notas e
 * indicadores, y una hoja por tabla o gráfico. Sin celdas combinadas.
 */
export function buildXlsx(contexts: ReportContext[]): Buffer {
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  const addSheet = (name: string, aoa: (string | number)[][]) => {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const widths = aoa.reduce<number[]>((acc, row) => {
      row.forEach((c, i) => (acc[i] = Math.min(60, Math.max(acc[i] ?? 8, String(c ?? "").length + 2))));
      return acc;
    }, []);
    ws["!cols"] = widths.map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(name, used));
  };

  for (const ctx of contexts) {
    const summary: (string | number)[][] = [];
    ctx.notes.forEach((n) => summary.push([n]));
    if (ctx.kpis.length) {
      summary.push([]);
      summary.push(["Indicador", "Valor"]);
      ctx.kpis.forEach(([label, value]) => summary.push([label, cell(value)]));
    }
    summary.push([]);
    summary.push([`Generado el ${ctx.generatedAt.toLocaleString("es-PE", { dateStyle: "medium", timeStyle: "short" })}`]);
    addSheet("Resumen", summary);
    for (const sheet of ctx.sheets) addSheet(sheet.name, [sheet.header, ...sheet.rows.map((r) => r.map(cell))]);
  }
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
