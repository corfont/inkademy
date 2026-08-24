"use client";

import { useEffect, useState } from "react";
import { adminApi, commerceApi, ApiError } from "@/lib/api-client";
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

  // Antes había que escribir el slug del curso/programa de memoria (el
  // backend recién avisaba con un error si no existía o no estaba
  // publicado). Ahora se elige de una lista ya filtrada a lo que
  // realmente se puede otorgar gratis: cursos/programas PUBLISHED.
  const [courses, setCourses] = useState<any[]>([]);
  const [programs, setPrograms] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);

  useEffect(() => {
    adminApi
      .courses()
      .then((rows) => setCourses(rows.filter((c: any) => c.status === "PUBLISHED")))
      .catch(() => setCourses([]));
    adminApi
      .programs()
      .then((rows) => setPrograms(rows.filter((p: any) => p.status === "PUBLISHED")))
      .catch(() => setPrograms([]));
    adminApi
      .companies()
      .then((rows) => setCompanies(rows))
      .catch(() => setCompanies([]));
  }, []);

  const offerings = offeringKind === "COURSE" ? courses : programs;

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
              <Select
                id="offeringKind"
                value={offeringKind}
                onChange={(e) => {
                  setOfferingKind(e.target.value as "COURSE" | "PROGRAM");
                  setSlug("");
                }}
              >
                <option value="COURSE">Curso</option>
                <option value="PROGRAM">Programa/diplomado</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="slug">{offeringKind === "COURSE" ? "Curso" : "Programa/diplomado"}</Label>
              <Select id="slug" required value={slug} onChange={(e) => setSlug(e.target.value)}>
                <option value="">Selecciona uno…</option>
                {offerings.map((o) => (
                  <option key={o.id} value={o.slug}>
                    {o.title?.es ?? o.slug}
                  </option>
                ))}
              </Select>
              {offerings.length === 0 && (
                <p className="mt-1 text-xs text-ash-500">
                  No hay {offeringKind === "COURSE" ? "cursos" : "programas"} publicados todavía.
                </p>
              )}
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
                <Label htmlFor="companyId">Empresa</Label>
                <Select id="companyId" required value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                  <option value="">Selecciona una empresa…</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.legalName} ({c.taxId})
                    </option>
                  ))}
                </Select>
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
