import type { Metadata } from "next";
import { assessmentApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { AssessmentRunner, type AssessmentDefinition } from "@/components/campus/AssessmentRunner";
import { Callout } from "@/components/ui/Callout";

export const metadata: Metadata = { title: "Evaluación" };

function mockAssessment(id: string): AssessmentDefinition {
  return {
    id,
    title: "Evaluación final",
    timeLimitMinutes: 15,
    questions: [
      {
        id: "q1",
        type: "SINGLE_CHOICE",
        text: "¿Cuál es el primer paso recomendado al liderar un equipo remoto?",
        options: [
          { id: "a", text: "Definir acuerdos de trabajo y canales de comunicación" },
          { id: "b", text: "Programar reuniones diarias obligatorias" },
          { id: "c", text: "Medir solo resultados finales" },
        ],
      },
      {
        id: "q2",
        type: "TRUE_FALSE",
        text: "La confianza en equipos remotos se construye principalmente por la cantidad de horas conectado.",
      },
      {
        id: "q3",
        type: "MULTI_CHOICE",
        text: "Selecciona las prácticas recomendadas para dar feedback a distancia.",
        options: [
          { id: "a", text: "Ser específico y oportuno" },
          { id: "b", text: "Evitar el feedback por escrito" },
          { id: "c", text: "Reconocer logros públicamente cuando sea apropiado" },
        ],
      },
      {
        id: "q4",
        type: "OPEN",
        text: "Describe brevemente cómo aplicarías lo aprendido en tu equipo.",
      },
    ],
  };
}

export default async function AssessmentPage({ params }: { params: { enrollmentId: string; assessmentId: string } }) {
  const { data: assessment, live } = await withFallback(() => assessmentApi.get(params.assessmentId), mockAssessment(params.assessmentId));

  return (
    <div>
      {!live && (
        <Callout variant="info" className="mx-auto mb-6 max-w-2xl">
          Mostrando una evaluación de referencia; no pudimos conectar con la API.
        </Callout>
      )}
      <AssessmentRunner assessment={assessment} />
    </div>
  );
}
