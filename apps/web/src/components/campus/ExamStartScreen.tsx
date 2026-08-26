"use client";

import { useLocale } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { ExamHeaderCard, type ExamHeaderInfo } from "./ExamHeaderCard";

/**
 * "Todo lo que necesite saber el alumno antes de rendir el examen" — antes
 * el intento se creaba solo con abrir la página (useEffect al montar el
 * runner), sin que el alumno viera duración/intentos/instrucciones primero.
 * Esta pantalla se muestra ANTES de montar el runner (ver AssessmentRunner):
 * el intento recién se crea al hacer clic en "Comenzar".
 */
export function ExamStartScreen({ exam, onStart }: { exam: ExamHeaderInfo; onStart: () => void }) {
  const locale = useLocale();
  const attemptsExhausted = exam.attemptsUsed != null && exam.maxAttempts != null && exam.attemptsUsed >= exam.maxAttempts;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <ExamHeaderCard
        exam={exam}
        locale={locale}
        footer={
          <div className="flex flex-col items-center gap-2 border-t border-paper-border pt-4">
            {attemptsExhausted ? (
              <Callout variant="warning">Ya usaste todos tus intentos disponibles para esta evaluación.</Callout>
            ) : (
              <>
                <p className="text-center text-xs text-ash-500">
                  Al hacer clic se inicia tu intento y comienza a correr el tiempo{exam.timeLimitMinutes ? " (si aplica un límite)" : ""}.
                </p>
                <Button size="lg" onClick={onStart}>
                  Comenzar examen
                </Button>
              </>
            )}
          </div>
        }
      />
    </div>
  );
}
