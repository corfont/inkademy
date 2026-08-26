import type { Metadata } from "next";
import { cookies } from "next/headers";
import { assessmentApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth";
import { AssessmentRunner, type AssessmentDefinition } from "@/components/campus/AssessmentRunner";
import { Callout } from "@/components/ui/Callout";

export const metadata: Metadata = { title: "Evaluación" };

function mockAssessment(id: string): AssessmentDefinition {
  return {
    id,
    title: { es: "Evaluación final", en: "Final assessment" },
    timeLimitMinutes: 15,
    questions: [
      {
        id: "q1",
        type: "SINGLE_CHOICE",
        text: { es: "¿Cuál es el primer paso recomendado al liderar un equipo remoto?" },
        options: [
          { id: "a", text: "Definir acuerdos de trabajo y canales de comunicación" },
          { id: "b", text: "Programar reuniones diarias obligatorias" },
          { id: "c", text: "Medir solo resultados finales" },
        ],
      },
      {
        id: "q2",
        type: "TRUE_FALSE",
        text: { es: "La confianza en equipos remotos se construye principalmente por la cantidad de horas conectado." },
      },
      {
        id: "q3",
        type: "MULTI_CHOICE",
        text: { es: "Selecciona las prácticas recomendadas para dar feedback a distancia." },
        options: [
          { id: "a", text: "Ser específico y oportuno" },
          { id: "b", text: "Evitar el feedback por escrito" },
          { id: "c", text: "Reconocer logros públicamente cuando sea apropiado" },
        ],
      },
      {
        id: "q4",
        type: "OPEN",
        text: { es: "Describe brevemente cómo aplicarías lo aprendido en tu equipo." },
      },
    ],
  };
}

export default async function AssessmentPage({ params }: { params: { enrollmentId: string; assessmentId: string } }) {
  const accessToken = cookies().get(ACCESS_TOKEN_COOKIE)?.value ?? null;
  const { data: assessment, live } = await withFallback(
    () => assessmentApi.get(params.assessmentId, accessToken),
    mockAssessment(params.assessmentId),
  );

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
