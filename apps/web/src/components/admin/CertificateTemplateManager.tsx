"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CERTIFICATE_TAGS, HTML_ONLY_TAGS, type CertificateTagPosition } from "@inkademy/shared";
import { adminApi, ApiError } from "@/lib/api-client";
import { Input, Label, Select, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { Card, CardContent } from "@/components/ui/Card";
import { FileDropzone } from "./FileDropzone";

// Placeholders reales que reemplaza apps/worker/src/processors/certificate.processor.ts
// al generar el PDF (renderPlaceholders / renderBackgroundTemplate). La
// vista previa de acá usa los mismos nombres con datos de ejemplo, sin
// llamar al worker. Los tags de imagen se representan como <img> de
// muestra (igual que hace el worker en modo HTML).
const SAMPLE_QR =
  "data:image/svg+xml;base64," +
  btoa(
    '<svg xmlns="http://www.w3.org/2000/svg" width="110" height="110"><rect width="110" height="110" fill="#fff"/><rect x="10" y="10" width="90" height="90" fill="none" stroke="#1c2038" stroke-width="4"/><text x="55" y="60" font-size="10" text-anchor="middle" fill="#6b6e8a">QR</text></svg>',
  );
const SAMPLE_SIGNATURE = (label: string) =>
  "data:image/svg+xml;base64," +
  btoa(
    `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="60"><rect width="160" height="60" fill="none"/><text x="80" y="34" font-size="14" text-anchor="middle" fill="#586bd8" font-family="cursive">${label}</text></svg>`,
  );

function sampleValueFor(tag: string): string {
  if (tag === "qrDataUrl") return `<img src="${SAMPLE_QR}" alt="QR" />`;
  if (tag === "teacherSignature") return `<img src="${SAMPLE_SIGNATURE("Firma docente")}" style="max-height:50px" />`;
  if (tag === "institutionSignatureImage") return `<img src="${SAMPLE_SIGNATURE("Firma GG")}" style="max-height:50px" />`;
  if (tag === "logo") return `<img src="/brand/logo-horizontal.png" alt="Inkademy" style="height:40px" />`;
  const found = CERTIFICATE_TAGS.find((t) => t.tag === tag) ?? HTML_ONLY_TAGS.find((t) => t.tag === tag);
  return found?.sample ?? "";
}

function renderPreview(html: string): string {
  return html.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => sampleValueFor(key));
}

const EXAMPLE_TEMPLATE_NAME = "Plantilla Inkapitales (Escuela Especializada)";

// Aproximación web de los 5 fonts estándar de PDF que puede elegir el
// admin — la vista previa es CSS (no el PDF real), así que se mapea a la
// familia web-safe más parecida solo para dar una idea visual antes de
// regenerar el certificado.
const CSS_FONT_PREVIEW: Record<NonNullable<CertificateTagPosition["fontFamily"]>, string> = {
  helvetica: "Helvetica, Arial, sans-serif",
  "helvetica-bold": "Helvetica, Arial, sans-serif",
  times: "'Times New Roman', Georgia, serif",
  "times-bold": "'Times New Roman', Georgia, serif",
  courier: "'Courier New', Courier, monospace",
};

interface TagRow extends CertificateTagPosition {
  enabled: boolean;
}

function defaultTagRows(): Record<string, TagRow> {
  const rows: Record<string, TagRow> = {};
  for (const t of CERTIFICATE_TAGS) {
    rows[t.tag] = {
      tag: t.tag,
      enabled: false,
      xPercent: 50,
      yPercent: 50,
      fontSizePt: t.kind === "text" ? 16 : undefined,
      color: t.kind === "text" ? "#1c2038" : undefined,
      align: t.kind === "text" ? "center" : undefined,
      widthPercent: t.kind === "image" ? 14 : undefined,
      heightPercent: t.kind === "image" ? (t.tag === "qrDataUrl" ? 14 : 8) : undefined,
    };
  }
  // Posiciones iniciales razonables para lo más común: nombre y firmas.
  rows.studentName = { ...rows.studentName, enabled: true, yPercent: 45, fontSizePt: 26 };
  rows.courseName = { ...rows.courseName, enabled: true, yPercent: 55, fontSizePt: 16 };
  return rows;
}

