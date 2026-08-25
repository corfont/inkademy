"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { adminApi, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { FileDropzone } from "./FileDropzone";

/**
 * Documentos que el asistente de IA usa como fuente de información (p.ej.
 * el manual/ayuda de la plataforma) — antes el chatbot no tenía ninguna
 * fuente propia y respondía siempre de forma genérica. Se sube un PDF con
 * texto real (no escaneado) o un .txt/.md; el texto se extrae una sola vez
 * al subirlo y se guarda — ver ChatbotDocumentsService.
 */
export function ChatbotDocumentsManager({ documents }: { documents: any[] }) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Antes solo se podía subir un documento a la vez (FileDropzone sin
  // `multiple`) — con una base de conocimiento real (varios manuales, FAQs,
  // políticas) había que repetir la subida uno por uno. Ahora se suben en
  // fila (secuencial, no en paralelo, para no saturar la extracción de
  // texto): `queueTail` encadena las subidas y `pendingCount` decide cuándo
  // ya se procesó todo el lote para recién ahí apagar "Subiendo…" y
  // refrescar la lista una sola vez.
  const queueTail = useRef<Promise<unknown>>(Promise.resolve());
  const pendingCount = useRef(0);

  function handleUpload(file: File) {
    if (pendingCount.current === 0) setError(null);
    pendingCount.current += 1;
    setUploading(true);
    queueTail.current = queueTail.current
      .then(() => adminApi.uploadChatbotDocument(file, undefined))
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : `No pudimos procesar "${file.name}".`);
      })
      .finally(() => {
        pendingCount.current -= 1;
        if (pendingCount.current === 0) {
          setUploading(false);
          router.refresh();
        }
      });
  }

  async function toggleActive(doc: any) {
    setBusyId(doc.id);
    try {
      await adminApi.updateChatbotDocument(doc.id, { active: !doc.active });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos actualizar el documento.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(doc: any) {
    if (!confirm(`¿Eliminar "${doc.title}" de la base de conocimiento del asistente?`)) return;
    setBusyId(doc.id);
    try {
      await adminApi.deleteChatbotDocument(doc.id);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos eliminar el documento.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <Callout variant="danger">{error}</Callout>}
      <p className="text-sm text-ash-500">
        Sube el manual de ayuda, preguntas frecuentes u otro documento — el asistente lo usará como fuente real al
        responder, en vez de dar respuestas genéricas. Solo se usan los documentos marcados como "Activo".
      </p>

      {documents.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-paper-border">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-paper-border text-ash-500">
              <tr>
                <th className="p-3 font-medium">Documento</th>
                <th className="p-3 font-medium">Tamaño extraído</th>
                <th className="p-3 font-medium">Estado</th>
                <th className="p-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-paper-border">
              {documents.map((doc) => (
                <tr key={doc.id}>
                  <td className="p-3 font-medium text-ink-900">{doc.title}</td>
                  <td className="p-3 text-ash-600">{Math.round(doc.charCount / 1000)}k caracteres</td>
                  <td className="p-3">
                    <Badge variant={doc.active ? "success" : "outline"}>{doc.active ? "Activo" : "Inactivo"}</Badge>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" disabled={busyId === doc.id} onClick={() => toggleActive(doc)}>
                        {doc.active ? "Desactivar" : "Activar"}
                      </Button>
                      <Button size="sm" variant="ghost" className="text-danger hover:bg-danger-bg" disabled={busyId === doc.id} onClick={() => handleDelete(doc)}>
                        Eliminar
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <FileDropzone
        accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
        busy={uploading}
        label="Subir documentos"
        hint="PDF con texto real, o .txt/.md — puedes elegir o soltar varios a la vez"
        onFile={handleUpload}
        multiple
      />
    </div>
  );
}
