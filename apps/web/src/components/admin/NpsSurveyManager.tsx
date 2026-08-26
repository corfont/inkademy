"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send, MessageCircle, Star, Eye } from "lucide-react";
import { npsAdminApi, ApiError, type NpsCompanyRow, type NpsResultsDTO } from "@/lib/api-client";
import { Textarea, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { Card, CardContent } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { formatDate } from "@/lib/format";

function StarRow({ score }: { score: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${score} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`h-3.5 w-3.5 ${n <= score ? "fill-warning text-warning" : "fill-none text-ash-300"}`} aria-hidden="true" />
      ))}
    </span>
  );
}

/**
 * "Módulo de encuestas tipo NPS con 1 pregunta... para B2B... la estructura
 * de la pregunta la establece el administrador... bastante visual, evitar
 * texto" (el lado visual real vive en la página pública /encuesta/[token];
 * acá, del lado admin, sí hace falta texto: es donde se configura y se lee
 * el detalle de cada respuesta).
 */
export function NpsSurveyManager({
  initialQuestion,
  initialCompanies,
  initialResults,
}: {
  initialQuestion: { question: Record<string, string>; active: boolean; updatedAt: string | null };
  initialCompanies: NpsCompanyRow[];
  initialResults: NpsResultsDTO;
}) {
  const router = useRouter();
  const [questionText, setQuestionText] = useState(initialQuestion.question.es ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  async function handlePreview() {
    setLoadingPreview(true);
    setError(null);
    try {
      const { html } = await npsAdminApi.emailPreview();
      setPreviewHtml(html);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos generar la vista previa.");
    } finally {
      setLoadingPreview(false);
    }
  }

  async function run(key: string, action: () => Promise<unknown>, successMessage?: string) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await action();
      if (successMessage) setNotice(successMessage);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Ocurrió un error.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {error && <Callout variant="danger">{error}</Callout>}
      {notice && <Callout variant="success">{notice}</Callout>}

      <Card>
        <CardContent className="flex flex-col gap-3 p-6">
          <h2 className="font-serif text-lg font-semibold text-ink-900">Pregunta de la encuesta</h2>
          <Label htmlFor="nps-question">Se envía tal cual — una sola pregunta, sin más texto alrededor.</Label>
          <Textarea id="nps-question" value={questionText} onChange={(e) => setQuestionText(e.target.value)} rows={2} />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={busy === "question" || !questionText.trim()}
              onClick={() => run("question", () => npsAdminApi.updateQuestion({ es: questionText }), "Pregunta actualizada.")}
            >
              Guardar pregunta
            </Button>
            {/* "La opción de previsualizar cómo será el correo" */}
            <Button size="sm" variant="outline" disabled={loadingPreview} onClick={handlePreview} className="gap-1.5">
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              {loadingPreview ? "Cargando…" : "Vista previa del correo"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={Boolean(previewHtml)} onClose={() => setPreviewHtml(null)} title="Vista previa del correo" className="max-w-2xl">
        {previewHtml && (
          <iframe title="Vista previa del correo NPS" srcDoc={previewHtml} sandbox="" className="h-[32rem] w-full rounded-md border border-paper-border" />
        )}
      </Dialog>

      {initialResults.totalResponses > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-4 p-6">
            <h2 className="font-serif text-lg font-semibold text-ink-900">Resultados</h2>
            <div className="flex items-center gap-6">
              <div className="text-center">
                <p className="font-serif text-4xl font-semibold text-ink-900">{initialResults.npsScore}</p>
                <p className="text-xs uppercase tracking-wide text-ash-500">Score NPS</p>
              </div>
              <div className="flex flex-1 gap-4 text-sm text-ash-600">
                <span>
                  <Badge variant="success">{initialResults.promoters}</Badge> Promotores
                </span>
                <span>
                  <Badge variant="warning">{initialResults.passives}</Badge> Pasivos
                </span>
                <span>
                  <Badge variant="danger">{initialResults.detractors}</Badge> Detractores
                </span>
              </div>
            </div>
            <div className="flex flex-col divide-y divide-paper-border">
              {initialResults.responses
                .filter((r) => r.comment)
                .map((r) => (
                  <div key={r.id} className="flex items-start gap-3 py-3">
                    <MessageCircle className="mt-0.5 h-4 w-4 flex-none text-ash-400" aria-hidden="true" />
                    <div>
                      <p className="text-sm text-ink-800">{r.comment}</p>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-ash-500">
                        {r.companyName} · {r.score != null && <StarRow score={r.score} />} · {r.respondedAt ? formatDate(r.respondedAt, "es") : ""}
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-6">
          <h2 className="mb-4 font-serif text-lg font-semibold text-ink-900">Empresas</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-paper-border text-xs uppercase tracking-wide text-ash-500">
                  <th className="pb-2 pr-4">Empresa</th>
                  <th className="pb-2 pr-4">Último envío</th>
                  <th className="pb-2 pr-4">Respondió</th>
                  <th className="pb-2 pr-4">Nota</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-paper-border">
                {initialCompanies.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2.5 pr-4 font-medium text-ink-900">{c.legalName}</td>
                    <td className="py-2.5 pr-4 text-ash-600">{c.lastSentAt ? formatDate(c.lastSentAt, "es") : "Nunca"}</td>
                    <td className="py-2.5 pr-4 text-ash-600">{c.lastRespondedAt ? formatDate(c.lastRespondedAt, "es") : "—"}</td>
                    <td className="py-2.5 pr-4">{c.lastScore !== null ? <StarRow score={c.lastScore} /> : "—"}</td>
                    <td className="py-2.5 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === c.id}
                        onClick={() =>
                          run(c.id, () => npsAdminApi.send(c.id), `Encuesta enviada al administrador de ${c.legalName}.`)
                        }
                        className="gap-1.5"
                      >
                        <Send className="h-3.5 w-3.5" aria-hidden="true" />
                        Enviar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
