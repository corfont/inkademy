"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminApi, ApiError, type EmailServerSettingsDTO } from "@/lib/api-client";
import { Input, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";

/**
 * "Se debe configurar los servidores para poder mandar correos" — antes
 * esto solo se configuraba con variables de entorno del worker
 * (SMTP_HOST/PORT/USER/PASS), sin ninguna pantalla de admin. La contraseña
 * nunca vuelve en texto plano: dejar el campo vacío al guardar significa
 * "no la cambies" (mismo patrón que la API key del asistente de IA / los
 * certificados SUNAT).
 */
export function EmailServerSettingsForm({ settings }: { settings: EmailServerSettingsDTO }) {
  const router = useRouter();
  const [host, setHost] = useState(settings.host ?? "");
  const [port, setPort] = useState(settings.port ?? 587);
  const [secure, setSecure] = useState(settings.secure);
  const [username, setUsername] = useState(settings.username ?? "");
  const [password, setPassword] = useState("");
  const [fromEmail, setFromEmail] = useState(settings.fromEmail ?? "");
  const [fromName, setFromName] = useState(settings.fromName ?? "Inkademy");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await adminApi.updateEmailServerSettings({
        host: host || null,
        port: Number(port) || null,
        secure,
        username: username || null,
        ...(password ? { password } : {}),
        fromEmail: fromEmail || null,
        fromName: fromName || null,
      });
      setPassword("");
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos guardar la configuración de correo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ash-500">
        {settings.configuredInDb
          ? "Estos valores tienen prioridad sobre las variables de entorno del servidor."
          : "Todavía no hay nada configurado acá — se está usando la configuración de variables de entorno del servidor (o Mailhog en desarrollo)."}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="smtp-host">Servidor (host)</Label>
          <Input id="smtp-host" value={host} onChange={(e) => setHost(e.target.value)} placeholder="smtp.tuproveedor.com" />
        </div>
        <div>
          <Label htmlFor="smtp-port">Puerto</Label>
          <Input id="smtp-port" type="number" value={port} onChange={(e) => setPort(Number(e.target.value))} placeholder="587" />
        </div>
        <div>
          <Label htmlFor="smtp-user">Usuario</Label>
          <Input id="smtp-user" value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="smtp-pass">Contraseña {settings.hasPassword && <span className="text-ash-400">(configurada — deja en blanco para no cambiarla)</span>}</Label>
          <Input id="smtp-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </div>
        <div>
          <Label htmlFor="smtp-from-email">Correo remitente</Label>
          <Input id="smtp-from-email" type="email" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} placeholder="no-reply@inkademy.com" />
        </div>
        <div>
          <Label htmlFor="smtp-from-name">Nombre remitente</Label>
          <Input id="smtp-from-name" value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Inkademy" />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm font-medium text-ink-900">
        <input type="checkbox" checked={secure} onChange={(e) => setSecure(e.target.checked)} />
        Conexión segura TLS/SSL (puerto 465) — desactívalo si tu proveedor usa STARTTLS (puerto 587, lo más común)
      </label>
      <div>
        <Button size="sm" variant="outline" disabled={busy} onClick={handleSave}>
          {busy ? "…" : saved ? "Guardado ✓" : "Guardar"}
        </Button>
      </div>
      {error && <Callout variant="danger">{error}</Callout>}
    </div>
  );
}
