"use client";

import { useState } from "react";
import { commerceApi, ApiError } from "@/lib/api-client";
import { Input, Label, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card, CardContent } from "@/components/ui/Card";

export function GrantFreeAccessForm() {
  const [offeringKind, setOfferingKind] = useState<"COURSE" | "PROGRAM">("COURSE");
  const [slug, setSlug] = useState("");
  const [recipientKind, setRecipientKind] = useState<"PERSON" | "COMPANY">("PERSON");
  const [userEmail, setUserEmail] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [seatPoolQty, setSeatPoolQty] = useState("1");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await commerceApi.grantFree({
        offeringKind,
        courseSlug: offeringKind === "COURSE" ? slug : undefined,
        programSlug: offeringKind === "PROGRAM" ? slug : undefined,
        userEmail: recipientKind === "PERSON" ? userEmail : undefined,
        companyId: recipientKind === "COMPANY" ? companyId : undefined,
        seatPoolQty: recipientKind === "COMPANY" ? Number(seatPoolQty) : undefined,
        note,
      });
      setSuccess(
        result.granted === "COMPANY_SEATS"
          ? `Listo: se agregaron ${seatPoolQty} cupo(s) gratuitos a la empresa.`
          : "Listo: se otorgó la matrícula gratuita y se avisó por correo.",
      );
      setSlug("");
      setUserEmail("");
      setCompanyId("");
      setNote("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos otorgar el acceso.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-6">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && <Callout variant="danger">{error}</Callout>}
          {success && <Callout variant="success">{success}</Callout>}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="offeringKind">Tipo de oferta</Label>
              <Select id="offeringKind" value={offeringKind} onChange={(e) => setOfferingKind(e.target.value as "COURSE" | "PROGRAM")}>
                <option value="COURSE">Curso</option>
                <option value="PROGRAM">Programa/diplomado</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="slug">{offeringKind === "COURSE" ? "Slug del curso" : "Slug del programa"}</Label>
              <Input id="slug" required value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="p. ej. liderazgo-remoto" />
            </div>
          </div>

          <div>
            <Label htmlFor="recipientKind">Otorgar a</Label>
            <Select id="recipientKind" value={recipientKind} onChange={(e) => setRecipientKind(e.target.value as "PERSON" | "COMPANY")}>
              <option value="PERSON">Una persona (por correo)</option>
              <option value="COMPANY">Una empresa (cupos gratuitos)</option>
            </Select>
          </div>

          {recipientKind === "PERSON" ? (
            <div>
              <Label htmlFor="userEmail">Correo del usuario</Label>
              <Input id="userEmail" type="email" required value={userEmail} onChange={(e) => setUserEmail(e.target.value)} />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="companyId">ID de la empresa</Label>
                <Input id="companyId" required value={companyId} onChange={(e) => setCompanyId(e.target.value)} placeholder="uuid" />
              </div>
              <div>
                <Label htmlFor="seatPoolQty">Cupos gratuitos</Label>
                <Input id="seatPoolQty" type="number" min="1" required value={seatPoolQty} onChange={(e) => setSeatPoolQty(e.target.value)} />
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="note">Motivo (queda registrado en el log de auditoría)</Label>
            <textarea
              id="note"
              required
              minLength={3}
              className="min-h-[4rem] w-full rounded-md border border-paper-border bg-paper p-2 text-sm"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="p. ej. campaña de lanzamiento con cliente estratégico"
            />
          </div>

          <Button type="submit" disabled={busy}>
            {busy ? "Otorgando…" : "Otorgar acceso"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
