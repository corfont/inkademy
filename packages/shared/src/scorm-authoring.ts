/**
 * Editor de autoría SCORM v2 — "que no le falte nada comparado con
 * Articulate/iSpring": el catálogo de 7 tipos de pregunta/interacción
 * estándar de esas herramientas (Verdadero/Falso, Opción única, Opción
 * múltiple, Completar espacio, Emparejar por arrastre, Ordenar por
 * arrastre, Punto caliente), dos de ellos con arrastre real. Fuera de
 * alcance a propósito: ramificación condicional, timeline de animación,
 * grabación de simulaciones — son productos/paradigmas distintos, no "más
 * tipos de diapositiva".
 *
 * Vive en @inkademy/shared (no solo en apps/api) para que la MISMA función
 * sirva tanto para generar el paquete real (apps/api/ScormService) como
 * para la vista previa en vivo del editor (apps/web/ScormBuilder, vía un
 * <iframe srcDoc>) — cero duplicación de la lógica de render/calificación.
 */

export interface ContentSlide {
  id: string;
  type: "content";
  title: string;
  body: string;
  imageUrl?: string | null;
}
export interface TrueFalseSlide {
  id: string;
  type: "true_false";
  question: string;
  correctAnswer: boolean;
  explanation?: string | null;
  sectionId?: string | null;
}
export interface SingleChoiceSlide {
  id: string;
  type: "single_choice";
  question: string;
  options: string[];
  correctIndex: number;
  explanation?: string | null;
  sectionId?: string | null;
}
export interface MultipleChoiceSlide {
  id: string;
  type: "multiple_choice";
  question: string;
  options: string[];
  correctIndexes: number[];
  explanation?: string | null;
  sectionId?: string | null;
}
export interface FillBlankSlide {
  id: string;
  type: "fill_blank";
  // Contiene "___" (tres guiones bajos) por cada espacio a completar.
  text: string;
  // Una entrada por cada "___" en `text`, cada una con sus respuestas aceptadas.
  blanks: string[][];
  explanation?: string | null;
  sectionId?: string | null;
}
export interface MatchingSlide {
  id: string;
  type: "matching";
  instructions?: string | null;
  pairs: { left: string; right: string }[];
  explanation?: string | null;
  sectionId?: string | null;
}
export interface OrderingSlide {
  id: string;
  type: "ordering";
  instructions?: string | null;
  // En el ORDEN CORRECTO — se muestra desordenado en tiempo de reproducción.
  items: string[];
  explanation?: string | null;
  sectionId?: string | null;
}
export interface HotspotZone {
  x: number; // % desde la izquierda
  y: number; // % desde arriba
  width: number; // % del ancho de la imagen
  height: number; // % del alto de la imagen
}
export interface HotspotSlide {
  id: string;
  type: "hotspot";
  question: string;
  imageUrl: string;
  zones: HotspotZone[];
  explanation?: string | null;
  sectionId?: string | null;
}
export type ScormSlide =
  | ContentSlide
  | TrueFalseSlide
  | SingleChoiceSlide
  | MultipleChoiceSlide
  | FillBlankSlide
  | MatchingSlide
  | OrderingSlide
  | HotspotSlide;

// "Varios exámenes con pesos distintos dentro de un mismo SCORM" — el
// estándar SCORM solo reporta UN puntaje final al LMS (cmi.core.score.raw),
// así que la ponderación entre "sub-exámenes" tiene que resolverse ACÁ
// DENTRO, antes de reportar. Cada Sección agrupa preguntas y define su
// peso; el puntaje final = promedio ponderado de las secciones. Opcional:
// si `sections` viene vacío/ausente (todo paquete generado antes de esto),
// el cálculo es exactamente el de siempre (aciertos/total sin ponderar) —
// cero riesgo para contenido ya existente.
export interface ScormSection {
  id: string;
  title: string;
  weightPercent: number;
}
export interface ScormAuthoredContent {
  slides: ScormSlide[];
  passingScore: number;
  sections?: ScormSection[];
}

export const SCORM_SLIDE_TYPE_LABEL: Record<ScormSlide["type"], string> = {
  content: "Contenido",
  true_false: "Verdadero/Falso",
  single_choice: "Opción única",
  multiple_choice: "Opción múltiple",
  fill_blank: "Completar espacio",
  matching: "Emparejar (arrastre)",
  ordering: "Ordenar (arrastre)",
  hotspot: "Punto caliente",
};

