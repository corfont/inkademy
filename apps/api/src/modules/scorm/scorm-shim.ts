/**
 * Página "envoltorio" que expone la API SCORM (window.API para 1.2,
 * window.API_1484_11 para 2004) que el paquete descubre subiendo por la
 * cadena de `window.parent` — por eso el iframe del contenido va DENTRO de
 * esta misma página (su padre directo), nunca al revés. Se implementan
 * ambas versiones de la API siempre (sin importar cuál detectamos al subir
 * el paquete): algunos paquetes prueban las dos antes de rendirse.
 *
 * El modelo CMI vive en memoria del lado del navegador — el único dato que
 * de verdad viaja al backend es el estado final (completo/aprobado + nota +
 * ubicación para reanudar + el detalle de cmi.interactions.n.* que el
 * paquete haya reportado), enviado en Commit/Terminate/al cerrar la pestaña
 * (con sendBeacon como respaldo). No se persiste el modelo CMI completo,
 * solo estos campos — sigue siendo deliberadamente acotado, no un RTE SCORM
 * certificado completo.
 */
export function buildScormPlayerHtml(params: {
  contentUrl: string;
  progressUrl: string;
  title: string;
  // Reanudar: si esta lección ya tiene progreso guardado, se siembra acá
  // para que LMSGetValue/GetValue lo devuelva al paquete desde su primer
  // LMSInitialize — el contenido decide qué hacer con eso (nuestro propio
  // motor de autoría salta a esa diapositiva; un paquete de terceros hace
  // lo que su propio autor haya programado para "cmi.core.entry=resume").
  initialLocation?: string | null;
  initialEntry?: "ab-initio" | "resume";
  // cmi.suspend_data (misma clave en 1.2 y 2004) — el "bookmark" real del
  // intento (qué respondió el alumno en cada diapositiva ya vista), sembrado
  // igual que initialLocation para que LMSGetValue lo devuelva desde el
  // primer LMSInitialize.
  initialSuspendData?: string | null;
}): string {
  const { contentUrl, progressUrl, title, initialLocation, initialEntry, initialSuspendData } = params;
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
  var entry = ${JSON.stringify(initialEntry ?? "ab-initio")};
  var location_ = ${JSON.stringify(initialLocation ?? "")};
  var suspendData = ${JSON.stringify(initialSuspendData ?? "")};
  var cmi = {
    "cmi.core.student_id": "student",
    "cmi.core.student_name": "Alumno",
    "cmi.core.lesson_status": "not attempted",
    "cmi.core.score.raw": "",
    "cmi.core.entry": entry,
    "cmi.core.lesson_location": location_,
    "cmi.completion_status": "unknown",
    "cmi.success_status": "unknown",
    "cmi.score.raw": "",
    "cmi.entry": entry,
    "cmi.location": location_,
    "cmi.suspend_data": suspendData
  };
  var reported = false;

  // El contenido reporta cada interacción como cmi.interactions.N.id/type/
  // student_response/result (vocabulario estándar SCORM) — se reconstruyen
  // acá recorriendo las claves ya guardadas en cmi, en vez de inventar una
  // clave propia no estándar (así un paquete de un tercero que también
  // reporte cmi.interactions se beneficia igual, no es exclusivo del editor
  // de autoría de Inkademy).
  function collectInteractions() {
    var byIndex = {};
    Object.keys(cmi).forEach(function (key) {
      var m = /^cmi\\.interactions\\.(\\d+)\\.(id|type|student_response|result)$/.exec(key);
      if (!m) return;
      var idx = m[1], field = m[2];
      byIndex[idx] = byIndex[idx] || {};
      byIndex[idx][field] = cmi[key];
    });
    return Object.keys(byIndex)
      .sort(function (a, b) { return Number(a) - Number(b); })
      .map(function (idx) {
        var it = byIndex[idx];
        return { id: it.id, type: it.type, response: it.student_response, correct: it.result === "correct" };
      });
  }

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
    var lessonLocation = cmi["cmi.core.lesson_location"] || cmi["cmi.location"] || "";
    var suspendData = cmi["cmi.suspend_data"] || "";
    var body = JSON.stringify({
      completionStatus: completionStatus,
      scoreRaw: scoreRaw === "" ? null : Number(scoreRaw),
      lessonLocation: lessonLocation || null,
      suspendData: suspendData || null,
      interactions: collectInteractions(),
    });
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
