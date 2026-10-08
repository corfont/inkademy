"use client";

// Controles «mejorados» OPCIONALES para el video de la clase: el alumno elige entre los controles estándar del navegador y estos
// (retroceder/adelantar 10 s, velocidad, volumen, subtítulos, pantalla completa). Actúan sobre el MISMO <video>, así que el seguimiento
// de avance, las preguntas dentro del video y el bloqueo de adelantar siguen funcionando igual.
import { useEffect, useRef, useState, type RefObject } from "react";
import { Captions, Maximize2, Pause, Play, RotateCcw, RotateCw, Volume2, VolumeX } from "lucide-react";

export const PLAYER_MODE_KEY = "inkademy-player-mode";
const VELOCIDADES = [0.75, 1, 1.25, 1.5, 1.75, 2];

const fmt = (s: number) => {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const seg = Math.floor(s % 60);
  return `${m}:${String(seg).padStart(2, "0")}`;
};

export function EnhancedPlayerControls({ videoRef, wrapperRef, hasSubtitles }: { videoRef: RefObject<HTMLVideoElement | null>; wrapperRef: RefObject<HTMLDivElement | null>; hasSubtitles: boolean }) {
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [rate, setRate] = useState(1);
  const [captions, setCaptions] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    try {
      const guardada = Number(localStorage.getItem("inkademy-player-rate"));
      if (VELOCIDADES.includes(guardada)) {
        v.playbackRate = guardada;
        setRate(guardada);
      }
    } catch {}
    const sync = () => {
      setPlaying(!v.paused);
      setTime(v.currentTime);
      setDuration(v.duration);
      setMuted(v.muted);
      setVolume(v.volume);
    };
    sync();
    const eventos = ["play", "pause", "timeupdate", "durationchange", "loadedmetadata", "volumechange", "ended"] as const;
    eventos.forEach((e) => v.addEventListener(e, sync));
    return () => eventos.forEach((e) => v.removeEventListener(e, sync));
  }, [videoRef]);

  const v = () => videoRef.current;
  function saltar(delta: number) {
    const el = v();
    if (el) el.currentTime = Math.max(0, Math.min(el.duration || Infinity, el.currentTime + delta));
  }
  function cambiarVelocidad(r: number) {
    const el = v();
    if (el) el.playbackRate = r;
    setRate(r);
    try {
      localStorage.setItem("inkademy-player-rate", String(r));
    } catch {}
  }
  function alternarSubtitulos() {
    const el = v();
    if (!el) return;
    const next = !captions;
    for (const t of Array.from(el.textTracks)) t.mode = next ? "showing" : "hidden";
    setCaptions(next);
  }
  function pantallaCompleta() {
    const w = wrapperRef.current;
    if (!w) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void w.requestFullscreen?.();
  }

  const boton = "flex h-8 w-8 flex-none items-center justify-center rounded-md text-paper hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-paper";
  return (
    <div
      ref={barRef}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "k") {
          e.preventDefault();
          const el = v();
          if (el) void (el.paused ? el.play() : el.pause());
        } else if (e.key === "ArrowLeft" || e.key === "j") saltar(-10);
        else if (e.key === "ArrowRight" || e.key === "l") saltar(10);
        else if (e.key === "f") pantallaCompleta();
        else if (e.key === "m") {
          const el = v();
          if (el) el.muted = !el.muted;
        }
      }}
      className="flex flex-wrap items-center gap-2 bg-ink-900 px-3 py-2 text-paper"
      role="group"
      aria-label="Controles del video"
    >
      <button type="button" className={boton} aria-label={playing ? "Pausar" : "Reproducir"} onClick={() => { const el = v(); if (el) void (el.paused ? el.play() : el.pause()); }}>
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </button>
      <button type="button" className={boton} aria-label="Retroceder 10 segundos" onClick={() => saltar(-10)}><RotateCcw className="h-4 w-4" /></button>
      <button type="button" className={boton} aria-label="Adelantar 10 segundos" onClick={() => saltar(10)}><RotateCw className="h-4 w-4" /></button>
      <span className="w-24 flex-none text-xs tabular-nums">{fmt(time)} / {fmt(duration)}</span>
      <input
        type="range"
        aria-label="Posición del video"
        min={0}
        max={Number.isFinite(duration) && duration > 0 ? duration : 0}
        step={1}
        value={Math.min(time, Number.isFinite(duration) ? duration : 0)}
        onChange={(e) => { const el = v(); if (el) el.currentTime = Number(e.target.value); }}
        className="min-w-[8rem] flex-1"
      />
      <select value={rate} onChange={(e) => cambiarVelocidad(Number(e.target.value))} aria-label="Velocidad" className="rounded-md bg-ink-800 px-1.5 py-1 text-xs text-paper">
        {VELOCIDADES.map((r) => (
          <option key={r} value={r}>{r}×</option>
        ))}
      </select>
      <button type="button" className={boton} aria-label={muted ? "Activar sonido" : "Silenciar"} onClick={() => { const el = v(); if (el) el.muted = !el.muted; }}>
        {muted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </button>
      <input type="range" aria-label="Volumen" min={0} max={1} step={0.05} value={muted ? 0 : volume} onChange={(e) => { const el = v(); if (el) { el.volume = Number(e.target.value); el.muted = Number(e.target.value) === 0; } }} className="w-20 flex-none" />
      {hasSubtitles && (
        <button type="button" className={`${boton} ${captions ? "bg-white/25" : ""}`} aria-label="Subtítulos" aria-pressed={captions} onClick={alternarSubtitulos}><Captions className="h-4 w-4" /></button>
      )}
      <button type="button" className={boton} aria-label="Pantalla completa" onClick={pantallaCompleta}><Maximize2 className="h-4 w-4" /></button>
    </div>
  );
}