/**
 * La analítica (cmi.interactions.n.type) usa el vocabulario ESTÁNDAR de SCORM, no los 8 tipos
 * internos de arriba — por eso "single_choice" y "multiple_choice" se reportan igual ("choice"),
 * como en cualquier LMS, y ese es el mismo type que llega a LessonProgress.scormInteractions.
 */
export const SCORM_INTERACTION_TYPE_LABEL: Record<string, string> = {
  "true-false": "Verdadero/Falso",
  choice: "Opción (única o múltiple)",
  "fill-in": "Completar espacio",
  matching: "Emparejar",
  sequencing: "Ordenar",
  performance: "Punto caliente",
  likert: "Escala",
  numeric: "Numérico",
  other: "Otro",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

// JSON dentro de un <script> — escapar TODOS los "<" como \u003c (no solo
// "</script") es la única forma de que ningún texto escrito por el admin
// pueda cerrar la etiqueta <script> a la mitad y romper el HTML generado.
function safeJsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/**
 * Manifest mínimo SCORM 1.2 — una organización, un item, un resource
 * apuntando a index.html. Misma forma que ScormService.parseManifest sabe
 * leer (organizations/organization/item/identifierref, resources/resource/
 * @href) por si este mismo paquete se re-ingresa alguna vez por la subida normal.
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
 * El contenido reproducible — un HTML autocontenido (sin dependencias
 * externas, para que el .zip exportado funcione en cualquier LMS sin
 * conexión a Inkademy) con: los 8 tipos de diapositiva, arrastre real
 * (puntero, no HTML5 DnD nativo — no funciona bien en táctil) para
 * Emparejar/Ordenar, reporte de CADA respuesta a cmi.interactions (no solo
 * el puntaje final), y reanudar por cmi.core.lesson_location/cmi.location.
 * Busca la API SCORM subiendo por window.parent — el mismo findAPI() que
 * usa cualquier paquete de terceros. Si no encuentra ninguna (p.ej. la
 * vista previa en vivo del editor, servida suelta en un iframe), sigue
 * funcionando igual: todo apiCall(...) es no-op seguro.
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
  .wrap { max-width: 760px; margin: 0 auto; padding: 32px 20px 96px; }
  .bar { position: fixed; top: 0; left: 0; right: 0; height: 4px; background: #e5e1d8; z-index: 50; }
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
  button.ghost { background: transparent; color: #23262b; text-decoration: underline; padding: 10px 4px; }
  .result-score { font-size: 2.4rem; font-weight: 700; margin: 8px 0; }
  .result-score.pass { color: #2e7d4f; }
  .result-score.fail { color: #b3261e; }
  .section-breakdown { list-style: none; padding: 0; margin: 8px 0; font-size: .85rem; color: #55595f; }
  .section-breakdown li { padding: 2px 0; }
  .blank-input { border: none; border-bottom: 2px solid #23262b; font: inherit; padding: 2px 4px; width: 8em; text-align: center; }
  .blank-input.correct { border-color: #2e7d4f; color: #2e7d4f; }
  .blank-input.wrong { border-color: #b3261e; color: #b3261e; }
  .match-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  .match-left { flex: 1; border: 1px solid #e5e1d8; border-radius: 8px; padding: 8px 12px; }
  .match-slot { flex: 1; min-height: 42px; border: 2px dashed #cfc9ba; border-radius: 8px; padding: 6px 10px; display: flex; align-items: center; justify-content: space-between; gap: 6px; }
  .match-slot.filled { border-style: solid; background: #f2f0ea; }
  .match-slot.correct { border-color: #2e7d4f; background: #eaf6ee; }
  .match-slot.wrong { border-color: #b3261e; background: #fbeceb; }
  .match-pool { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; min-height: 48px; padding: 8px; border-radius: 8px; background: #f2f0ea; }
  .chip { background: #fff; border: 1px solid #cfc9ba; border-radius: 6px; padding: 8px 12px; cursor: grab; user-select: none; touch-action: none; }
  .chip.dragging { position: fixed; z-index: 100; box-shadow: 0 4px 16px rgba(0,0,0,.2); pointer-events: none; }
  .remove-x { cursor: pointer; color: #8a8578; font-weight: 700; padding: 0 4px; }
  .order-list { list-style: none; margin: 16px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .order-item { display: flex; align-items: center; gap: 10px; border: 1px solid #e5e1d8; border-radius: 8px; padding: 10px 12px; background: #fff; }
  .order-item.dragging { opacity: .4; }
  .drag-handle { cursor: grab; touch-action: none; color: #8a8578; }
  .hotspot-wrap { position: relative; display: inline-block; max-width: 100%; margin-top: 12px; }
  .hotspot-wrap img { max-width: 100%; border-radius: 8px; display: block; }
  .hotspot-marker { position: absolute; width: 18px; height: 18px; margin-left: -9px; margin-top: -9px; border-radius: 50%; background: #23262b; border: 2px solid #fff; box-shadow: 0 0 0 2px #23262b; }
  .hotspot-zone { position: absolute; border: 2px solid #2e7d4f; background: rgba(46,125,79,.15); border-radius: 4px; }
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
  var answers = {};
  var revealed = {};
  var finished = false;
  var interactionLog = {}; // slideId -> { id, type, response, correct }

  function findAPI(win) {
    var attempts = 0;
    while (attempts < 500) {
      var found;
      // La vista previa en vivo (admin) corre este mismo contenido en un
      // iframe sandbox="allow-scripts" SIN allow-same-origin a propósito
      // (origen nulo, aislado) — leer .API/.API_1484_11 en un window de
      // otro origen tira SecurityError, no undefined. Sin este try/catch,
      // la vista previa se quedaba trabada en "Cargando…" para siempre.
      try {
        found = win.API_1484_11 || win.API;
      } catch (e) {
        return null;
      }
      if (found) return found;
      if (!win.parent || win.parent === win) return null;
      win = win.parent;
      attempts++;
    }
    return null;
  }
  var api = findAPI(window);
  var is2004 = !!(api && window.API_1484_11 === api);
  function apiCall(name1484, name12, args) {
    if (!api) return null;
    var fn = api[is2004 ? name1484 : name12];
    return fn ? fn.apply(api, args || []) : null;
  }
  apiCall("Initialize", "LMSInitialize", [""]);

  // --- Reanudar: cmi.location (2004) / cmi.core.lesson_location (1.2) ---
  // La ubicación por sí sola solo mueve el cursor a la diapositiva correcta;
  // sin cmi.suspend_data (misma clave en 1.2 y 2004, pensada exactamente para
  // esto) las respuestas ya dadas se perderían en cada recarga y el alumno
  // "reanudaría" con sus preguntas previas calificadas como no respondidas.
  var locationKey = is2004 ? "cmi.location" : "cmi.core.lesson_location";
  var SUSPEND_DATA_KEY = "cmi.suspend_data";
  // Declarada acá (junto a locationKey) pero INVOCADA recién al final del
  // script, justo antes del render() inicial — necesita SCORM_INTERACTION_TYPE
  // y recordInteraction, definidos más abajo; con "var" solo el nombre de esas
  // funciones/objetos se adelanta (hoisting), no su asignación, así que llamar
  // esto antes de tiempo revienta con "Cannot read properties of undefined".
  function restoreState() {
    var saved = apiCall("GetValue", "LMSGetValue", [locationKey]);
    if (saved) {
      var idx = parseInt(saved, 10);
      if (!isNaN(idx) && idx >= 0 && idx < slides.length) current = idx;
    }
    var suspend = apiCall("GetValue", "LMSGetValue", [SUSPEND_DATA_KEY]);
    if (suspend) {
      try {
        var state = JSON.parse(suspend);
        answers = state.answers || {};
        revealed = state.revealed || {};
      } catch (e) {}
    }
    // El objeto cmi se reinicia en cada carga de página — sin re-emitir esto,
    // la analítica (cmi.interactions.n.*) perdería lo respondido antes de
    // cerrar/recargar aunque el puntaje final ya se calcule bien.
    slides.forEach(function (s) {
      if (isQuestionSlide(s) && revealed[s.id]) recordInteraction(s);
    });
  }
  function saveLocation() {
    apiCall("SetValue", "LMSSetValue", [locationKey, String(current)]);
    apiCall("SetValue", "LMSSetValue", [SUSPEND_DATA_KEY, JSON.stringify({ answers: answers, revealed: revealed })]);
    apiCall("Commit", "LMSCommit", [""]);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }
  function arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  function normalizeText(s) {
    return String(s).trim().toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g, "");
  }
  function shuffledIndexes(n) {
    var arr = [];
    for (var i = 0; i < n; i++) arr.push(i);
    for (var j = arr.length - 1; j > 0; j--) {
      var k = Math.floor(Math.random() * (j + 1));
      var tmp = arr[j]; arr[j] = arr[k]; arr[k] = tmp;
    }
    return arr;
  }

  function isQuestionSlide(s) {
    return s.type !== "content";
  }

  // ============ Calificación por tipo ============
  function isCorrect(s) {
    var a = answers[s.id];
    if (a === undefined) return false;
    switch (s.type) {
      case "true_false":
        return a === (s.correctAnswer ? 0 : 1);
      case "single_choice":
        return a === s.correctIndex;
      case "multiple_choice": {
        var sel = (a || []).slice().sort();
        var correct = s.correctIndexes.slice().sort();
        return arraysEqual(sel, correct);
      }
      case "fill_blank": {
        for (var i = 0; i < s.blanks.length; i++) {
          var given = normalizeText((a && a[i]) || "");
          var accepted = s.blanks[i].map(normalizeText);
          if (accepted.indexOf(given) === -1) return false;
        }
        return true;
      }
      case "matching": {
        for (var li = 0; li < s.pairs.length; li++) {
          if (!a || a[li] !== li) return false;
        }
        return true;
      }
      case "ordering":
        return arraysEqual(a, s.items.map(function (_, i) { return i; }));
      case "hotspot":
        if (!a) return false;
        return s.zones.some(function (z) {
          return a.x >= z.x && a.x <= z.x + z.width && a.y >= z.y && a.y <= z.y + z.height;
        });
      default:
        return false;
    }
  }

  function responseText(s) {
    var a = answers[s.id];
    switch (s.type) {
      case "true_false": return a === 0 ? "Verdadero" : "Falso";
      case "single_choice": return s.options[a] || "";
      case "multiple_choice": return (a || []).map(function (i) { return s.options[i]; }).join(" | ");
      case "fill_blank": return (a || []).join(" | ");
      case "matching": {
        // answers[s.id] es un OBJETO { leftIndex: rightIndex } (asignaciones
        // de arrastre), no un array — se recorre por índice de pares, no con .map.
        var pairsText = [];
        for (var pi = 0; pi < s.pairs.length; pi++) {
          var assignedRight = a ? a[pi] : undefined;
          pairsText.push(s.pairs[pi].left + "=" + (assignedRight != null ? s.pairs[assignedRight].right : "?"));
        }
        return pairsText.join(", ");
      }
      case "ordering": return (a || []).map(function (i) { return s.items[i]; }).join(" > ");
      case "hotspot": return a ? Math.round(a.x) + "%," + Math.round(a.y) + "%" : "";
      default: return "";
    }
  }

  // Tipos del vocabulario estándar SCORM para cmi.interactions.n.type —
  // "true-false" | "choice" | "fill-in" | "matching" | "performance" |
  // "sequencing" | "likert" | "numeric".
  var SCORM_INTERACTION_TYPE = {
    true_false: "true-false",
    single_choice: "choice",
    multiple_choice: "choice",
    fill_blank: "fill-in",
    matching: "matching",
    ordering: "sequencing",
    hotspot: "performance",
  };
  function recordInteraction(s) {
    interactionLog[s.id] = { id: s.id, type: s.type, response: responseText(s), correct: isCorrect(s) };
    var idx = Object.keys(interactionLog).length - 1;
    var prefix = "cmi.interactions." + idx + ".";
    apiCall("SetValue", "LMSSetValue", [prefix + "id", s.id]);
    apiCall("SetValue", "LMSSetValue", [prefix + "type", SCORM_INTERACTION_TYPE[s.type] || "other"]);
    apiCall("SetValue", "LMSSetValue", [prefix + "student_response", responseText(s)]);
    apiCall("SetValue", "LMSSetValue", [prefix + "result", isCorrect(s) ? "correct" : "wrong"]);
  }

  // ============ Render por tipo ============
  function renderContent(s) {
    var img = s.imageUrl ? '<img class="slide-image" src="' + escapeHtml(s.imageUrl) + '" alt="" />' : "";
    return '<h1>' + escapeHtml(s.title) + '</h1><p>' + escapeHtml(s.body) + '</p>' + img;
  }

  function renderOptionsQuestion(s, questionText, options, isMulti) {
    var isRevealed = !!revealed[s.id];
    var selected = answers[s.id];
    var selectedSet = isMulti ? (selected || []) : null;
    var correctSet = isMulti ? s.correctIndexes : null;
    var optsHtml = options.map(function (opt, idx) {
      var cls = "option";
      var isSel = isMulti ? selectedSet.indexOf(idx) !== -1 : selected === idx;
      if (isRevealed) {
        var isCorrectOpt = isMulti ? correctSet.indexOf(idx) !== -1 : idx === (s.correctIndex !== undefined ? s.correctIndex : (s.correctAnswer ? 0 : 1));
        if (isCorrectOpt) cls += " correct";
        else if (isSel) cls += " wrong";
      }
      var inputType = isMulti ? "checkbox" : "radio";
      var checked = isSel ? "checked" : "";
      var disabled = isRevealed ? "disabled" : "";
      var handler = isMulti
        ? "window.__toggleMulti('" + s.id + "'," + idx + ")"
        : "window.__onAnswer('" + s.id + "'," + idx + ")";
      return '<label class="' + cls + '"><input type="' + inputType + '" name="q-' + s.id + '" value="' + idx + '" ' + checked + ' ' + disabled + ' onchange="' + handler + '" />' + escapeHtml(opt) + '</label>';
    }).join("");
    return buildQuestionBlock(s, questionText, optsHtml, isRevealed, selected !== undefined && (!isMulti || selectedSet.length > 0));
  }

  function renderTrueFalse(s) {
    return renderOptionsQuestion(s, s.question, ["Verdadero", "Falso"], false);
  }
  function renderSingleChoice(s) {
    return renderOptionsQuestion(s, s.question, s.options, false);
  }
  function renderMultipleChoice(s) {
    return renderOptionsQuestion(s, s.question, s.options, true);
  }

  function renderFillBlank(s) {
    var isRevealed = !!revealed[s.id];
    var current_ = answers[s.id] || [];
    var blankIdx = 0;
    var parts = s.text.split("___");
    var html = parts.map(function (part, i) {
      var piece = escapeHtml(part);
      if (i === parts.length - 1) return piece;
      var bi = blankIdx++;
      var val = current_[bi] || "";
      var cls = "blank-input";
      if (isRevealed) {
        var accepted = s.blanks[bi].map(normalizeText);
        cls += accepted.indexOf(normalizeText(val)) !== -1 ? " correct" : " wrong";
      }
      var disabled = isRevealed ? "disabled" : "";
      return piece + '<input class="' + cls + '" type="text" value="' + escapeHtml(val) + '" ' + disabled + ' oninput="window.__onBlank(\\'' + s.id + '\\',' + bi + ',this.value)" />';
    }).join("");
    var allFilled = s.blanks.every(function (_, i) { return (current_[i] || "").trim().length > 0; });
    return buildQuestionBlock(s, null, '<p>' + html + '</p>', isRevealed, allFilled);
  }

  function renderMatching(s) {
    var isRevealed = !!revealed[s.id];
    var placements = answers[s.id] || {};
    var placedRight = {};
    Object.keys(placements).forEach(function (li) { placedRight[placements[li]] = true; });
    var rows = s.pairs.map(function (pair, li) {
      var ri = placements[li];
      var filled = ri !== undefined && ri !== null;
      var cls = "match-slot" + (filled ? " filled" : "");
      if (isRevealed && filled) cls += (ri === li ? " correct" : " wrong");
      var slotContent = filled
        ? escapeHtml(s.pairs[ri].right) + (isRevealed ? "" : ' <span class="remove-x" onclick="window.__unmatch(\\'' + s.id + '\\',' + li + ')">×</span>')
        : "";
      return '<div class="match-row"><div class="match-left">' + escapeHtml(pair.left) + '</div>' +
        '<div class="' + cls + '" data-drop-left="' + li + '">' + slotContent + '</div></div>';
    }).join("");
    var poolItems = s.pairs.map(function (pair, ri) { return { ri: ri, text: pair.right }; }).filter(function (item) { return !placedRight[item.ri]; });
    var pool = isRevealed ? "" : '<div class="match-pool" id="pool-' + s.id + '">' +
      poolItems.map(function (item) { return '<div class="chip" data-right-index="' + item.ri + '" data-slide="' + s.id + '">' + escapeHtml(item.text) + '</div>'; }).join("") +
      '</div>';
    var allPlaced = Object.keys(placements).length === s.pairs.length;
    return buildQuestionBlock(s, s.instructions || "Arrastra cada elemento de la derecha sobre su pareja.", rows + pool, isRevealed, allPlaced);
  }

  function renderOrdering(s) {
    var isRevealed = !!revealed[s.id];
    var arrangement = answers[s.id] || shuffledIndexes(s.items.length);
    answers[s.id] = arrangement;
    var items = arrangement.map(function (origIdx, pos) {
      var correctHere = origIdx === pos;
      var cls = "order-item" + (isRevealed ? (correctHere ? " correct" : " wrong") : "");
      var handle = isRevealed ? "" : '<span class="drag-handle" data-order-slide="' + s.id + '">☰</span>';
      return '<li class="' + cls + '" data-pos="' + pos + '">' + handle + '<span>' + escapeHtml(s.items[origIdx]) + '</span></li>';
    }).join("");
    return buildQuestionBlock(s, s.instructions || "Arrastra para poner los elementos en el orden correcto.", '<ul class="order-list" id="order-' + s.id + '">' + items + '</ul>', isRevealed, true);
  }

  function renderHotspot(s) {
    var isRevealed = !!revealed[s.id];
    var a = answers[s.id];
    var marker = a ? '<div class="hotspot-marker" style="left:' + a.x + '%;top:' + a.y + '%"></div>' : "";
    var zonesHtml = isRevealed ? s.zones.map(function (z) {
      return '<div class="hotspot-zone" style="left:' + z.x + '%;top:' + z.y + '%;width:' + z.width + '%;height:' + z.height + '%"></div>';
    }).join("") : "";
    var img = '<div class="hotspot-wrap" id="hotspot-' + s.id + '"><img src="' + escapeHtml(s.imageUrl) + '" alt="" draggable="false" />' + marker + zonesHtml + '</div>';
    return buildQuestionBlock(s, s.question, img, isRevealed, !!a);
  }

  function buildQuestionBlock(s, questionText, bodyHtml, isRevealed, canVerify) {
    var feedback = "";
    if (isRevealed) {
      var ok = isCorrect(s);
      feedback = '<p class="feedback ' + (ok ? "ok" : "bad") + '">' + (ok ? "✓ Correcto." : "✗ Incorrecto.") + (s.explanation ? " " + escapeHtml(s.explanation) : "") + '</p>';
    }
    var isLast = current === slides.length - 1;
    var nav = isRevealed
      ? '<div class="nav">' + (current > 0 ? '<button class="ghost" onclick="window.__prev()">Atrás</button>' : '<span></span>') +
        '<button class="primary" onclick="window.__next()">' + (isLast ? "Finalizar" : "Siguiente") + '</button></div>'
      : '<div class="nav"><span></span><button class="primary" ' + (canVerify ? "" : "disabled") + ' onclick="window.__verify(\\'' + s.id + '\\')">Verificar</button></div>';
    var q = questionText ? '<h1>' + escapeHtml(questionText) + '</h1>' : "";
    return q + bodyHtml + feedback + nav;
  }

  function totalQuestions() { return slides.filter(isQuestionSlide).length; }
  function correctCount() { return slides.filter(isQuestionSlide).filter(function (s) { return revealed[s.id] && isCorrect(s); }).length; }

  // "Varios exámenes con pesos distintos dentro de un mismo SCORM" — SCORM
  // solo reporta UN puntaje final al LMS, así que si el admin definió
  // Secciones (con peso), la ponderación se resuelve ACÁ antes de reportar:
  // puntaje = promedio ponderado de (aciertos/total de CADA sección). Sin
  // secciones (todo paquete generado antes de esto), es exactamente el
  // cálculo de siempre — aciertos/total sin ponderar.
  function sectionScores() {
    var sections = DATA.sections || [];
    return sections.map(function (sec) {
      var qs = slides.filter(function (s) { return isQuestionSlide(s) && s.sectionId === sec.id; });
      var correct = qs.filter(function (s) { return revealed[s.id] && isCorrect(s); }).length;
      return { id: sec.id, title: sec.title, weightPercent: sec.weightPercent, total: qs.length, correct: correct, score: qs.length > 0 ? Math.round((correct / qs.length) * 100) : 0 };
    });
  }
  function computeScore() {
    var sections = DATA.sections || [];
    if (sections.length > 0) {
      var secs = sectionScores();
      var totalWeight = 0, weightedSum = 0;
      secs.forEach(function (sec) { weightedSum += sec.score * sec.weightPercent; totalWeight += sec.weightPercent; });
      return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
    }
    var total = totalQuestions();
    var correct = correctCount();
    return total > 0 ? Math.round((correct / total) * 100) : 100;
  }

  function renderResult() {
    var score = computeScore();
    var total = totalQuestions();
    var correct = correctCount();
    var passed = score >= passingScore;
    var sections = DATA.sections || [];
    var breakdown = sections.length > 0
      ? '<ul class="section-breakdown">' + sectionScores().map(function (sec) {
          return '<li>' + escapeHtml(sec.title) + ': ' + sec.correct + '/' + sec.total + ' (' + sec.score + '%, peso ' + sec.weightPercent + '%)</li>';
        }).join("") + '</ul>'
      : "";
    return '<h1>Resultado</h1><p class="result-score ' + (passed ? "pass" : "fail") + '">' + score + '%</p>' +
      breakdown +
      '<p>' + (sections.length === 0 && total > 0 ? correct + ' de ' + total + ' respuestas correctas. ' : "") + (passed ? "Aprobado." : "No alcanzaste la nota mínima (" + passingScore + "%).") + '</p>';
  }

  function canAdvance() {
    var s = slides[current];
    if (!s) return true;
    if (isQuestionSlide(s)) return !!revealed[s.id];
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
    var body;
    switch (s.type) {
      case "content": body = renderContent(s); break;
      case "true_false": body = renderTrueFalse(s); break;
      case "single_choice": body = renderSingleChoice(s); break;
      case "multiple_choice": body = renderMultipleChoice(s); break;
      case "fill_blank": body = renderFillBlank(s); break;
      case "matching": body = renderMatching(s); break;
      case "ordering": body = renderOrdering(s); break;
      case "hotspot": body = renderHotspot(s); break;
      default: body = "";
    }
    if (s.type === "content") {
      var isLast = current === slides.length - 1;
      body += '<div class="nav">' + (current > 0 ? '<button class="ghost" onclick="window.__prev()">Atrás</button>' : '<span></span>') +
        '<button class="primary" onclick="window.__next()">' + (isLast ? "Finalizar" : "Siguiente") + '</button></div>';
    }
    app.innerHTML = body;
    wireInteractiveWidgets(s);
  }

  // ============ Handlers globales (llamados desde HTML inline) ============
  window.__onAnswer = function (slideId, idx) { answers[slideId] = idx; render(); };
  window.__toggleMulti = function (slideId, idx) {
    var arr = (answers[slideId] || []).slice();
    var pos = arr.indexOf(idx);
    if (pos === -1) arr.push(idx); else arr.splice(pos, 1);
    answers[slideId] = arr;
    render();
  };
  window.__onBlank = function (slideId, blankIdx, value) {
    var arr = (answers[slideId] || []).slice();
    arr[blankIdx] = value;
    answers[slideId] = arr;
    // Re-renderizar en cada tecla movería el foco — solo se actualiza el botón "Verificar" a mano.
    var allFilled = slides.find(function (sl) { return sl.id === slideId; }).blanks.every(function (_, i) { return (arr[i] || "").trim().length > 0; });
    var btn = document.querySelector('#app .nav .primary');
    if (btn) btn.disabled = !allFilled;
  };
  window.__unmatch = function (slideId, leftIndex) {
    var placements = Object.assign({}, answers[slideId] || {});
    delete placements[leftIndex];
    answers[slideId] = placements;
    render();
  };
  window.__verify = function (slideId) { revealed[slideId] = true; var s = slides.find(function (sl) { return sl.id === slideId; }); recordInteraction(s); render(); };
  window.__next = function () {
    if (!canAdvance()) return;
    saveLocation();
    if (current === slides.length - 1) { finished = true; }
    else { current++; }
    render();
  };
  window.__prev = function () { if (current > 0) { current--; saveLocation(); render(); } };

  // ============ Widgets con arrastre por puntero (matching/ordering/hotspot) ============
  function wireInteractiveWidgets(s) {
    if (s.type === "matching") wireMatching(s);
    else if (s.type === "ordering") wireOrdering(s);
    else if (s.type === "hotspot") wireHotspot(s);
  }

  function wireMatching(s) {
    if (revealed[s.id]) return;
    var chips = document.querySelectorAll('.chip[data-slide="' + s.id + '"]');
    chips.forEach(function (chip) {
      chip.addEventListener("pointerdown", function (e) {
        e.preventDefault();
        var rightIndex = parseInt(chip.getAttribute("data-right-index"), 10);
        var rect = chip.getBoundingClientRect();
        var offsetX = e.clientX - rect.left, offsetY = e.clientY - rect.top;
        var clone = chip.cloneNode(true);
        clone.classList.add("dragging");
        clone.style.width = rect.width + "px";
        document.body.appendChild(clone);
        function moveAt(clientX, clientY) {
          clone.style.left = (clientX - offsetX) + "px";
          clone.style.top = (clientY - offsetY) + "px";
        }
        moveAt(e.clientX, e.clientY);
        function onMove(ev) { moveAt(ev.clientX, ev.clientY); }
        function onUp(ev) {
          document.removeEventListener("pointermove", onMove);
          document.removeEventListener("pointerup", onUp);
          clone.style.display = "none";
          var target = document.elementFromPoint(ev.clientX, ev.clientY);
          clone.remove();
          var slot = target && target.closest ? target.closest("[data-drop-left]") : null;
          if (slot) {
            var leftIndex = parseInt(slot.getAttribute("data-drop-left"), 10);
            var placements = Object.assign({}, answers[s.id] || {});
            placements[leftIndex] = rightIndex;
            answers[s.id] = placements;
            render();
          }
        }
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
      });
    });
  }

  function wireOrdering(s) {
    if (revealed[s.id]) return;
    var list = document.getElementById("order-" + s.id);
    if (!list) return;
    var handles = list.querySelectorAll(".drag-handle");
    handles.forEach(function (handle) {
      handle.addEventListener("pointerdown", function (e) {
        e.preventDefault();
        var li = handle.closest("li");
        var items = Array.prototype.slice.call(list.children);
        var draggedPos = items.indexOf(li);
        li.classList.add("dragging");
        function onMove(ev) {
          var currentItems = Array.prototype.slice.call(list.children);
          for (var i = 0; i < currentItems.length; i++) {
            var rect = currentItems[i].getBoundingClientRect();
            var mid = rect.top + rect.height / 2;
            if (ev.clientY < mid) {
              if (currentItems[i] !== li) list.insertBefore(li, currentItems[i]);
              return;
            }
          }
          list.appendChild(li);
        }
        function onUp() {
          document.removeEventListener("pointermove", onMove);
          document.removeEventListener("pointerup", onUp);
          li.classList.remove("dragging");
          var newItems = Array.prototype.slice.call(list.children);
          var arrangement = answers[s.id].slice();
          var moved = arrangement[draggedPos];
          arrangement.splice(draggedPos, 1);
          var newPos = newItems.indexOf(li);
          arrangement.splice(newPos, 0, moved);
          answers[s.id] = arrangement;
          render();
        }
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
      });
    });
  }

  function wireHotspot(s) {
    if (revealed[s.id]) return;
    var wrap = document.getElementById("hotspot-" + s.id);
    if (!wrap) return;
    var img = wrap.querySelector("img");
    img.addEventListener("click", function (e) {
      var rect = img.getBoundingClientRect();
      var x = ((e.clientX - rect.left) / rect.width) * 100;
      var y = ((e.clientY - rect.top) / rect.height) * 100;
      answers[s.id] = { x: x, y: y };
      render();
    });
  }

  var finalReported = false;
  function reportFinal() {
    if (finalReported) return;
    finalReported = true;
    var score = computeScore();
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
    saveLocation();
    if (finished) reportFinal();
  });

  restoreState();
  render();
})();
</script>
</body>
</html>`;
}
