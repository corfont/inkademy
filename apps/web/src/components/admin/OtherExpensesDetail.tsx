import { formatPrice } from "@/lib/format";

const PARTNER_BILLING_LABEL: Record<string, string> = {
  FIXED: "Monto fijo mensual",
  PER_COURSE: "Por certificado emitido",
  PER_ENROLLMENT: "Por alumno matriculado",
  PER_PERIOD: "Monto fijo por el periodo",
};
const ROYALTY_BILLING_LABEL: Record<string, string> = {
  PER_ENROLLMENT: "Por alumno matriculado",
  PER_COMPLETION: "Por alumno que terminó",
  PER_REFERRAL: "% de lo que pagaron sus referidos",
};

function titleOf(title: unknown): string {
  const t = title as Record<string, string> | null;
  return t?.es ?? t?.en ?? "—";
}

/**
 * "Me figura otros gastos en soles pero no sé cuál es su detalle" — el
 * desglose (convenios, regalías, horas de docencia, gastos manuales) ya lo
 * calculaba getFinancialSummary, solo nunca se mostraba en la pantalla.
 * Antes /admin/finanzas solo mostraba el TOTAL de "Otros gastos" por
 * moneda (una tarjeta) y, aparte, la tabla de ExpenseManager (que solo
 * lista los gastos manuales — ni convenios ni regalías ni horas de
 * docencia aparecían ahí, aunque sí se sumaban al total).
 */
export function OtherExpensesDetail({ summary, currency, locale }: { summary: any; currency: string; locale: string }) {
  const partnerRows = (summary.partnerCosts ?? []).filter((r: any) => r.currency === currency);
  const royaltyRows = (summary.royaltyCosts ?? []).filter((r: any) => r.currency === currency);
  const manualAmount = summary.manualExpensesByCurrency?.[currency] ?? 0;
  const teachingAmount = summary.teachingHoursCost?.byCurrency?.[currency] ?? 0;
  const teachingHours = summary.teachingHoursCost?.hours ?? 0;

  const hasAnyDetail = partnerRows.length > 0 || royaltyRows.length > 0 || manualAmount > 0 || teachingAmount > 0;
  if (!hasAnyDetail) return null;

  return (
    <div className="overflow-x-auto rounded-lg border border-paper-border bg-paper">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-paper-border text-ash-500">
          <tr>
            <th className="p-3 font-medium">Origen</th>
            <th className="p-3 font-medium">Detalle</th>
            <th className="p-3 font-medium text-right">Monto</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-paper-border">
          {manualAmount > 0 && (
            <tr>
              <td className="p-3 font-medium text-ink-900">Gastos manuales</td>
              <td className="p-3 text-ash-600">Hosting, marketing, planilla, etc. — ver el detalle línea por línea más abajo.</td>
              <td className="p-3 text-right text-ink-900">{formatPrice(manualAmount, currency, locale)}</td>
            </tr>
          )}
          {teachingAmount > 0 && (
            <tr>
              <td className="p-3 font-medium text-ink-900">Horas de docencia</td>
              <td className="p-3 text-ash-600">{teachingHours}h efectivamente dictadas en cursos en vivo/híbridos con tarifa configurada (los cursos grabados no generan este costo).</td>
              <td className="p-3 text-right text-ink-900">{formatPrice(teachingAmount, currency, locale)}</td>
            </tr>
          )}
          {partnerRows.map((r: any, i: number) => (
            <tr key={`partner-${i}`}>
              <td className="p-3 font-medium text-ink-900">Convenio: {r.partnerName}</td>
              <td className="p-3 text-ash-600">
                {titleOf(r.courseTitle)} — {PARTNER_BILLING_LABEL[r.billingType] ?? r.billingType}
              </td>
              <td className="p-3 text-right text-ink-900">{formatPrice(r.amount, currency, locale)}</td>
            </tr>
          ))}
          {royaltyRows.map((r: any, i: number) => (
            <tr key={`royalty-${i}`}>
              <td className="p-3 font-medium text-ink-900">Regalía: {r.recipientName}</td>
              <td className="p-3 text-ash-600">
                {titleOf(r.courseTitle)} — {ROYALTY_BILLING_LABEL[r.billingType] ?? r.billingType}
              </td>
              <td className="p-3 text-right text-ink-900">{formatPrice(r.amount, currency, locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
