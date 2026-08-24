import type { Metadata } from "next";
import { settingsApi } from "@/lib/api-client";
import { AppearanceForm } from "@/components/admin/AppearanceForm";

export const metadata: Metadata = { title: "Apariencia" };

export default async function AppearancePage() {
  const settings = await settingsApi.get();
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 font-serif text-2xl font-semibold text-ink-900">Apariencia</h1>
      <p className="mb-6 text-sm text-ash-500">
        Logo, tamaño, tipografía y fondo del sitio. Los cambios se aplican a toda la plataforma al instante para todos
        los visitantes.
      </p>
      <AppearanceForm settings={settings} />
    </div>
  );
}
