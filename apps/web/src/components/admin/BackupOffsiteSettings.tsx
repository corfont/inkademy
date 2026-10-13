"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminApi, ApiError, type BackupSettingsDTO } from "@/lib/api-client";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card, CardContent } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Input";

/**
 * Copia EXTERNA de los respaldos en SharePoint. Un respaldo que vive solo en el
 * mismo servidor se pierde junto con el servidor: aquí el administrador pega el
 * enlace de la carpeta donde quiere guardarlos. Las credenciales de Microsoft no
 * se piden aquí (salen de la configuración del servidor).
 */
export function BackupOffsiteSettings({ settings }: { settings: BackupSettingsDTO }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(settings.sharepointEnabled);
  const [url, setUrl] = useState(settings.sharepointFolderUrl);
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const dirty = enabled !== settings.sharepointEnabled || url.trim() !== settings.sharepointFolderUrl;

  async function save() {
    setBusy("save");
    setError(null);
    setMessage(null);
    try {
      await adminApi.saveBackupSettings({ sharepointEnabled: enabled, sharepointFolderUrl: url.trim() || null });
      setMessage({ ok: true, text: "Guardado. Ahora usa «Probar conexión» para confirmar que se puede escribir en la carpeta." });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar.");
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    setBusy("test");
    setError(null);
    setMessage(null);
    try {
      const result = await adminApi.testBackupSettings();
      setMessage({ ok: result.ok, text: result.note });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo probar la conexión.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-serif text-lg font-semibold text-ink-900">Copia externa en SharePoint</h2>
            <p className="text-sm text-ash-600">Cada respaldo verificado se copia también a esta carpeta, fuera del servidor.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={settings.sharepointEnabled ? "success" : "outline"}>{settings.sharepointEnabled ? "Activada" : "Desactivada"}</Badge>
            <Badge variant={settings.encryptionEnabled ? "success" : "warning"}>{settings.encryptionEnabled ? "Cifrada" : "Sin cifrar"}</Badge>
          </div>
        </div>

        {!settings.microsoftConfigured && (
          <Callout variant="warning">
            El servidor todavía no tiene las credenciales de Microsoft (<code>MS_TENANT_ID</code>, <code>MS_CLIENT_ID</code>, <code>MS_CLIENT_SECRET</code> en el
            archivo <code>.env</code>). La app registrada en Azure necesita el permiso de aplicación <b>Sites.ReadWrite.All</b> (o <b>Files.ReadWrite.All</b>) con
            consentimiento de administrador. Sin eso la copia no se podrá subir.
          </Callout>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sp-url">Enlace de la carpeta de SharePoint</Label>
          <Input
            id="sp-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://tuempresa.sharepoint.com/sites/Sistemas/Documentos%20compartidos/Respaldos"
            autoComplete="off"
          />
          <p className="text-xs text-ash-500">En SharePoint abre la carpeta → Compartir → Copiar vínculo (o copia la dirección del navegador). Debe ser una carpeta, no un archivo.</p>
        </div>

        <label className="flex items-center gap-2 text-sm text-ink-900">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4" />
          Copiar cada respaldo a esta carpeta
        </label>

        {!settings.encryptionEnabled && (
          <p className="text-xs text-ash-500">
            Los respaldos se suben sin cifrar (contienen datos de todos los usuarios). Para cifrarlos, define <code>BACKUP_ENCRYPTION_KEY</code> en el servidor y guarda esa
            clave también fuera de él: sin la clave, una copia cifrada no se puede recuperar.
          </p>
        )}

        {error && <Callout variant="danger">{error}</Callout>}
        {message && <Callout variant={message.ok ? "success" : "danger"}>{message.text}</Callout>}
        {!message && settings.lastTestAt && (
          <p className="text-xs text-ash-500">
            Última prueba ({new Date(settings.lastTestAt).toLocaleString("es-PE")}): {settings.lastTestOk ? "correcta" : "falló"}
            {settings.lastTestNote ? ` — ${settings.lastTestNote}` : ""}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={busy !== null || !dirty}>
            {busy === "save" ? "Guardando…" : "Guardar"}
          </Button>
          <Button variant="outline" onClick={test} disabled={busy !== null || dirty || !url.trim()}>
            {busy === "test" ? "Probando…" : "Probar conexión"}
          </Button>
          {dirty && <span className="self-center text-xs text-ash-500">Guarda los cambios antes de probar.</span>}
        </div>
      </CardContent>
    </Card>
  );
}
