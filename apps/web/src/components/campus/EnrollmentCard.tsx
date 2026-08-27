"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { RetakeCourseButton } from "@/components/campus/RetakeCourseButton";
import { localize, formatDate } from "@/lib/format";
import type { EnrollmentSummaryDTO } from "@inkademy/shared";

/**
 * Antes vivía inline en cursos/page.tsx (server component) — se extrae
 * para poder reusarla desde EnrollmentListFilterBar (cliente, para poder
 * buscar/ordenar). `t` ya no se recibe como prop: una función de traducción
 * de getTranslations() (server) no es serializable a través del límite
 * cliente/servidor — se usa useTranslations() (el hook de cliente) acá
 * mismo, igual que el resto de los componentes de cliente del proyecto.
 */
export function EnrollmentCard({
  enrollment,
  locale,
  attemptLabel,
}: {
  enrollment: EnrollmentSummaryDTO;
  locale: string;
  // "Por ejemplo he vuelto a hacer el curso... no debería seguir apareciendo
  // en ambas pestañas" — no era un bug de filtro (cada matrícula sale en UNA
  // sola pestaña, según su propio status), sino que dos tarjetas con el
  // MISMO título (la original ya Finalizada + la nueva de "volver a
  // llevar") no tenían ninguna forma de distinguirse entre sí. Cuando el
  // alumno tiene más de una matrícula al mismo curso, se marca cada
  // tarjeta con su intento y fecha.
  attemptLabel?: string | null;
}) {
  const t = useTranslations("campus.courses");
  // "Debes terminar antes de..." — antes accessExpiresAt viajaba en el DTO
  // pero nada en pantalla se lo mostraba al alumno; el vencimiento era
  // invisible hasta que, sin aviso, dejaba de poder entrar al curso.
  const isExpired = enrollment.status === "EXPIRED" || (enrollment.accessExpiresAt && new Date(enrollment.accessExpiresAt) < new Date());
  // "Que el alumno vea bonito cada curso... con su imagen y demás cosas...
  // obviamente el precio, el descuento eso ya no vale porque ya está
  // comprado" — la tarjeta era puro texto (nunca mostró precio, pero
  // tampoco tenía ninguna imagen); ahora usa la misma miniatura de portada
  // que el catálogo (con el mismo respaldo de gradiente+inicial si el
  // curso no tiene imagen), sin agregar nada de precio/descuento.
  return (
    <Card className="overflow-hidden">
      <CardContent className="flex flex-col gap-4 p-0 sm:flex-row sm:items-stretch">
        <Link href={`/campus/cursos/${enrollment.id}`} className="block flex-none sm:w-48">
          {enrollment.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={enrollment.coverImageUrl} alt="" className="h-32 w-full object-cover sm:h-full" />
          ) : (
            <div
              className="flex h-32 w-full items-center justify-center bg-gradient-to-br from-ink-700 to-ink-900 text-paper sm:h-full"
              role="img"
              aria-label={localize(enrollment.title, locale)}
            >
              <span className="font-serif text-3xl font-semibold opacity-70">{localize(enrollment.title, locale).charAt(0)}</span>
            </div>
          )}
        </Link>

        <div className="flex flex-1 flex-col gap-4 p-6 pl-0 sm:flex-row sm:items-start sm:justify-between sm:pl-6">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              {/* La referencia muestra el título como link de color — acá
                  ya toda la tarjeta es clicable por la imagen, pero el
                  título en sí quedaba como texto plano (solo el botón
                  "Ver curso" navegaba); se le agrega el mismo Link. */}
              <Link href={`/campus/cursos/${enrollment.id}`} className="font-serif text-lg font-semibold text-ink-900 hover:text-ink-700 hover:underline">
                {localize(enrollment.title, locale)}
              </Link>
              <Badge variant="outline">{enrollment.offeringKind === "PROGRAM" ? "Programa" : "Curso"}</Badge>
              {isExpired && <Badge variant="danger">Acceso vencido</Badge>}
            </div>
            {attemptLabel && <p className="mt-0.5 text-xs text-ash-500">{attemptLabel}</p>}
            {enrollment.accessExpiresAt && !isExpired && (
              <p className="mt-1 text-xs font-medium text-warning">Debes terminar antes del {formatDate(enrollment.accessExpiresAt, locale)}</p>
            )}
            {isExpired && (
              <p className="mt-1 text-xs text-danger">
                Tu acceso venció{enrollment.accessExpiresAt ? ` el ${formatDate(enrollment.accessExpiresAt, locale)}` : ""}. Escribe a soporte si
                necesitas una ampliación de plazo.
              </p>
            )}
            <ProgressBar value={enrollment.progressPct} label={t("progress", { pct: enrollment.progressPct })} className="mt-3 max-w-sm" />
            <p className="mt-1 text-sm text-ash-500">{t("progress", { pct: Math.round(enrollment.progressPct) })}</p>

            <div className="mt-3">
              {enrollment.approvalMissing.length > 0 ? (
                <>
                  <p className="text-sm font-medium text-ink-800">{t("missingTitle")}</p>
                  <ul className="mt-1 list-inside list-disc text-sm text-ash-600">
                    {enrollment.approvalMissing.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-sm text-success">{t("noMissing")}</p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:items-end">
            <Link href={`/campus/cursos/${enrollment.id}`}>
              <Button size="sm">{enrollment.nextActionLabel ?? "Ver curso"}</Button>
            </Link>
            {enrollment.certificateAvailable && (
              <Link href="/campus/certificados" className="text-sm text-ink-700 hover:underline">
                Ver certificado
              </Link>
            )}
            {enrollment.status === "COMPLETED" && enrollment.offeringKind === "COURSE" && (
              <RetakeCourseButton enrollmentId={enrollment.id} />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
