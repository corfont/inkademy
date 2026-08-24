"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { adminApi, ApiError } from "@/lib/api-client";
import { Input, Label, Select, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { Card, CardContent } from "@/components/ui/Card";

// Placeholders reales que reemplaza apps/worker/src/processors/certificate.processor.ts
// al generar el PDF (ver renderPlaceholders). La vista previa de acá usa
// los mismos nombres con datos de ejemplo, sin llamar al worker.
const SAMPLE_VARS: Record<string, string> = {
  studentName: "María Fernanda Quispe Rojas",
  courseName: "Liderazgo de Equipos Remotos",
  issuedDate: "24 de agosto de 2026",
  finalScore: "17.8",
  code: "INK-2026-00456",
  qrDataUrl:
    "data:image/svg+xml;base64," +
    btoa(
      '<svg xmlns="http://www.w3.org/2000/svg" width="110" height="110"><rect width="110" height="110" fill="#fff"/><rect x="10" y="10" width="90" height="90" fill="none" stroke="#1c2038" stroke-width="4"/><text x="55" y="60" font-size="10" text-anchor="middle" fill="#6b6e8a">QR</text></svg>',
    ),
  appUrl: typeof window !== "undefined" ? window.location.origin : "",
};

const EXAMPLE_TEMPLATE_NAME = "Plantilla Inkapitales (Escuela Especializada)";

function renderPreview(html: string): string {
  return html.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => SAMPLE_VARS[key] ?? "");
}

