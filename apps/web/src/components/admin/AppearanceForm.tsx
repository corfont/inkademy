"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud } from "lucide-react";
import { adminApi, ApiError, type PlatformSettingsDTO } from "@/lib/api-client";
import { BRAND_FONT_OPTIONS } from "@/lib/brand-fonts";
import { Input, Label, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card, CardContent } from "@/components/ui/Card";

/**
 * Formulario de /admin/apariencia. Guarda vía PATCH /admin/settings y hace
 * router.refresh() para que el propio layout raíz (server component) vuelva
 * a leer /settings y aplique el cambio de inmediato en toda la plataforma.
 */
export function AppearanceForm({ settings }: { settings: PlatformSettingsDTO }) {
  const router = useRouter();
  const [form, setForm] = useState(settings);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleLogoUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const { url } = await adminApi.uploadAsset(file);
      setForm((f) => ({ ...f, logoUrl: url }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos subir el logo.");
    } finally {
      setUploading(false);
    }
  }

  async function handleBackgroundUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const { url } = await adminApi.uploadAsset(file);
      setForm((f) => ({ ...f, backgroundImageUrl: url }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos subir la imagen de fondo.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await adminApi.updateSettings({
        logoUrl: form.logoUrl,
        logoHeightPx: form.logoHeightPx,
        headingFontFamily: form.headingFontFamily,
        bodyFontFamily: form.bodyFontFamily,
        backgroundColor: form.backgroundColor,
        backgroundImageUrl: form.backgroundImageUrl,
      });
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos guardar los cambios.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <Callout variant="danger">{error}</Callout>}
      {saved && <Callout variant="success">Guardado. Ya se aplicó en toda la plataforma.</Callout>}

      <Card>
        <CardContent className="flex flex-col gap-4 p-6">
          <h2 className="font-serif text-lg font-semibold text-ink-900">Logo</h2>
          <div className="flex items-center gap-6">
            <div className="flex h-20 w-40 items-center justify-center rounded-md border border-dashed border-paper-border bg-paper-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={form.logoUrl || "/brand/logo-horizontal.png"}
                alt="Vista previa del logo"
                style={{ height: form.logoHeightPx, width: "auto", maxWidth: "100%" }}
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-700 hover:underline">
              <UploadCloud className="h-4 w-4" aria-hidden="true" />
              {uploading ? "Subiendo…" : "Subir logo nuevo"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploading}
                onChange={(e) => e.target.files?.[0] && handleLogoUpload(e.target.files[0])}
              />
            </label>
          </div>
          <div className="max-w-xs">
            <Label htmlFor="logo-height">Alto del logo: {form.logoHeightPx}px</Label>
            <input
              id="logo-height"
              type="range"
              min={16}
              max={80}
              value={form.logoHeightPx}
              onChange={(e) => setForm((f) => ({ ...f, logoHeightPx: Number(e.target.value) }))}
              className="w-full"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 p-6">
          <h2 className="font-serif text-lg font-semibold text-ink-900">Tipografía</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="heading-font">Titulares</Label>
              <Select
                id="heading-font"
                value={form.headingFontFamily}
                onChange={(e) => setForm((f) => ({ ...f, headingFontFamily: e.target.value }))}
              >
                {BRAND_FONT_OPTIONS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="body-font">Texto</Label>
              <Select
                id="body-font"
                value={form.bodyFontFamily}
                onChange={(e) => setForm((f) => ({ ...f, bodyFontFamily: e.target.value }))}
              >
                {BRAND_FONT_OPTIONS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <p className="text-xs text-ash-500">
            &quot;Outfit&quot; y &quot;Work Sans&quot; son la tipografía real del manual de marca Inkapitales.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 p-6">
          <h2 className="font-serif text-lg font-semibold text-ink-900">Fondo del sitio</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="bg-color">Color de fondo (opcional)</Label>
              <div className="flex items-center gap-2">
                <input
                  id="bg-color"
                  type="color"
                  value={form.backgroundColor || "#faf7f2"}
                  onChange={(e) => setForm((f) => ({ ...f, backgroundColor: e.target.value }))}
                  className="h-11 w-14 rounded border border-paper-border"
                />
                <Input
                  value={form.backgroundColor || ""}
                  placeholder="Automático (según el tema)"
                  onChange={(e) => setForm((f) => ({ ...f, backgroundColor: e.target.value || null }))}
                />
              </div>
            </div>
            <div>
              <Label>Imagen de fondo (opcional)</Label>
              <label className="flex h-11 cursor-pointer items-center gap-2 text-sm text-ink-700 hover:underline">
                <UploadCloud className="h-4 w-4" aria-hidden="true" />
                {uploading ? "Subiendo…" : form.backgroundImageUrl ? "Reemplazar imagen" : "Subir imagen"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => e.target.files?.[0] && handleBackgroundUpload(e.target.files[0])}
                />
              </label>
            </div>
          </div>
          {form.backgroundImageUrl && (
            <button
              type="button"
              className="self-start text-xs text-danger hover:underline"
              onClick={() => setForm((f) => ({ ...f, backgroundImageUrl: null }))}
            >
              Quitar imagen de fondo
            </button>
          )}
        </CardContent>
      </Card>

      <div>
        <Button size="lg" disabled={saving || uploading} onClick={handleSave}>
          {saving ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>
    </div>
  );
}
