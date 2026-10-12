import type { Metadata } from "next";
import { BookOpen } from "lucide-react";
import { ComplaintForm } from "@/components/marketing/ComplaintForm";

export const metadata: Metadata = {
  title: "Libro de Reclamaciones",
  description: "Registra un reclamo o una queja sobre los servicios de Inkademy. Respondemos en un máximo de 15 días hábiles.",
};

/** Libro de Reclamaciones virtual (Ley 29571, D.S. 011-2011-PCM): mismo formulario que el de inkapitales.com. */
export default function ComplaintsBookPage() {
  return (
    <div>
      <section className="border-b border-paper-border bg-ink-900 py-12 text-paper">
        <div className="container max-w-3xl">
          <h1 className="flex items-center gap-3 font-serif text-3xl font-semibold">
            <BookOpen className="h-7 w-7" aria-hidden="true" /> Libro de Reclamaciones
          </h1>
          <p className="mt-3 text-sm text-ink-100">Ley N° 29571 · D.S. N° 011-2011-PCM · INDECOPI: 0800-4-4040</p>
          <p className="mt-1 text-sm text-ink-100">Inkademy, operado por Inkapitales · RUC 20552379218 · Lima, Perú</p>
        </div>
      </section>
      <section className="py-10">
        <div className="container max-w-2xl">
          <ComplaintForm />
        </div>
      </section>
    </div>
  );
}
