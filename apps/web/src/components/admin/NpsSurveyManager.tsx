"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send, MessageCircle, Eye } from "lucide-react";
import { npsAdminApi, ApiError, type NpsCompanyRow, type NpsResultsDTO } from "@/lib/api-client";
import { Textarea, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card, CardContent } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { formatDate } from "@/lib/format";

// Mismo criterio de color que la franja 100% apilada de resultados: 9-10
// promotor (verde), 7-8 pasivo (ámbar), 0-6 detractor (rojo).
function ScoreBadge({ score }: { score: number }) {
  const cls = score >= 9 ? "bg-success-bg text-success" : score >= 7 ? "bg-warning-bg text-warning" : "bg-danger-bg text-danger";
  return <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${cls}`}>{score}</span>;
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
  initialQuestion: { question: Record<string, string>; commentPrompt: Record<string, string>; active: boolean; updatedAt: string | null };
  initialCompanies: NpsCompanyRow[];
  initialResults: NpsResultsDTO;
}) {
  const router = useRouter();
  const [questionText, setQuestionText] = useState(initialQuestion.question.es ?? "");
  const [commentPromptText, setCommentPromptText] = useState(initialQuestion.commentPrompt.es ?? "");
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
          <div>
            <Label htmlFor="nps-question">Pregunta principal (escala 0-10) — se envía tal cual, sin más texto alrededor.</Label>
            <Textarea id="nps-question" value={questionText} onChange={(e) => setQuestionText(e.target.value)} rows={2} />
          </div>
          <div>
            <Label htmlFor="nps-comment-prompt">Pregunta cualitativa (comentario abierto, debajo de la nota)</Label>
            <Textarea id="nps-comment-prompt" value={commentPromptText} onChange={(e) => setCommentPromptText(e.target.value)} rows={2} />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={busy === "question" || !questionText.trim() || !commentPromptText.trim()}
              onClick={() =>
                run(
                  "question",
                  () => npsAdminApi.updateQuestion({ question: { es: questionText }, commentPrompt: { es: commentPromptText } }),
                  "Preguntas actualizadas.",
                )
              }
            >
              Guardar preguntas
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
          <CardContent className="flex flex-col gap-6 p-6">
            <h2 className="font-serif text-lg font-semibold text-ink-900">Resultados</h2>
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
              <div className="flex flex-col items-center gap-1 sm:border-r sm:border-paper-border sm:pr-6">
                <p className={`font-serif text-4xl font-semibold ${(initialResults.npsScore ?? 0) >= 0 ? "text-success" : "text-danger"}`}>
                  {initialResults.npsScore}
                </p>
                <p className="text-xs uppercase tracking-wide text-ash-500">Score NPS</p>
                <p className="text-xs text-ash-500">{initialResults.totalResponses} respuesta{initialResults.totalResponses === 1 ? "" : "s"}</p>
              </div>
              <div className="flex-1">
                {/* Barra 100% apilada — el formato estándar para leer NPS de un
                    vistazo: qué proporción de las respuestas es promotor,
                    pasivo o detractor. */}
                <div className="flex h-3 w-full overflow-hidden rounded-full bg-paper-muted">
                  {initialResults.promoters > 0 && (
                    <div className="h-full bg-success" style={{ width: `${(initialResults.promoters / initialResults.totalResponses) * 100}%` }} />
                  )}
                  {initialResults.passives > 0 && (
                    <div className="h-full bg-warning" style={{ width: `${(initialResults.passives / initialResults.totalResponses) * 100}%` }} />
                  )}
                  {initialResults.detractors > 0 && (
                    <div className="h-full bg-danger" style={{ width: `${(initialResults.detractors / initialResults.totalResponses) * 100}%` }} />
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-4 text-sm text-ash-600">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-success" aria-hidden="true" /> {initialResults.promoters} Promotores (9-10)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-warning" aria-hidden="true" /> {initialResults.passives} Pasivos (7-8)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-danger" aria-hidden="true" /> {initialResults.detractors} Detractores (0-6)
                  </span>
                </div>
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
                        {r.companyName} · {r.score != null && <ScoreBadge score={r.score} />} · {r.respondedAt ? formatDate(r.respondedAt, "es") : ""}
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
                    <td className="py-2.5 pr-4">{c.lastScore !== null ? <ScoreBadge score={c.lastScore} /> : "—"}</td>
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
