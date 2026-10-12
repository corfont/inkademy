"use client";

/** Último recurso: falla del layout raíz. No puede usar componentes del sistema (ni siquiera hay estilos garantizados). */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="es">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem" }}>Algo salió mal</h1>
          <p style={{ maxWidth: "28rem", margin: "0.75rem auto" }}>
            No pudimos cargar Inkademy. Intenta de nuevo en unos segundos{error.digest ? ` (código ${error.digest})` : ""}.
          </p>
          <button onClick={reset} style={{ padding: "0.5rem 1rem", borderRadius: "0.375rem", border: "1px solid #888", background: "white", cursor: "pointer" }}>Reintentar</button>
        </div>
      </body>
    </html>
  );
}
