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
const DEFAULT_COURSE_CARD_FIELDS = { showTeacher: true, showDuration: true, showNextLiveSession: true, showCertificationBadge: true };

export function AppearanceForm({ settings }: { settings: PlatformSettingsDTO }) {
  const router = useRouter();
  const [form, setForm] = useState({ ...settings, courseCardFields: settings.courseCardFields ?? DEFAULT_COURSE_CARD_FIELDS });
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

  async function handleInstitutionSignatureUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const { assetId, url } = await adminApi.uploadAsset(file);
      setForm((f) => ({ ...f, institutionSignatureAssetId: assetId, institutionSignatureUrl: url }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos subir la firma.");
    } finally {
      setUploading(false);
    }
  }

  async function handleWatermarkUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const { assetId, url } = await adminApi.uploadAsset(file);
      setForm((f) => ({ ...f, watermarkAssetId: assetId, watermarkUrl: url }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos subir el sello de agua.");
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
        primaryColor: form.primaryColor,
        accentColor: form.accentColor,
        contactEmail: form.contactEmail,
        contactPhone: form.contactPhone,
        contactAddress: form.contactAddress,
        courseCardFields: form.courseCardFields,
        institutionSignatureAssetId: form.institutionSignatureAssetId,
        institutionSignatureName: form.institutionSignatureName,
        institutionSignatureTitle: form.institutionSignatureTitle,
        watermarkAssetId: form.watermarkAssetId,
        watermarkOpacityPct: form.watermarkOpacityPct,
        watermarkSizePercent: form.watermarkSizePercent,
        sidebarColor: form.sidebarColor,
        menuFontFamily: form.menuFontFamily,
        menuFontSizePx: form.menuFontSizePx,
        menuFontColor: form.menuFontColor,
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
              max={160}
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
          <h2 className="font-serif text-lg font-semibold text-ink-900">Colores de marca</h2>
          <p className="text-xs text-ash-500">
            Por defecto son los del manual de marca real de Inkapitales (#586BD8 primario, #D8B26C acento) — solo cámbialos si el manual cambia.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="primary-color">Color primario (botones, enlaces)</Label>
              <div className="flex items-center gap-2">
                <input
                  id="primary-color"
                  type="color"
                  value={form.primaryColor || "#586BD8"}
                  onChange={(e) => setForm((f) => ({ ...f, primaryColor: e.target.value }))}
                  className="h-11 w-14 rounded border border-paper-border"
                />
                <Input
                  value={form.primaryColor || ""}
                  placeholder="#586BD8 (default real)"
                  onChange={(e) => setForm((f) => ({ ...f, primaryColor: e.target.value || null }))}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="accent-color">Color de acento (detalles dorados)</Label>
              <div className="flex items-center gap-2">
                <input
                  id="accent-color"
                  type="color"
                  value={form.accentColor || "#D8B26C"}
                  onChange={(e) => setForm((f) => ({ ...f, accentColor: e.target.value }))}
                  className="h-11 w-14 rounded border border-paper-border"
                />
                <Input
                  value={form.accentColor || ""}
                  placeholder="#D8B26C (default real)"
                  onChange={(e) => setForm((f) => ({ ...f, accentColor: e.target.value || null }))}
                />
              </div>
            </div>
          </div>
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

      <Card>
        <CardContent className="flex flex-col gap-4 p-6">
          <h2 className="font-serif text-lg font-semibold text-ink-900">Datos de contacto</h2>
          <p className="text-sm text-ash-500">Se muestran en el pie de página del sitio público.</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="contact-email">Correo</Label>
              <Input
                id="contact-email"
                type="email"
                value={form.contactEmail ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="contact-phone">Teléfono</Label>
              <Input
                id="contact-phone"
                value={form.contactPhone ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="contact-address">Ubicación</Label>
              <Input
                id="contact-address"
                value={form.contactAddress ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, contactAddress: e.target.value }))}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 p-6">
          <h2 className="font-serif text-lg font-semibold text-ink-900">Firma institucional (certificados)</h2>
          <p className="text-sm text-ash-500">
            Quien firma por Inkapitales en los certificados (p. ej. el Gerente General) — se usa si la plantilla del
            certificado incluye los tags <code>{"{{institutionSignatureImage}}"}</code>, <code>{"{{institutionSignatureName}}"}</code>{" "}
            y/o <code>{"{{institutionSignatureTitle}}"}</code>. La firma de cada docente se administra en{" "}
            <a href="/admin/usuarios" className="underline">
              Usuarios y roles
            </a>
            .
          </p>
          <div className="flex items-center gap-6">
            <div className="flex h-16 w-32 items-center justify-center rounded-md border border-dashed border-paper-border bg-paper-muted">
              {form.institutionSignatureUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.institutionSignatureUrl} alt="Firma institucional" className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="text-xs text-ash-400">Sin firma</span>
              )}
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-700 hover:underline">
              <UploadCloud className="h-4 w-4" aria-hidden="true" />
              {uploading ? "Subiendo…" : "Subir imagen de firma"}
              <input
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                disabled={uploading}
                onChange={(e) => e.target.files?.[0] && handleInstitutionSignatureUpload(e.target.files[0])}
              />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="institution-signature-name">Nombre de quien firma</Label>
              <Input
                id="institution-signature-name"
                value={form.institutionSignatureName ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, institutionSignatureName: e.target.value }))}
                placeholder="Juan Pérez López"
              />
            </div>
            <div>
              <Label htmlFor="institution-signature-title">Cargo</Label>
              <Input
                id="institution-signature-title"
                value={form.institutionSignatureTitle ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, institutionSignatureTitle: e.target.value }))}
                placeholder="Gerente General"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 p-6">
          <h2 className="font-serif text-lg font-semibold text-ink-900">Información en las tarjetas de curso</h2>
          <p className="text-sm text-ash-500">Aplica a todo el catálogo público, no a un curso en particular.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["showTeacher", "Docente"],
                ["showDuration", "Duración"],
                ["showNextLiveSession", "Próxima fecha en vivo"],
                ["showCertificationBadge", "Insignia de certificación"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm text-ink-700">
                <input
                  type="checkbox"
                  checked={form.courseCardFields[key]}
                  onChange={(e) => setForm((f) => ({ ...f, courseCardFields: { ...f.courseCardFields, [key]: e.target.checked } }))}
                />
                {label}
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 p-6">
          <h2 className="font-serif text-lg font-semibold text-ink-900">Sello de agua</h2>
          <p className="text-sm text-ash-500">
            Un logo semitransparente sobre todas las pantallas del sitio (marca de agua). Sin logo configurado, no se
            muestra nada.
          </p>
          <div className="flex items-center gap-6">
            <div className="flex h-20 w-40 items-center justify-center rounded-md border border-dashed border-paper-border bg-paper-muted">
              {form.watermarkUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={form.watermarkUrl}
                  alt="Vista previa del sello de agua"
                  style={{ opacity: (form.watermarkOpacityPct ?? 15) / 100 }}
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <span className="text-xs text-ash-400">Sin sello de agua</span>
              )}
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-700 hover:underline">
              <UploadCloud className="h-4 w-4" aria-hidden="true" />
              {uploading ? "Subiendo…" : "Subir logo"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploading}
                onChange={(e) => e.target.files?.[0] && handleWatermarkUpload(e.target.files[0])}
              />
            </label>
            {form.watermarkUrl && (
              <button
                type="button"
                className="text-xs text-danger hover:underline"
                onClick={() => setForm((f) => ({ ...f, watermarkAssetId: null, watermarkUrl: null }))}
              >
                Quitar
              </button>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="watermark-opacity">Transparencia: {form.watermarkOpacityPct ?? 15}%</Label>
              <input
                id="watermark-opacity"
                type="range"
                min={0}
                max={100}
                value={form.watermarkOpacityPct ?? 15}
                onChange={(e) => setForm((f) => ({ ...f, watermarkOpacityPct: Number(e.target.value) }))}
                className="w-full"
              />
            </div>
            <div>
              <Label htmlFor="watermark-size">Tamaño: {form.watermarkSizePercent ?? 30}% del ancho de pantalla</Label>
              <input
                id="watermark-size"
                type="range"
                min={5}
                max={100}
                value={form.watermarkSizePercent ?? 30}
                onChange={(e) => setForm((f) => ({ ...f, watermarkSizePercent: Number(e.target.value) }))}
                className="w-full"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 p-6">
          <h2 className="font-serif text-lg font-semibold text-ink-900">Menú lateral</h2>
          <p className="text-sm text-ash-500">Color de la barra lateral y tipografía de los menús (admin/campus/docente/empresa).</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="sidebar-color">Color de la barra lateral</Label>
              <div className="flex items-center gap-2">
                <input
                  id="sidebar-color"
                  type="color"
                  value={form.sidebarColor || "#1c1917"}
                  onChange={(e) => setForm((f) => ({ ...f, sidebarColor: e.target.value }))}
                  className="h-11 w-14 rounded border border-paper-border"
                />
                <Input
                  value={form.sidebarColor || ""}
                  placeholder="Por defecto (bg-ink-900)"
                  onChange={(e) => setForm((f) => ({ ...f, sidebarColor: e.target.value || null }))}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="menu-font-color">Color del texto del menú</Label>
              <div className="flex items-center gap-2">
                <input
                  id="menu-font-color"
                  type="color"
                  value={form.menuFontColor || "#ffffff"}
                  onChange={(e) => setForm((f) => ({ ...f, menuFontColor: e.target.value }))}
                  className="h-11 w-14 rounded border border-paper-border"
                />
                <Input
                  value={form.menuFontColor || ""}
                  placeholder="Por defecto"
                  onChange={(e) => setForm((f) => ({ ...f, menuFontColor: e.target.value || null }))}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="menu-font-family">Tipografía del menú</Label>
              <Select
                id="menu-font-family"
                value={form.menuFontFamily ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, menuFontFamily: e.target.value || null }))}
              >
                <option value="">Por defecto</option>
                {BRAND_FONT_OPTIONS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="menu-font-size">Tamaño del texto: {form.menuFontSizePx ?? 14}px</Label>
              <input
                id="menu-font-size"
                type="range"
                min={10}
                max={24}
                value={form.menuFontSizePx ?? 14}
                onChange={(e) => setForm((f) => ({ ...f, menuFontSizePx: Number(e.target.value) }))}
                className="w-full"
              />
            </div>
          </div>
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
