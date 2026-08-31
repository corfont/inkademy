import type { Metadata } from "next";
import { XCircle } from "lucide-react";
import { npsPublicApi } from "@/lib/api-client";
import { NpsResponseForm } from "@/components/marketing/NpsResponseForm";

export const metadata: Metadata = { title: "Encuesta de satisfacción" };

export default async function NpsSurveyPage({ params }: { params: { token: string } }) {
  const survey = await npsPublicApi.get(params.token).catch(() => null);

  return (
    <div className="w-full overflow-hidden rounded-xl border border-paper-border bg-paper shadow-raised">
      <div className="h-1.5 w-full bg-gradient-to-r from-ink-700 via-indigo-500 to-gold-500" aria-hidden="true" />
      <div className="p-8">
        {!survey ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center text-ash-500">
            <XCircle className="h-10 w-10" aria-hidden="true" />
            <p className="font-medium">Este enlace de encuesta no es válido.</p>
          </div>
        ) : survey.alreadyResponded ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <p className="font-serif text-xl font-semibold text-ink-900">Ya respondiste esta encuesta</p>
            <p className="text-sm text-ash-500">Gracias por tu tiempo.</p>
          </div>
        ) : (
          <NpsResponseForm
            token={params.token}
            question={survey.question.es ?? ""}
            commentPrompt={survey.commentPrompt?.es ?? "¿Por qué le pusiste esa nota? ¿Qué podríamos mejorar?"}
          />
        )}
      </div>
    </div>
  );
}
