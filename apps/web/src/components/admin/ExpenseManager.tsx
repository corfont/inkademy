"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { adminApi, ApiError } from "@/lib/api-client";
import { Input, Label, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { formatDate, formatPrice } from "@/lib/format";

const CATEGORY_LABEL: Record<string, string> = {
  HOSTING: "Hosting/infraestructura",
  MARKETING: "Marketing",
  PAYROLL: "Planilla/docentes",
  OTHER: "Otro",
};

const RECURRENCE_LABEL: Record<string, string> = { ONCE: "Una vez", MONTHLY: "Mensual", ANNUAL: "Anual" };

/**
 * "Otros gastos" del saldo total — antes no existía ningún lugar para
 * llevar cuenta de gastos fuera de lo que ya calcula el sistema (comisión
 * de pasarela, IGV). Registro manual simple: descripción, monto, categoría.
 */
export function ExpenseManager({ expenses, locale }: { expenses: any[]; locale: string }) {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("PEN");
  const [category, setCategory] = useState("OTHER");
  const [recurrence, setRecurrence] = useState("ONCE");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim() || !amount || Number(amount) <= 0) return;
    setBusy(true);
    setError(null);
    try {
      await adminApi.createExpense({ description: description.trim(), amount: Number(amount), currency, category, recurrence });
      setDescription("");
      setAmount("");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos registrar el gasto.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("¿Eliminar este gasto?")) return;
    await adminApi.deleteExpense(id);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleCreate} className="grid gap-3 rounded-lg border border-paper-border bg-paper p-4 sm:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]">
        <div>
          <Label htmlFor="expense-description">Descripción</Label>
          <Input id="expense-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ej. Hosting AWS, dominio" />
        </div>
        <div>
          <Label htmlFor="expense-amount">Monto</Label>
          <Input id="expense-amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="expense-currency">Moneda</Label>
          <Select id="expense-currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <option value="PEN">PEN</option>
            <option value="USD">USD</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="expense-category">Categoría</Label>
          <Select id="expense-category" value={category} onChange={(e) => setCategory(e.target.value)}>
            {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="expense-recurrence">Recurrencia</Label>
          <Select id="expense-recurrence" value={recurrence} onChange={(e) => setRecurrence(e.target.value)}>
            {Object.entries(RECURRENCE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "…" : "Registrar"}
          </Button>
        </div>
      </form>
      <p className="text-xs text-ash-500">
        "Mensual" y "Anual" se toman en cuenta en el Estado de resultados como una carga fija recurrente (el anual se prorratea entre 12 meses).
      </p>
      {error && <Callout variant="danger">{error}</Callout>}

      <div className="overflow-x-auto rounded-lg border border-paper-border bg-paper">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-paper-border text-ash-500">
            <tr>
              <th className="p-3 font-medium">Descripción</th>
              <th className="p-3 font-medium">Categoría</th>
              <th className="p-3 font-medium">Recurrencia</th>
              <th className="p-3 font-medium">Fecha</th>
              <th className="p-3 font-medium">Monto</th>
              <th className="p-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {expenses.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-ash-500">
                  Todavía no hay gastos registrados.
                </td>
              </tr>
            )}
            {expenses.map((exp) => (
              <tr key={exp.id} className="border-b border-paper-border last:border-0 hover:bg-paper-muted">
                <td className="p-3 text-ink-900">{exp.description}</td>
                <td className="p-3 text-ash-600">{CATEGORY_LABEL[exp.category] ?? exp.category}</td>
                <td className="p-3 text-ash-600">{RECURRENCE_LABEL[exp.recurrence] ?? exp.recurrence ?? "Una vez"}</td>
                <td className="p-3 text-ash-600">{formatDate(exp.incurredAt, locale)}</td>
                <td className="p-3 text-ash-700">{formatPrice(exp.amount, exp.currency, locale)}</td>
                <td className="p-3">
                  <button
                    type="button"
                    onClick={() => handleDelete(exp.id)}
                    className="text-ash-400 hover:text-danger"
                    aria-label="Eliminar gasto"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
