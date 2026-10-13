"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, ShieldCheck } from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { roleHomeHref, getClientAccessToken } from "@/lib/auth";
import { ApiError, privacyApi, type PrivacyRequestDTO } from "@/lib/api-client";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card, CardContent } from "@/components/ui/Card";
import { Input, Label, Select, Textarea } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

const TYPE_LABEL: Record<string, string> = {
  ACCESS: "Acceso (copia de mis datos)",
  RECTIFICATION: "Rectificación",
  CANCELLATION: "Eliminación de mis datos",
  OPPOSITION: "Oposición",
};
const STATUS_LABEL: Record<string, string> = { PENDING: "En trámite", COMPLETED: "Atendida", REJECTED: "No procedió" };
const STATUS_VARIANT: Record<string, "warning" | "success" | "danger"> = { PENDING: "warning", COMPLETED: "success", REJECTED: "danger" };

const formatDate = (iso: string) => new Date(iso).toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" });

/**
 * «Privacidad y mis datos» — los derechos ARCO de la Ley 29733 al alcance de cualquier persona con sesión (alumno, docente, empresa o
 * administrador): descargar una copia de sus datos al instante y pedir rectificación, oposición o eliminación. Cada pedido queda
 * registrado con su plazo y lo atiende un administrador. Ruta única compartida por los 4 roles, como /notificaciones.
 */
export default function PrivacyPage() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<PrivacyRequestDTO[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [type, setType] = useState<"RECTIFICATION" | "OPPOSITION" | "CANCELLATION">("RECTIFICATION");
  const [message, setMessage] = useState("");
  const [password, setPassword] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    privacyApi.mine().then(setRequests).catch(() => {});
  }, []);
  useEffect(load, [load]);

  async function download() {
    setDownloading(true);
    setError(null);
    setNotice(null);
    try {
      const token = getClientAccessToken();
      if (!token) throw new ApiError(401, "Tu sesión expiró. Inicia sesión de nuevo.");
      await privacyApi.downloadMyData(token);
      setNotice("Descargamos tu archivo. Quedó registrado como una solicitud de acceso atendida.");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos generar tu archivo.");
    } finally {
      setDownloading(false);
    }
  }

  async function submit() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await privacyApi.create({ type, message: message.trim() || undefined, password: type === "CANCELLATION" ? password : undefined });
      setNotice(`Recibimos tu solicitud. Te responderemos a más tardar el ${formatDate(result.dueAt)}.`);
      setMessage("");
      setPassword("");
      setConfirming(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos registrar tu solicitud.");
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Eliminar es irreversible: se pide una confirmación aparte; los otros dos se envían directo.
    if (type === "CANCELLATION") setConfirming(true);
    else void submit();
  }

  return (
    <div className="mx-auto min-h-screen max-w-2xl bg-paper px-4 py-6">
      <Link href={roleHomeHref(user?.globalRole)} className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-ash-600 hover:text-ink-900">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Volver
      </Link>

      <header className="mb-6 flex items-start gap-3">
        <ShieldCheck className="mt-1 h-6 w-6 text-ink-700" aria-hidden="true" />
        <div>
          <h1 className="font-serif text-2xl font-semibold text-ink-900">Privacidad y mis datos</h1>
          <p className="mt-1 text-sm text-ash-600">
            Tienes derecho a conocer, corregir, oponerte al uso o pedir la eliminación de tus datos personales (Ley 29733). Aquí lo haces sin escribir a nadie.
          </p>
        </div>
      </header>

      {error && <Callout variant="danger" className="mb-4">{error}</Callout>}
      {notice && <Callout variant="success" className="mb-4">{notice}</Callout>}

      <Card className="mb-6">
        <CardContent className="flex flex-col gap-3 p-5">
          <h2 className="font-serif text-lg font-semibold text-ink-900">Descargar una copia de mis datos</h2>
          <p className="text-sm text-ash-600">
            Un archivo con tu perfil, matrículas, compras, certificados, mensajes de soporte y demás datos que guardamos de ti. No incluye contraseñas.
          </p>
          <div>
            <Button variant="outline" onClick={download} disabled={downloading}>
              <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {downloading ? "Preparando…" : "Descargar mis datos"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardContent className="p-5">
          <h2 className="mb-3 font-serif text-lg font-semibold text-ink-900">Hacer una solicitud</h2>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="priv-type">¿Qué necesitas?</Label>
              <Select id="priv-type" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
                <option value="RECTIFICATION">Corregir datos que están mal (rectificación)</option>
                <option value="OPPOSITION">Oponerme a un uso de mis datos (oposición)</option>
                <option value="CANCELLATION">Eliminar mis datos y cerrar mi cuenta (cancelación)</option>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="priv-msg">Cuéntanos los detalles {type === "CANCELLATION" ? "(opcional)" : ""}</Label>
              <Textarea id="priv-msg" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} required={type !== "CANCELLATION"} />
            </div>
            {type === "CANCELLATION" && (
              <>
                <Callout variant="warning">
                  Es irreversible: borramos tus datos personales y cerramos tu cuenta. Por obligación legal conservamos los comprobantes de pago y los certificados que ya se
                  emitieron. Un administrador revisa la solicitud antes de ejecutarla.
                </Callout>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="priv-pass">Tu contraseña actual</Label>
                  <Input id="priv-pass" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                  <p className="text-xs text-ash-500">Si entras solo con Google o Microsoft y no tienes contraseña, déjalo en blanco.</p>
                </div>
              </>
            )}
            <div>
              <Button type="submit" disabled={busy}>{busy ? "Enviando…" : "Enviar solicitud"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <section aria-labelledby="priv-mine">
        <h2 id="priv-mine" className="mb-3 font-serif text-lg font-semibold text-ink-900">Mis solicitudes</h2>
        {requests.length === 0 ? (
          <p className="text-sm text-ash-500">Todavía no hiciste ninguna solicitud.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {requests.map((r) => (
              <li key={r.id}>
                <Card>
                  <CardContent className="flex flex-col gap-1 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-ink-900">{TYPE_LABEL[r.type] ?? r.type}</span>
                      <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                    </div>
                    <p className="text-xs text-ash-500">
                      Enviada el {formatDate(r.createdAt)}
                      {r.status === "PENDING" ? ` · respuesta a más tardar el ${formatDate(r.dueAt)}` : r.resolvedAt ? ` · resuelta el ${formatDate(r.resolvedAt)}` : ""}
                    </p>
                    {r.resolutionNote && <p className="text-sm text-ash-700">{r.resolutionNote}</p>}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={confirming}
        title="¿Eliminar mis datos y cerrar mi cuenta?"
        message="Esta acción no se puede deshacer una vez que un administrador la ejecute. Perderás el acceso a tus cursos y certificados en tu cuenta."
        confirmLabel="Sí, enviar solicitud de eliminación"
        danger
        busy={busy}
        onConfirm={submit}
        onClose={() => setConfirming(false)}
      />
    </div>
  );
}
