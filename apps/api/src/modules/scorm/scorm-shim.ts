/**
 * Página "envoltorio" que expone la API SCORM (window.API para 1.2,
 * window.API_1484_11 para 2004) que el paquete descubre subiendo por la
 * cadena de `window.parent` — por eso el iframe del contenido va DENTRO de
 * esta misma página (su padre directo), nunca al revés. Se implementan
 * ambas versiones de la API siempre (sin importar cuál detectamos al subir
 * el paquete): algunos paquetes prueban las dos antes de rendirse.
 *
 * El modelo CMI vive en memoria del lado del navegador — el único dato que
 * de verdad viaja al backend es el estado final (completo/aprobado + nota),
 * enviado en Commit/Terminate/al cerrar la pestaña (con sendBeacon como
 * respaldo). No se intenta persistir el modelo CMI completo — "reproducir
 * SCORM" (fase 1) no incluye reanudar un intento a medias en la próxima
 * sesión, que sería la extensión natural de una fase 2.
 */
export function buildScormPlayerHtml(params: { contentUrl: string; progressUrl: string; title: string }): string {
  const { contentUrl, progressUrl, title } = params;
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  html, body { margin: 0; padding: 0; height: 100%; background: #14141c; }
  iframe { display: block; width: 100%; height: 100%; border: 0; }
</style>
</head>
<body>
<iframe src="${escapeHtml(contentUrl)}" allow="autoplay" title="${escapeHtml(title)}"></iframe>
<script>
(function () {
  "use strict";
  var PROGRESS_URL = ${JSON.stringify(progressUrl)};
  var cmi = {
    "cmi.core.student_id": "student",
    "cmi.core.student_name": "Alumno",
    "cmi.core.lesson_status": "not attempted",
    "cmi.core.score.raw": "",
    "cmi.core.entry": "ab-initio",
    "cmi.completion_status": "unknown",
    "cmi.success_status": "unknown",
    "cmi.score.raw": "",
    "cmi.entry": "ab-initio"
  };
  var reported = false;

  function reportProgress() {
    var status = cmi["cmi.core.lesson_status"] || cmi["cmi.completion_status"] || "unknown";
    var success = cmi["cmi.success_status"];
    // SCORM 1.2 combina completitud+éxito en un solo lesson_status
    // ("passed"/"completed"/"failed"/"incomplete"/"browsed"/"not attempted");
    // 2004 los separa en dos campos. Se normaliza a un único estado para
    // guardar, priorizando una señal de éxito explícita si existe.
    var completionStatus = status;
    if (success === "passed") completionStatus = "passed";
    else if (success === "failed") completionStatus = "failed";
    var scoreRaw = cmi["cmi.core.score.raw"] || cmi["cmi.score.raw"] || "";
    var body = JSON.stringify({ completionStatus: completionStatus, scoreRaw: scoreRaw === "" ? null : Number(scoreRaw) });
    reported = true;
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(PROGRESS_URL, new Blob([body], { type: "application/json" }));
        return;
      }
    } catch (e) {}
    fetch(PROGRESS_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: body, keepalive: true }).catch(function () {});
  }

  function makeApi() {
    return {
      LMSInitialize: function () { return "true"; },
      LMSFinish: function () { reportProgress(); return "true"; },
      LMSGetValue: function (key) { return cmi[key] !== undefined ? String(cmi[key]) : ""; },
      LMSSetValue: function (key, value) { cmi[key] = value; return "true"; },
      LMSCommit: function () { reportProgress(); return "true"; },
      LMSGetLastError: function () { return "0"; },
      LMSGetErrorString: function () { return "No error"; },
      LMSGetDiagnostic: function () { return "No error"; },
      Initialize: function () { return "true"; },
      Terminate: function () { reportProgress(); return "true"; },
      GetValue: function (key) { return cmi[key] !== undefined ? String(cmi[key]) : ""; },
      SetValue: function (key, value) { cmi[key] = value; return "true"; },
      Commit: function () { reportProgress(); return "true"; },
      GetLastError: function () { return "0"; },
      GetErrorString: function () { return "No error"; },
      GetDiagnostic: function () { return "No error"; }
    };
  }

  var api = makeApi();
  // SCORM 1.2 y 2004 buscan objetos con nombre distinto — se exponen los dos.
  window.API = api;
  window.API_1484_11 = api;

  window.addEventListener("beforeunload", function () {
    if (!reported) reportProgress();
  });
})();
</script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}
