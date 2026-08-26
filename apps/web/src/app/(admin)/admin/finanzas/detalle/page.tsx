import type { Metadata } from "next";
import { FinanceDetailManager } from "@/components/admin/FinanceDetailManager";

export const metadata: Metadata = { title: "Detalle financiero (admin)" };

export default function FinanceDetailPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-ink-900">Detalle financiero</h1>
        <p className="mt-1 text-sm text-ash-500">Ingresos y egresos separados por categoría, agrupados por el periodo que elijas.</p>
      </div>
      <FinanceDetailManager />
    </div>
  );
}
