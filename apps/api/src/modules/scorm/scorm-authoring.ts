/**
 * "Me gustaría poder crear un paquete SCORM en este sistema" — editor de
 * autoría v1: diapositivas de contenido/pregunta armadas en Inkademy,
 * exportadas como un paquete SCORM 1.2 REAL (imsmanifest.xml + un
 * index.html autocontenido) — el mismo tipo de artefacto que produciría
 * subir un .zip hecho en Articulate/iSpring. Se sube al mismo
 * `scormPackagePrefix` que ya usa ScormService.ingestPackage, así que el
 * reproductor del alumno (ScormPlayer/scorm-shim.ts) no necesita saber ni
 * enterarse de que este paquete se generó en vez de subirse.
 *
 * Alcance v1 (deliberado, no es un motor de autoría completo tipo
 * Articulate 360): secuencia LINEAL de diapositivas (Siguiente/Atrás), sin
 * ramificación condicional. Al llegar a la última diapositiva se califica
 * (aciertos/total de las preguntas) contra una nota mínima configurable y
 * se reporta a la API SCORM estándar — el mismo mecanismo que usaría
 * cualquier paquete de un tercero.
 */

export interface ScormContentSlide {
  id: string;
  type: "content";
  title: string;
  body: string;
  imageUrl?: string | null;
}
export interface ScormQuestionSlide {
  id: string;
  type: "question";
  question: string;
  options: string[];
  correctIndex: number;
  explanation?: string | null;
}
export type ScormSlide = ScormContentSlide | ScormQuestionSlide;
export interface ScormAuthoredContent {
  slides: ScormSlide[];
  passingScore: number;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

// Serializa a JSON para insertarlo dentro de un <script> — escapar TODOS los
// "<" como \u003c (no solo "</script") es la única forma de que ningún
// valor de texto (título/pregunta/opción escritos por el admin) pueda
// cerrar la etiqueta <script> a la mitad y romper el HTML generado.
function safeJsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/**
 * Manifest mínimo SCORM 1.2 — una organización, un item, un resource
 * apuntando a index.html. Misma forma que ya sabe leer
 * ScormService.parseManifest (organizations/organization/item/
 * identifierref, resources/resource/@href) por si este mismo paquete se
 * re-ingresa alguna vez por el camino de subida normal.
 */
export function buildScormManifestXml(lessonId: string, title: string): string {
  const safeTitle = escapeHtml(title);
  return `<?xml version="1.0" standalone="no" ?>
<manifest identifier="INKADEMY-${escapeHtml(lessonId)}" version="1"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="ORG-1">
    <organization identifier="ORG-1">
      <title>${safeTitle}</title>
      <item identifier="ITEM-1" identifierref="RES-1">
        <title>${safeTitle}</title>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="RES-1" type="webcontent" adlcp:scormtype="sco" href="index.html">
      <file href="index.html"/>
    </resource>
  </resources>
</manifest>
`;
}

/**
 * El contenido reproducible en sí — un solo HTML autocontenido (sin
 * dependencias externas, para que el .zip exportado funcione en cualquier
 * LMS sin conexión a Inkademy) que renderiza la secuencia de diapositivas y
 * llama a la API SCORM estándar (window.API para 1.2, window.API_1484_11
 * para 2004 — se exponen las llamadas de ambas versiones, igual que
 * scorm-shim.ts, porque no todos los LMS anfitriones son 1.2 puro) buscada
 * subiendo por window.parent — el mismo patrón findAPI() que usa cualquier
 * paquete SCORM real de terceros.
 */
export function buildScormContentHtml(content: ScormAuthoredContent, title: string): string {
  const dataJson = safeJsonForScript(content);
  const safeTitle = escapeHtml(title);
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${safeTitle}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; min-height: 100%; background: #f7f5f0; font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #23262b; }
  .wrap { max-width: 720px; margin: 0 auto; padding: 32px 20px 96px; }
  .bar { position: fixed; top: 0; left: 0; right: 0; height: 4px; background: #e5e1d8; }
  .bar-fill { height: 100%; background: linear-gradient(90deg, #23262b, #d8b26c); transition: width .3s; }
  h1 { font-size: 1.4rem; margin: 0 0 12px; }
  p { line-height: 1.6; white-space: pre-wrap; }
  img.slide-image { max-width: 100%; border-radius: 8px; margin-top: 12px; }
  .card { background: #fff; border: 1px solid #e5e1d8; border-radius: 10px; padding: 24px; box-shadow: 0 1px 8px rgba(0,0,0,.05); }
  .options { display: flex; flex-direction: column; gap: 8px; margin-top: 16px; }
  .option { display: flex; align-items: center; gap: 10px; border: 1px solid #e5e1d8; border-radius: 8px; padding: 10px 14px; cursor: pointer; }
  .option.correct { border-color: #2e7d4f; background: #eaf6ee; }
  .option.wrong { border-color: #b3261e; background: #fbeceb; }
  .option input { accent-color: #23262b; }
  .feedback { margin-top: 14px; font-size: .9rem; }
  .feedback.ok { color: #2e7d4f; }
  .feedback.bad { color: #b3261e; }
  .nav { display: flex; justify-content: space-between; margin-top: 28px; }
  button { font: inherit; border: none; border-radius: 8px; padding: 10px 20px; cursor: pointer; }
  button.primary { background: #23262b; color: #fff; }
  button.primary:disabled { opacity: .4; cursor: not-allowed; }
  button.ghost { background: transparent; color: #23262b; text-decoration: underline; }
  .result-score { font-size: 2.4rem; font-weight: 700; margin: 8px 0; }
  .result-score.pass { color: #2e7d4f; }
  .result-score.fail { color: #b3261e; }
</style>
</head>
<body>
<div class="bar"><div class="bar-fill" id="bar-fill" style="width:0%"></div></div>
<div class="wrap"><div class="card" id="app">Cargando…</div></div>
<script>
(function () {
  "use strict";
  var DATA = ${dataJson};
  var slides = DATA.slides;
  var passingScore = DATA.passingScore;
  var current = 0;
  var answers = {}; // slideId -> selected option index
  var revealed = {}; // slideId -> bool (ya se verificó esa pregunta)
  var finished = false;

  // findAPI: el mismo patrón que usa cualquier paquete SCORM real — el
  // shim que expone la API vive en un ancestro de este documento (nunca en
  // el propio iframe de contenido), así que se sube por window.parent
  // hasta encontrarlo o agotar el límite.
  function findAPI(win) {
    var attempts = 0;
    while ((!win.API && !win.API_1484_11) && win.parent && win.parent !== win && attempts < 500) {
      attempts++;
      win = win.parent;
    }
    return win.API_1484_11 || win.API || null;
  }
  var api = findAPI(window);
  var is2004 = !!(api && window.API_1484_11 === api);
  function apiCall(name1484, name12, args) {
    if (!api) return null;
    var fn = api[is2004 ? name1484 : name12];
    return fn ? fn.apply(api, args || []) : null;
  }
  apiCall("Initialize", "LMSInitialize", [""]);

  function totalQuestions() {
    return slides.filter(function (s) { return s.type === "question"; }).length;
  }
  function correctCount() {
    var n = 0;
    slides.forEach(function (s) {
      if (s.type === "question" && answers[s.id] === s.correctIndex) n++;
    });
    return n;
  }

  function renderContent(s) {
    var img = s.imageUrl ? '<img class="slide-image" src="' + s.imageUrl.replace(/"/g, "&quot;") + '" alt="" />' : "";
    return '<h1>' + escapeHtml(s.title) + '</h1><p>' + escapeHtml(s.body) + '</p>' + img;
  }

  function renderQuestion(s) {
    var isRevealed = !!revealed[s.id];
    var selected = answers[s.id];
    var optsHtml = s.options.map(function (opt, idx) {
      var cls = "option";
      if (isRevealed) {
        if (idx === s.correctIndex) cls += " correct";
        else if (idx === selected) cls += " wrong";
      }
      var checked = selected === idx ? "checked" : "";
      var disabled = isRevealed ? "disabled" : "";
      return '<label class="' + cls + '"><input type="radio" name="q-' + s.id + '" value="' + idx + '" ' + checked + ' ' + disabled + ' onchange="window.__onAnswer(\\'' + s.id + '\\',' + idx + ')" />' + escapeHtml(opt) + '</label>';
    }).join("");
    var feedback = "";
    if (isRevealed) {
      var ok = selected === s.correctIndex;
      feedback = '<p class="feedback ' + (ok ? "ok" : "bad") + '">' + (ok ? "✓ Correcto." : "✗ Incorrecto.") + (s.explanation ? " " + escapeHtml(s.explanation) : "") + '</p>';
    }
    var verifyBtn = !isRevealed ? '<div class="nav"><span></span><button class="primary" ' + (selected === undefined ? "disabled" : "") + ' onclick="window.__verify(\\'' + s.id + '\\')">Verificar</button></div>' : "";
    return '<h1>' + escapeHtml(s.question) + '</h1><div class="options">' + optsHtml + '</div>' + feedback + verifyBtn;
  }

  function renderResult() {
    var total = totalQuestions();
    var correct = correctCount();
    var score = total > 0 ? Math.round((correct / total) * 100) : 100;
    var passed = score >= passingScore;
    return '<h1>Resultado</h1><p class="result-score ' + (passed ? "pass" : "fail") + '">' + score + '%</p>' +
      '<p>' + (total > 0 ? correct + ' de ' + total + ' respuestas correctas. ' : "") + (passed ? "Aprobado." : "No alcanzaste la nota mínima (" + passingScore + "%).") + '</p>';
  }

  function canAdvance() {
    var s = slides[current];
    if (!s) return true;
    if (s.type === "question") return !!revealed[s.id];
    return true;
  }

  function render() {
    var app = document.getElementById("app");
    var barFill = document.getElementById("bar-fill");
    barFill.style.width = Math.round(((finished ? slides.length : current) / slides.length) * 100) + "%";

    if (finished) {
      app.innerHTML = renderResult();
      reportFinal();
      return;
    }

    var s = slides[current];
    var body = s.type === "content" ? renderContent(s) : renderQuestion(s);
    var isLast = current === slides.length - 1;
    var navHtml = s.type === "content"
      ? '<div class="nav">' +
          (current > 0 ? '<button class="ghost" onclick="window.__prev()">Atrás</button>' : '<span></span>') +
          '<button class="primary" onclick="window.__next()">' + (isLast ? "Finalizar" : "Siguiente") + '</button>' +
        '</div>'
      : (revealed[s.id]
          ? '<div class="nav">' +
              (current > 0 ? '<button class="ghost" onclick="window.__prev()">Atrás</button>' : '<span></span>') +
              '<button class="primary" onclick="window.__next()">' + (isLast ? "Finalizar" : "Siguiente") + '</button>' +
            '</div>'
          : "");
    app.innerHTML = body + navHtml;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }

  window.__onAnswer = function (slideId, idx) { answers[slideId] = idx; render(); };
  window.__verify = function (slideId) { revealed[slideId] = true; render(); };
  window.__next = function () {
    if (!canAdvance()) return;
    if (current === slides.length - 1) { finished = true; }
    else { current++; }
    render();
  };
  window.__prev = function () { if (current > 0) { current--; render(); } };

  var finalReported = false;
  function reportFinal() {
    if (finalReported) return;
    finalReported = true;
    var total = totalQuestions();
    var correct = correctCount();
    var score = total > 0 ? Math.round((correct / total) * 100) : 100;
    var passed = score >= passingScore;
    if (is2004) {
      apiCall("SetValue", null, ["cmi.completion_status", "completed"]);
      apiCall("SetValue", null, ["cmi.success_status", passed ? "passed" : "failed"]);
      apiCall("SetValue", null, ["cmi.score.raw", String(score)]);
    } else {
      apiCall(null, "LMSSetValue", ["cmi.core.lesson_status", passed ? "passed" : "failed"]);
      apiCall(null, "LMSSetValue", ["cmi.core.score.raw", String(score)]);
    }
    apiCall("Commit", "LMSCommit", [""]);
    apiCall("Terminate", "LMSFinish", [""]);
  }

  window.addEventListener("beforeunload", function () {
    if (finished) reportFinal();
  });

  render();
})();
</script>
</body>
</html>`;
}