export function CertificateTemplateManager({ templates }: { templates: any[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadingBackground, setUploadingBackground] = useState(false);
  const [form, setForm] = useState({
    name: "",
    locale: "es",
    htmlTemplate: "",
    active: true,
    sourceType: "HTML" as "HTML" | "BACKGROUND",
    backgroundAssetId: null as string | null,
    backgroundMimeType: null as string | null,
    backgroundPreviewUrl: null as string | null,
    pageWidthPt: 841.89,
    pageHeightPt: 595.28,
  });
  const [tagRows, setTagRows] = useState<Record<string, TagRow>>(defaultTagRows);
  const [placingTag, setPlacingTag] = useState<string | null>(null);

  const previewHtml = useMemo(
    () => renderPreview(form.htmlTemplate || "<p style='padding:2rem;color:#999'>Escribe o carga una plantilla para previsualizarla.</p>"),
    [form.htmlTemplate],
  );

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

  function resetForm() {
    setForm({
      name: "",
      locale: "es",
      htmlTemplate: "",
      active: true,
      sourceType: "HTML",
      backgroundAssetId: null,
      backgroundMimeType: null,
      backgroundPreviewUrl: null,
      pageWidthPt: 841.89,
      pageHeightPt: 595.28,
    });
    setTagRows(defaultTagRows());
  }

  async function handleBackgroundUpload(file: File) {
    setUploadingBackground(true);
    setError(null);
    try {
      const { assetId, url } = await adminApi.uploadAsset(file);
      setForm((f) => ({ ...f, backgroundAssetId: assetId, backgroundMimeType: file.type, backgroundPreviewUrl: url }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos subir el archivo de fondo.");
    } finally {
      setUploadingBackground(false);
    }
  }

  function updateTag(tag: string, patch: Partial<TagRow>) {
    setTagRows((rows) => ({ ...rows, [tag]: { ...rows[tag], ...patch } }));
  }

  async function handleCreate() {
    const payload: Record<string, unknown> = {
      name: form.name,
      locale: form.locale,
      active: form.active,
      sourceType: form.sourceType,
    };
    if (form.sourceType === "HTML") {
      payload.htmlTemplate = form.htmlTemplate;
    } else {
      payload.backgroundAssetId = form.backgroundAssetId;
      payload.backgroundMimeType = form.backgroundMimeType;
      payload.pageWidthPt = form.pageWidthPt;
      payload.pageHeightPt = form.pageHeightPt;
      payload.tagPositions = Object.values(tagRows)
        .filter((r) => r.enabled)
        .map(({ enabled: _enabled, ...rest }) => rest);
    }
    await run(() => adminApi.createCertificateTemplate(payload));
    resetForm();
  }

  const canSubmit =
    form.name.trim() &&
    (form.sourceType === "HTML" ? form.htmlTemplate.trim() : form.backgroundAssetId && Object.values(tagRows).some((r) => r.enabled));

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
                    <th className="p-3 font-medium">Tipo</th>
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
                      <td className="p-3">
                        <Badge variant="outline">{tpl.sourceType === "BACKGROUND" ? "Fondo (PDF/imagen)" : "HTML"}</Badge>
                      </td>
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
            {form.sourceType === "HTML" && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setForm((f) => ({ ...f, name: f.name || EXAMPLE_TEMPLATE_NAME, htmlTemplate: EXAMPLE_CERTIFICATE_HTML }))
                }
              >
                Cargar plantilla de ejemplo (estilo Inkapitales)
              </Button>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
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
            <div>
              <Label htmlFor="tpl-source">Origen del diseño</Label>
              <Select
                id="tpl-source"
                value={form.sourceType}
                onChange={(e) => setForm((f) => ({ ...f, sourceType: e.target.value as "HTML" | "BACKGROUND" }))}
              >
                <option value="HTML">HTML (escribir el diseño)</option>
                <option value="BACKGROUND">Fondo ya diseñado (PDF, PNG o JPG)</option>
              </Select>
            </div>
          </div>

          {form.sourceType === "HTML" ? (
            <div>
              <Label htmlFor="tpl-html">HTML de la plantilla</Label>
              <p className="mb-1 text-xs text-ash-500">
                Placeholders disponibles:{" "}
                {[...CERTIFICATE_TAGS, ...HTML_ONLY_TAGS].map((t) => (
                  <code key={t.tag} className="mr-1" title={t.label}>
                    {`{{${t.tag}}}`}
                  </code>
                ))}
                — <code>{"{{teacherSignature}}"}</code> e <code>{"{{institutionSignatureImage}}"}</code> se insertan vacíos si el
                docente o Inkapitales todavía no tienen una firma cargada (ver /admin/usuarios y /admin/apariencia).
              </p>
              <Textarea
                id="tpl-html"
                className="min-h-[16rem] font-mono text-xs"
                value={form.htmlTemplate}
                onChange={(e) => setForm((f) => ({ ...f, htmlTemplate: e.target.value }))}
              />
              <div className="mt-3">
                <p className="mb-2 text-sm font-medium text-ash-700">Vista previa (con datos de ejemplo)</p>
                <div className="overflow-hidden rounded-lg border border-paper-border bg-paper-muted">
                  <iframe title="Vista previa de la plantilla" srcDoc={previewHtml} className="h-[26rem] w-full" sandbox="" />
                </div>
              </div>
            </div>
          ) : (
            <BackgroundTemplateEditor
              form={form}
              uploadingBackground={uploadingBackground}
              onUpload={handleBackgroundUpload}
              tagRows={tagRows}
              updateTag={updateTag}
              placingTag={placingTag}
              setPlacingTag={setPlacingTag}
            />
          )}

          <label className="flex items-center gap-2 text-sm text-ash-600">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
            Activa (disponible para emitir certificados)
          </label>

          <div>
            <Button disabled={busy || !canSubmit} onClick={handleCreate}>
              {busy ? "Guardando…" : "Crear plantilla"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function BackgroundTemplateEditor({
  form,
  uploadingBackground,
  onUpload,
  tagRows,
  updateTag,
  placingTag,
  setPlacingTag,
}: {
  form: { backgroundAssetId: string | null; backgroundMimeType: string | null; backgroundPreviewUrl: string | null; pageWidthPt: number; pageHeightPt: number };
  uploadingBackground: boolean;
  onUpload: (file: File) => void;
  tagRows: Record<string, TagRow>;
  updateTag: (tag: string, patch: Partial<TagRow>) => void;
  placingTag: string | null;
  setPlacingTag: (tag: string | null) => void;
}) {
  const isPdf = form.backgroundMimeType === "application/pdf";
  const aspect = form.pageWidthPt / form.pageHeightPt;

  function handlePreviewClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!placingTag) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xPercent = Math.round(((e.clientX - rect.left) / rect.width) * 1000) / 10;
    const yPercent = Math.round(((e.clientY - rect.top) / rect.height) * 1000) / 10;
    updateTag(placingTag, { xPercent: Math.min(100, Math.max(0, xPercent)), yPercent: Math.min(100, Math.max(0, yPercent)) });
    setPlacingTag(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Label>Archivo de fondo (PDF, PNG o JPG)</Label>
        <FileDropzone
          accept="application/pdf,image/png,image/jpeg"
          busy={uploadingBackground}
          label={form.backgroundAssetId ? "Reemplazar archivo" : "Subir archivo de fondo"}
          hint="El diseño ya terminado (bordes, logos, texto fijo) — los tags se colocan encima"
          onFile={onUpload}
        />
        {form.backgroundAssetId && <p className="mt-1 text-xs text-success">Archivo cargado ({form.backgroundMimeType}).</p>}
      </div>

      {!isPdf && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="tpl-page-w">Ancho de página (puntos, 72pt = 1 pulgada)</Label>
            <Input id="tpl-page-w" type="number" value={form.pageWidthPt} readOnly disabled className="opacity-70" />
          </div>
          <div>
            <Label htmlFor="tpl-page-h">Alto de página (puntos)</Label>
            <Input id="tpl-page-h" type="number" value={form.pageHeightPt} readOnly disabled className="opacity-70" />
          </div>
        </div>
      )}

      <div>
        <p className="mb-2 text-sm font-medium text-ash-700">
          Vista previa {placingTag ? <span className="text-ink-600">— haz click en la imagen para colocar el tag seleccionado</span> : null}
        </p>
        <div
          onClick={handlePreviewClick}
          className={`relative w-full max-w-2xl overflow-hidden rounded-lg border border-paper-border bg-paper-muted ${placingTag ? "cursor-crosshair" : ""}`}
          style={{ aspectRatio: `${aspect}` }}
        >
          {form.backgroundAssetId && !isPdf && form.backgroundPreviewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={form.backgroundPreviewUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : form.backgroundAssetId && isPdf ? (
            <div className="absolute inset-0 flex items-center justify-center text-center text-xs text-ash-500">
              Fondo PDF cargado — la vista previa exacta no se puede mostrar aquí, pero se aplicará igual al generar el certificado.
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-ash-400">Sube un archivo de fondo primero</div>
          )}

          {Object.values(tagRows)
            .filter((r) => r.enabled)
            .map((r) => {
              const def = CERTIFICATE_TAGS.find((t) => t.tag === r.tag)!;
              if (def.kind === "image") {
                return (
                  <div
                    key={r.tag}
                    className="absolute flex items-center justify-center border border-dashed border-ink-500 bg-ink-500/10 text-[10px] text-ink-700"
                    style={{
                      left: `${r.xPercent}%`,
                      top: `${r.yPercent}%`,
                      width: `${r.widthPercent}%`,
                      height: `${r.heightPercent}%`,
                    }}
                  >
                    {def.label}
                  </div>
                );
              }
              return (
                <div
                  key={r.tag}
                  className="absolute whitespace-nowrap"
                  style={{
                    left: `${r.xPercent}%`,
                    top: `${r.yPercent}%`,
                    fontSize: `${(r.fontSizePt ?? 16) * 0.9}px`,
                    color: r.color,
                    fontFamily: CSS_FONT_PREVIEW[r.fontFamily ?? "helvetica"],
                    fontWeight: r.fontFamily?.endsWith("-bold") ? 700 : 400,
                    transform: r.align === "center" ? "translateX(-50%)" : r.align === "right" ? "translateX(-100%)" : undefined,
                  }}
                >
                  {def.sample}
                </div>
              );
            })}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-paper-border">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-paper-border text-ash-500">
            <tr>
              <th className="p-2 font-medium">Incluir</th>
              <th className="p-2 font-medium">Tag</th>
              <th className="p-2 font-medium">X%</th>
              <th className="p-2 font-medium">Y%</th>
              <th className="p-2 font-medium">Tamaño/ancho</th>
              <th className="p-2 font-medium">Color/alto</th>
              <th className="p-2 font-medium">Alinear</th>
              <th className="p-2 font-medium">Fuente</th>
              <th className="p-2 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-paper-border">
            {CERTIFICATE_TAGS.map((def) => {
              const r = tagRows[def.tag];
              return (
                <tr key={def.tag}>
                  <td className="p-2">
                    <input type="checkbox" checked={r.enabled} onChange={(e) => updateTag(def.tag, { enabled: e.target.checked })} />
                  </td>
                  <td className="p-2 font-medium text-ink-900">{def.label}</td>
                  <td className="p-2">
                    <Input
                      type="number"
                      className="h-7 w-16 text-xs"
                      value={r.xPercent}
                      onChange={(e) => updateTag(def.tag, { xPercent: Number(e.target.value) })}
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      type="number"
                      className="h-7 w-16 text-xs"
                      value={r.yPercent}
                      onChange={(e) => updateTag(def.tag, { yPercent: Number(e.target.value) })}
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      type="number"
                      className="h-7 w-16 text-xs"
                      value={def.kind === "text" ? r.fontSizePt ?? 16 : r.widthPercent ?? 14}
                      onChange={(e) =>
                        updateTag(def.tag, def.kind === "text" ? { fontSizePt: Number(e.target.value) } : { widthPercent: Number(e.target.value) })
                      }
                    />
                  </td>
                  <td className="p-2">
                    {def.kind === "text" ? (
                      <input type="color" value={r.color ?? "#1c2038"} onChange={(e) => updateTag(def.tag, { color: e.target.value })} />
                    ) : (
                      <Input
                        type="number"
                        className="h-7 w-16 text-xs"
                        value={r.heightPercent ?? 8}
                        onChange={(e) => updateTag(def.tag, { heightPercent: Number(e.target.value) })}
                      />
                    )}
                  </td>
                  <td className="p-2">
                    {def.kind === "text" && (
                      <Select
                        className="h-7 w-20 text-xs"
                        value={r.align ?? "center"}
                        onChange={(e) => updateTag(def.tag, { align: e.target.value as "left" | "center" | "right" })}
                      >
                        <option value="left">Izq.</option>
                        <option value="center">Centro</option>
                        <option value="right">Der.</option>
                      </Select>
                    )}
                  </td>
                  <td className="p-2">
                    {def.kind === "text" && (
                      <Select
                        className="h-7 w-24 text-xs"
                        value={r.fontFamily ?? "helvetica"}
                        onChange={(e) => updateTag(def.tag, { fontFamily: e.target.value as CertificateTagPosition["fontFamily"] })}
                      >
                        <option value="helvetica">Helvetica</option>
                        <option value="helvetica-bold">Helvetica (negrita)</option>
                        <option value="times">Times</option>
                        <option value="times-bold">Times (negrita)</option>
                        <option value="courier">Courier</option>
                      </Select>
                    )}
                  </td>
                  <td className="p-2">
                    <Button size="sm" variant={placingTag === def.tag ? "primary" : "ghost"} onClick={() => setPlacingTag(def.tag)}>
                      Colocar
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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
      .signature .stamp { height: 5vh; display: flex; align-items: flex-end; justify-content: center; margin-bottom: 0.4vh; }
      .signature .stamp img { max-height: 5vh; max-width: 100%; }
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
            {{logo}}
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
              <div class="stamp">{{institutionSignatureImage}}</div>
              <div class="line"></div>
              <p class="name">{{institutionSignatureName}}</p>
              <p class="role">{{institutionSignatureTitle}}</p>
            </div>
            <div class="signature">
              <div class="stamp">{{teacherSignature}}</div>
              <div class="line"></div>
              <p class="name">{{teacherName}}</p>
              <p class="role">Docente</p>
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
