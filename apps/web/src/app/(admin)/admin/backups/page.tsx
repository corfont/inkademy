import type { Metadata } from "next";
import { adminApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { getServerAccessToken } from "@/lib/server-auth";
import { BackupManager } from "@/components/admin/BackupManager";
import { BackupOffsiteSettings } from "@/components/admin/BackupOffsiteSettings";
import { Callout } from "@/components/ui/Callout";

export const metadata: Metadata = { title: "Backups (admin)" };

export default async function BackupsPage() {
  const accessToken = getServerAccessToken();
  const { data: backups, live } = await withFallback(() => adminApi.backups(accessToken), [] as any[]);
  const { data: settings } = await withFallback(
    () => adminApi.backupSettings(accessToken),
    { sharepointEnabled: false, sharepointFolderUrl: "", microsoftConfigured: false, encryptionEnabled: false, lastTestAt: null, lastTestOk: null, lastTestNote: null },
  );

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-ink-900">Backups</h1>
        <p className="mt-1 text-sm text-ash-500">
          Export completo de toda la base de datos (certificados, convenios, liquidaciones, cursos y materiales, todo) — se genera automáticamente
          cada semana, o a pedido desde acá.
        </p>
      </div>
      {!live && <Callout variant="info">No pudimos conectar con la API — no se muestran backups reales por ahora.</Callout>}
      <BackupOffsiteSettings settings={settings} />
      <BackupManager backups={backups} />
    </div>
  );
}
