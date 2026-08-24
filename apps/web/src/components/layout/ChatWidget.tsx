"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bot, Send, X } from "lucide-react";
import { chatbotApi, ApiError } from "@/lib/api-client";
import { useAuth } from "@/components/providers/AuthProvider";

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * Widget flotante del asistente de IA (Google Gemini) — antes no existía
 * ningún chatbot en la plataforma. Se muestra solo si el admin lo activó en
 * /admin/asistente-ia y configuró una API key (GET /chatbot/status).
 */
export function ChatWidget() {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatbotApi
      .status()
      .then((s) => setEnabled(s.enabled))
      .catch(() => setEnabled(false));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  if (!enabled) return null;

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    setError(null);
    setSending(true);
    setInput("");
    const nextMessages: ChatTurn[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    try {
      const { reply } = await chatbotApi.sendMessage(text, messages);
      setMessages([...nextMessages, { role: "assistant", content: reply }]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos contactar al asistente.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed bottom-24 right-5 z-40 print:hidden">
      {open && (
        <div
          role="dialog"
          aria-label="Asistente de IA"
          className="absolute bottom-16 right-0 flex h-[28rem] w-80 flex-col overflow-hidden rounded-lg border border-paper-border bg-paper shadow-raised animate-slide-up"
        >
          <div className="flex items-center justify-between border-b border-paper-border bg-paper-muted px-4 py-3">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-ink-700" aria-hidden="true" />
              <p className="font-serif text-sm font-semibold text-ink-900">Asistente Inkademy</p>
            </div>
            <button aria-label="Cerrar" onClick={() => setOpen(false)} className="text-ash-500 hover:text-ash-800">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 text-sm">
            {messages.length === 0 && (
              <p className="text-ash-500">Hola 👋 Soy el asistente de Inkademy. Pregúntame sobre cursos, matrículas, certificados o pagos.</p>
            )}
            <div className="flex flex-col gap-2">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`max-w-[85%] rounded-lg px-3 py-2 ${
                    m.role === "user" ? "self-end bg-ink-800 text-paper" : "self-start bg-paper-muted text-ink-800"
                  }`}
                >
                  {m.content}
                </div>
              ))}
              {sending && <div className="self-start rounded-lg bg-paper-muted px-3 py-2 text-ash-500">Escribiendo…</div>}
            </div>
            <div ref={bottomRef} />
          </div>

          {error && <p className="border-t border-paper-border px-3 py-1.5 text-xs text-danger">{error}</p>}

          {user ? (
            <form onSubmit={handleSend} className="flex items-center gap-2 border-t border-paper-border p-2">
              <input
                className="flex-1 rounded-md border border-paper-border bg-paper px-2 py-1.5 text-sm"
                placeholder="Escribe tu pregunta…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={sending}
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                aria-label="Enviar"
                className="flex h-8 w-8 flex-none items-center justify-center rounded-md bg-ink-800 text-paper disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          ) : (
            <p className="border-t border-paper-border p-3 text-xs text-ash-500">
              <Link href="/login" className="underline">
                Inicia sesión
              </Link>{" "}
              para chatear con el asistente.
            </p>
          )}
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Abrir asistente de IA"
        className="flex h-12 w-12 items-center justify-center rounded-full bg-ink-800 text-paper shadow-raised transition-transform hover:scale-105"
      >
        <Bot className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  );
}
