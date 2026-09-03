import type { Metadata } from "next";
import { notificationsApi } from "@/lib/api-client";
import { getServerAccessToken } from "@/lib/server-auth";
import { NotificationSettingsForm } from "@/components/admin/NotificationSettingsForm";

export const metadata: Metadata = { title: "Notificaciones" };

export default async function NotificationSettingsPage() {
  const accessToken = getServerAccessToken();
  const settings = await notificationsApi.settings(accessToken);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <div>
        <h1 className="mb-1 font-serif text-2xl font-semibold text-ink-900">Notificaciones</h1>
        <p className="text-sm text-ash-500">
          Qué avisos se envían, por qué canal (correo y/o en la plataforma), y con cuánta anticipación. Los alumnos y el
          equipo ven sus notificaciones en la campana de la barra superior.
        </p>
      </div>
      <NotificationSettingsForm settings={settings} />
    </div>
  );
}