export function CertificateTemplateManager({ templates }: { templates: any[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", locale: "es", htmlTemplate: "", active: true });
  const previewHtml = useMemo(() => renderPreview(form.htmlTemplate || "<p style='padding:2rem;color:#999'>Escribe o carga una plantilla para previsualizarla.</p>"), [form.htmlTemplate]);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    setBusy(true);
    try {
      await action();
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Ocurrió un error. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate() {
    await run(() => adminApi.createCertificateTemplate(form));
    setForm({ name: "", locale: "es", htmlTemplate: "", active: true });
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <Callout variant="danger">{error}</Callout>}

      <Card>
        <CardContent className="p-6">
          <h2 className="mb-4 font-serif text-lg font-semibold text-ink-900">Plantillas existentes</h2>
          {templates.length === 0 ? (
            <p className="text-sm text-ash-500">Todavía no hay ninguna plantilla.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-paper-border">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-paper-border text-ash-500">
                  <tr>
                    <th className="p-3 font-medium">Nombre</th>
                    <th className="p-3 font-medium">Idioma</th>
                    <th className="p-3 font-medium">Versión</th>
                    <th className="p-3 font-medium">Estado</th>
                    <th className="p-3 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-paper-border">
                  {templates.map((tpl) => (
                    <tr key={tpl.id}>
                      <td className="p-3 font-medium text-ink-900">{tpl.name}</td>
                      <td className="p-3 text-ash-600">{tpl.locale}</td>
                      <td className="p-3 text-ash-600">v{tpl.version}</td>
                      <td className="p-3">
                        <Badge variant={tpl.active ? "success" : "outline"}>{tpl.active ? "Activa" : "Inactiva"}</Badge>
                      </td>
                      <td className="p-3">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => run(() => adminApi.updateCertificateTemplate(tpl.id, { active: !tpl.active }))}
                        >
                          {tpl.active ? "Desactivar" : "Activar"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-lg font-semibold text-ink-900">Nueva plantilla</h2>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  name: f.name || EXAMPLE_TEMPLATE_NAME,
                  htmlTemplate: EXAMPLE_CERTIFICATE_HTML,
                }))
              }
            >
              Cargar plantilla de ejemplo (estilo Inkapitales)
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="tpl-name">Nombre</Label>
              <Input id="tpl-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="tpl-locale">Idioma</Label>
              <Select id="tpl-locale" value={form.locale} onChange={(e) => setForm((f) => ({ ...f, locale: e.target.value }))}>
                <option value="es">Español</option>
                <option value="en">English</option>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="tpl-html">HTML de la plantilla</Label>
            <p className="mb-1 text-xs text-ash-500">
              Placeholders disponibles: <code>{"{{studentName}}"}</code> <code>{"{{courseName}}"}</code>{" "}
              <code>{"{{issuedDate}}"}</code> <code>{"{{finalScore}}"}</code> <code>{"{{code}}"}</code>{" "}
              <code>{"{{qrDataUrl}}"}</code> <code>{"{{appUrl}}"}</code> (para insertar el logo real como{" "}
              <code>{"{{appUrl}}/brand/logo-horizontal.png"}</code>).
            </p>
            <Textarea
              id="tpl-html"
              className="min-h-[16rem] font-mono text-xs"
              value={form.htmlTemplate}
              onChange={(e) => setForm((f) => ({ ...f, htmlTemplate: e.target.value }))}
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-ash-600">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
            Activa (disponible para emitir certificados)
          </label>

          <div>
            <p className="mb-2 text-sm font-medium text-ash-700">Vista previa (con datos de ejemplo)</p>
            <div className="overflow-hidden rounded-lg border border-paper-border bg-paper-muted">
              <iframe title="Vista previa de la plantilla" srcDoc={previewHtml} className="h-[26rem] w-full" sandbox="" />
            </div>
          </div>

          <div>
            <Button disabled={busy || !form.name.trim() || !form.htmlTemplate.trim()} onClick={handleCreate}>
              {busy ? "Guardando…" : "Crear plantilla"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const EXAMPLE_CERTIFICATE_HTML = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <style>
      @page { margin: 0; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; }
      body {
        font-family: 'Work Sans', Arial, sans-serif;
        width: 100vw;
        height: 100vh;
        position: relative;
        background: #ffffff;
        color: #1c2038;
        overflow: hidden;
      }
      .frame { position: absolute; inset: 3.2vw; border: 2px solid #0d0f1c; padding: 3px; }
      .frame-inner { position: relative; height: 100%; border: 1px solid #d8b16c; overflow: hidden; }
      .corner { position: absolute; width: 16vw; height: 16vw; }
      .corner-tl { top: -8vw; left: -8vw; background: linear-gradient(135deg, #586bd8 45%, transparent 46%); }
      .corner-br { bottom: -8vw; right: -8vw; background: linear-gradient(-45deg, #d8b16c 45%, transparent 46%); }
      .content { position: relative; z-index: 1; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; padding: 3.4vh 5vw 2.6vh; text-align: center; }
      .header { display: flex; align-items: center; justify-content: space-between; width: 100%; }
      .header img { height: 4.2vh; }
      .badge-escuela { font-family: 'Outfit', sans-serif; font-weight: 700; font-size: 1.6vh; letter-spacing: 0.05em; color: #586bd8; text-transform: uppercase; border: 1px solid #586bd8; border-radius: 999px; padding: 0.6vh 1.4vh; }
      h1.title { font-family: 'Outfit', sans-serif; font-weight: 800; font-size: 5vh; letter-spacing: 0.06em; color: #1c2038; margin: 2.4vh 0 0.6vh; text-transform: uppercase; }
      .dots { color: #d8b16c; font-size: 1.6vh; letter-spacing: 0.4em; margin-bottom: 2vh; }
      .student-name { font-family: 'Outfit', sans-serif; font-weight: 700; font-size: 3.4vh; color: #0d0f1c; margin: 1vh 0; }
      .lead { font-size: 1.7vh; color: #4b4f66; margin: 0.4vh 0; }
      .course-title { font-family: 'Outfit', sans-serif; font-weight: 700; font-size: 2.1vh; color: #586bd8; max-width: 80%; margin: 1vh 0; line-height: 1.35; }
      .meta { font-size: 1.4vh; color: #6b6e8a; margin-top: 0.6vh; max-width: 75%; }
      .signatures { margin-top: auto; width: 100%; display: flex; justify-content: space-around; padding-top: 3vh; }
      .signature { width: 30%; }
      .signature .line { border-top: 1px solid #1c2038; margin-bottom: 0.8vh; }
      .signature .name { font-weight: 600; font-size: 1.5vh; color: #1c2038; }
      .signature .role { font-size: 1.2vh; color: #6b6e8a; }
      .seal { position: absolute; bottom: 8vh; left: 50%; transform: translateX(-50%); width: 8vh; height: 8vh; border-radius: 50%; background: linear-gradient(130deg, #586bd8 8%, #d8b16c 92%); display: flex; align-items: center; justify-content: center; color: #fff; font-family: 'Outfit', sans-serif; font-weight: 700; font-size: 1vh; text-align: center; line-height: 1.2; box-shadow: 0 8px 24px rgba(13, 15, 28, 0.25); }
      .footer { display: flex; align-items: center; justify-content: center; gap: 1.4vh; margin-top: 2vh; }
      .footer img { width: 6vh; height: 6vh; }
      .footer .code { font-size: 1.2vh; color: #9497ab; text-align: left; }
    </style>
  </head>
  <body>
    <div class="frame">
      <div class="frame-inner">
        <div class="corner corner-tl"></div>
        <div class="corner corner-br"></div>
        <div class="content">
          <div class="header">
            <img src="{{appUrl}}/brand/logo-horizontal.png" alt="Inkademy" />
            <span class="badge-escuela">Escuela Especializada</span>
          </div>
          <h1 class="title">Certificado</h1>
          <div class="dots">&#9670;&nbsp;&nbsp;&#9670;&nbsp;&nbsp;&#9670;</div>
          <p class="student-name">{{studentName}}</p>
          <p class="lead">Ha aprobado satisfactoriamente la capacitación en</p>
          <p class="course-title">{{courseName}}</p>
          <p class="meta">Emitido el {{issuedDate}} · Calificación final: {{finalScore}}</p>
          <div class="signatures">
            <div class="signature">
              <div class="line"></div>
              <p class="name">Dirección General</p>
              <p class="role">Inkademy</p>
            </div>
            <div class="signature">
              <div class="line"></div>
              <p class="name">Dirección Académica</p>
              <p class="role">Inkademy</p>
            </div>
          </div>
          <div class="seal">HIGH<br />QUALITY</div>
          <div class="footer">
            <img src="{{qrDataUrl}}" alt="Código QR de verificación" />
            <div class="code">Código de verificación:<br />{{code}}</div>
          </div>
        </div>
      </div>
    </div>
  </body>
</html>`;
