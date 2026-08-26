"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { adminApi, commerceApi, ApiError } from "@/lib/api-client";
import { Input, Label, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card, CardContent } from "@/components/ui/Card";

export function GrantFreeAccessForm() {
  const router = useRouter();
  const [offeringKind, setOfferingKind] = useState<"COURSE" | "PROGRAM">("COURSE");
  const [slug, setSlug] = useState("");
  const [recipientKind, setRecipientKind] = useState<"PERSON" | "COMPANY">("PERSON");
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [userQuery, setUserQuery] = useState("");
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

  // Antes había que escribir el correo del usuario de memoria (fácil de
  // equivocarse, sin forma de saber si esa cuenta existe/está activa).
  // Ahora se busca por nombre/correo entre los usuarios activos y se elige
  // de una lista, igual que se hace con empresas.
  const [userResults, setUserResults] = useState<any[]>([]);
  const [userSearchOpen, setUserSearchOpen] = useState(false);
  const [userSearching, setUserSearching] = useState(false);

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

  useEffect(() => {
    if (recipientKind !== "PERSON" || selectedUser) return;
    const query = userQuery.trim();
    if (query.length < 2) {
      setUserResults([]);
      return;
    }
    setUserSearching(true);
    const handle = setTimeout(() => {
      adminApi
        .users({ q: query })
        .then((rows) => setUserResults(rows.filter((u: any) => u.status === "active")))
        .catch(() => setUserResults([]))
        .finally(() => setUserSearching(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [userQuery, recipientKind, selectedUser]);

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
        userEmail: recipientKind === "PERSON" ? selectedUser?.email : undefined,
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
      setSelectedUser(null);
      setUserQuery("");
      setCompanyId("");
      setNote("");
      // Para que la cortesía recién otorgada aparezca de una en el
      // historial de más abajo, sin tener que recargar la página a mano.
      router.refresh();
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
            <div className="relative">
              <Label htmlFor="userSearch">Usuario</Label>
              {selectedUser ? (
                <div className="flex items-center justify-between rounded-md border border-paper-border bg-paper-muted p-2 text-sm">
                  <div>
                    <p className="font-medium text-ink-900">
                      {selectedUser.displayName || `${selectedUser.firstName} ${selectedUser.lastName}`}
                    </p>
                    <p className="text-xs text-ash-500">{selectedUser.email}</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setSelectedUser(null);
                      setUserQuery("");
                    }}
                  >
                    Cambiar
                  </Button>
                </div>
              ) : (
                <>
                  <Input
                    id="userSearch"
                    placeholder="Busca por nombre o correo…"
                    value={userQuery}
                    onChange={(e) => {
                      setUserQuery(e.target.value);
                      setUserSearchOpen(true);
                    }}
                    onFocus={() => setUserSearchOpen(true)}
                    onBlur={() => setTimeout(() => setUserSearchOpen(false), 150)}
                    autoComplete="off"
                  />
                  {userSearchOpen && userQuery.trim().length >= 2 && (
                    <div className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border border-paper-border bg-paper shadow-lg">
                      {userSearching ? (
                        <p className="p-3 text-sm text-ash-500">Buscando…</p>
                      ) : userResults.length === 0 ? (
                        <p className="p-3 text-sm text-ash-500">No hay usuarios activos que coincidan.</p>
                      ) : (
                        userResults.map((u) => (
                          <button
                            key={u.id}
                            type="button"
                            className="flex w-full flex-col items-start gap-0.5 p-2 text-left text-sm hover:bg-paper-muted"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setSelectedUser(u);
                              setUserSearchOpen(false);
                            }}
                          >
                            <span className="font-medium text-ink-900">{u.displayName || `${u.firstName} ${u.lastName}`}</span>
                            <span className="text-xs text-ash-500">
                              {u.email} · {u.globalRole}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                  <p className="mt-1 text-xs text-ash-500">Escribe al menos 2 letras para buscar entre los usuarios activos.</p>
                </>
              )}
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

          <Button type="submit" disabled={busy || (recipientKind === "PERSON" && !selectedUser)}>
            {busy ? "Otorgando…" : "Otorgar acceso"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
