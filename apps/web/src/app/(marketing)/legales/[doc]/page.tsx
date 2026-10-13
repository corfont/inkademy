import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { settingsApi } from "@/lib/api-client";
import { getTranslations } from "next-intl/server";

const VALID_DOCS = ["privacidad", "terminos", "cookies"] as const;
type LegalDoc = (typeof VALID_DOCS)[number];

export function generateStaticParams() {
  return VALID_DOCS.map((doc) => ({ doc }));
}

export async function generateMetadata({ params }: { params: { doc: string } }): Promise<Metadata> {
  const TITLES: Record<string, string> = { privacidad: "Política de privacidad", terminos: "Términos y condiciones", cookies: "Política de cookies" };
  return { title: TITLES[params.doc] ?? "Legal" };
}

const CONTENT: Record<LegalDoc, string[]> = {
  privacidad: [
    "Inkademy recopila los datos estrictamente necesarios para prestar el servicio de capacitación: identidad, contacto, progreso académico y datos de facturación.",
    "Los datos de perfil (documento, cargo, sector) se solicitan de forma progresiva y se usan para personalizar recomendaciones y emitir certificados a nombre correcto del titular.",
    "No compartimos datos personales con terceros salvo proveedores de pago, videoconferencia (Microsoft Teams) y almacenamiento, bajo acuerdos de confidencialidad.",
  ],
  terminos: [
    "El acceso a los cursos está sujeto al pago correspondiente o a la asignación de un cupo por parte de tu empresa.",
    "La certificación se emite únicamente cuando se cumplen las reglas de aprobación definidas para cada curso (avance, asistencia y/o nota mínima).",
    "El acceso a los contenidos grabados sigue la política de vigencia indicada en cada curso (30 días, 6 meses o permanente).",
    "Inkademy se reserva el derecho de suspender cuentas que incurran en uso indebido de los materiales o suplantación de identidad en evaluaciones.",
  ],
  cookies: [
    "Usamos cookies estrictamente necesarias para mantener tu sesión iniciada y recordar tu idioma preferido.",
    "No utilizamos cookies de publicidad de terceros.",
    "Puedes eliminar las cookies desde la configuración de tu navegador; esto cerrará tu sesión activa.",
  ],
};

export default async function LegalPage({ params }: { params: { doc: string } }) {
  const t = await getTranslations("legal");
  const doc = params.doc as LegalDoc;
  if (!VALID_DOCS.includes(doc)) notFound();
  // El correo sale de la configuración de la plataforma (Admin → Apariencia), no de un valor fijo en el código.
  const contactEmail = doc === "privacidad" ? (await settingsApi.get().catch(() => null))?.contactEmail : null;

  return (
    <div className="container max-w-2xl py-14">
      <h1 className="font-serif text-3xl font-semibold text-ink-900">{t(doc)}</h1>
      <p className="mt-2 text-sm text-ash-500">{t("lastUpdated", { date: "20/08/2026" })}</p>
      <div className="prose mt-8 flex flex-col gap-4 text-ash-700">
        {CONTENT[doc].map((paragraph, idx) => (
          <p key={idx}>{paragraph}</p>
        ))}
        {doc === "privacidad" && (
          <>
            <p>
              Tienes derecho a conocer, rectificar, cancelar (eliminar) y oponerte al uso de tus datos personales (derechos ARCO, Ley 29733). Inicia sesión y entra a{" "}
              <Link href="/privacidad" className="font-medium underline">Privacidad y mis datos</Link>: ahí puedes descargar una copia de tus datos al instante y enviar tus solicitudes.
              {contactEmail ? ` También puedes escribirnos a ${contactEmail}.` : ""}
            </p>
            <p>
              Por obligación legal conservamos los comprobantes de pago y los certificados ya emitidos aunque pidas eliminar tus datos; el resto se elimina o se anonimiza.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
