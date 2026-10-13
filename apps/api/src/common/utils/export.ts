import * as XLSX from "xlsx";

/**
 * Exportación de listados a Excel y CSV, para TODA tabla del sistema (COMPLETITUD.md: REP-01/02/06, TBL-40). Una sola implementación:
 * si una pantalla se puede descargar, se descarga igual que las demás.
 *
 * - Excel: números, montos y fechas son celdas REALES (se pueden sumar, ordenar y filtrar), no texto.
 * - CSV: UTF-8 con BOM (Excel lo abre bien con tildes) y neutralización de fórmulas.
 */
export type ExportColumnType = "text" | "number" | "money" | "datetime";

export interface ExportColumn<T> {
  header: string;
  type?: ExportColumnType;
  width?: number;
  value: (row: T) => string | number | Date | null | undefined;
}

export interface ExportSheet<T> {
  sheetName: string;
  columns: ExportColumn<T>[];
  rows: T[];
  /** Líneas de contexto sobre la hoja «Filtros» (qué filtros se aplicaron, cuándo, quién), para que el archivo declare sus criterios. */
  criteria: [string, string][];
}

/** Una celda de texto que empieza con = + - @ (o tab / retorno) la interpretaría Excel como FÓRMULA: se antepone una comilla simple. */
export function neutralizeFormula(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

const csvEscape = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function buildCsv<T>(sheet: ExportSheet<T>): Buffer {
  const lines = [sheet.columns.map((c) => csvEscape(c.header)).join(",")];
  for (const row of sheet.rows) {
    lines.push(
      sheet.columns
        .map((c) => {
          const v = c.value(row);
          if (v == null) return "";
          if (v instanceof Date) return v.toISOString();
          if (typeof v === "number") return String(v); // un número negativo NO es una fórmula: no se toca
          return csvEscape(neutralizeFormula(v));
        })
        .join(","),
    );
  }
  return Buffer.from("﻿" + lines.join("\r\n") + "\r\n", "utf8");
}

export function buildSimpleXlsx<T>(sheet: ExportSheet<T>): Buffer {
  const wb = XLSX.utils.book_new();

  const aoa: (string | number | Date | null)[][] = [sheet.columns.map((c) => c.header)];
  for (const row of sheet.rows) {
    aoa.push(
      sheet.columns.map((c) => {
        const v = c.value(row);
        if (v == null) return null;
        if (typeof v === "string") return neutralizeFormula(v);
        return v;
      }),
    );
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
  sheet.columns.forEach((c, ci) => {
    for (let ri = 1; ri < aoa.length; ri++) {
      const ref = XLSX.utils.encode_cell({ r: ri, c: ci });
      const cellRef = ws[ref];
      if (!cellRef) continue;
      if (c.type === "money") cellRef.z = "#,##0.00";
      if (c.type === "datetime") cellRef.z = "yyyy-mm-dd hh:mm";
    }
  });
  ws["!cols"] = sheet.columns.map((c) => ({ wch: c.width ?? Math.min(40, Math.max(10, c.header.length + 2)) }));
  ws["!freeze"] = { xSplit: 0, ySplit: 1 } as never;
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, aoa.length - 1), c: Math.max(0, sheet.columns.length - 1) } }) };
  XLSX.utils.book_append_sheet(wb, ws, sheet.sheetName.slice(0, 28));

  const criteria = XLSX.utils.aoa_to_sheet([["Criterio", "Valor"], ...sheet.criteria]);
  criteria["!cols"] = [{ wch: 22 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, criteria, "Filtros");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx", cellDates: true }) as Buffer;
}
