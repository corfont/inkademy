"use client";

import { useState } from "react";
import { adminApi, ApiError } from "@/lib/api-client";
import { Dialog } from "@/components/ui/Dialog";
import { Input, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";

interface EditableUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  documentType?: string | null;
  documentNumber?: string | null;
  country?: string | null;
  city?: string | null;
  address?: string | null;
  jobTitle?: string | null;
  companyFreeText?: string | null;
}

/**
 * "El admin debe poder editar a cualquier usuario" — antes /admin/usuarios
 * solo permitía cambiar rol, estado, firma y restablecer contraseña; para
 * corregir un nombre o correo mal escrito, o completar un dato de perfil a
 * nombre del usuario (p.ej. por soporte telefónico), no había ninguna
 * pantalla. Reutiliza el mismo endpoint PATCH /admin/users/:id, ahora con
 * más campos aceptados (ver updateUserSchema).
 */
export function EditUserModal({ user, open, onClose, onSaved }: { user: EditableUser; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName);
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [documentType, setDocumentType] = useState(user.documentType ?? "");
  const [documentNumber, setDocumentNumber] = useState(user.documentNumber ?? "");
  const [country, setCountry] = useState(user.country ?? "");
  const [city, setCity] = useState(user.city ?? "");
  const [address, setAddress] = useState(user.address ?? "");
  const [jobTitle, setJobTitle] = useState(user.jobTitle ?? "");
  const [companyFreeText, setCompanyFreeText] = useState(user.companyFreeText ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setBusy(true);
    setError(null);
    try {
      await adminApi.updateUser(user.id, {
        firstName,
        lastName,
        email,
        phone: phone || null,
        documentType: documentType || null,
        documentNumber: documentNumber || null,
        country: country || null,
        city: city || null,
        address: address || null,
        jobTitle: jobTitle || null,
        companyFreeText: companyFreeText || null,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos guardar los cambios.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={`Editar a ${user.firstName} ${user.lastName}`} className="max-w-2xl">
      <div className="flex flex-col gap-4">
        {error && <Callout variant="danger">{error}</Callout>}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="eu-first">Nombres</Label>
            <Input id="eu-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="eu-last">Apellidos</Label>
            <Input id="eu-last" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="eu-email">Correo</Label>
            <Input id="eu-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="eu-phone">Teléfono</Label>
            <Input id="eu-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="eu-doctype">Tipo de documento</Label>
            <Input id="eu-doctype" value={documentType} onChange={(e) => setDocumentType(e.target.value)} placeholder="DNI, CE, RUC…" />
          </div>
          <div>
            <Label htmlFor="eu-docnum">N° de documento</Label>
            <Input id="eu-docnum" value={documentNumber} onChange={(e) => setDocumentNumber(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="eu-country">País</Label>
            <Input id="eu-country" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="PE" />
          </div>
          <div>
            <Label htmlFor="eu-city">Ciudad</Label>
            <Input id="eu-city" value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="eu-address">Dirección</Label>
            <Input id="eu-address" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="eu-job">Cargo</Label>
            <Input id="eu-job" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="eu-companyfree">Empresa (texto libre)</Label>
            <Input id="eu-companyfree" value={companyFreeText} onChange={(e) => setCompanyFreeText(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-paper-border pt-4">
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={busy || !firstName.trim() || !lastName.trim() || !email.trim()} onClick={handleSave}>
            {busy ? "Guardando…" : "Guardar cambios"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
