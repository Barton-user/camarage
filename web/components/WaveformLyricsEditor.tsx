"use client";
/* ============================================================================
 * WaveformLyricsEditor — editor de letras sobre la forma de onda, estilo
 * SoundCloud. Cada línea de letra es un pin clavado en su tiempo exacto:
 * se escucha la pista, se ve dónde cae cada frase, y si está corrida se
 * arrastra el pin (o se ajusta ±0,1 s). El texto se edita inline.
 *
 * Convención de tiempos (la misma que el modo "marcar tiempos"):
 *   tiempo de contenido (start_time_seconds) = tiempo del audio + offset
 * Por eso los pins se dibujan en (start − offset) y al soltar se guarda
 * (posición + offset). Con offset 0 es 1:1.
 *
 * Guardado: al soltar el pin / salir del campo, vía callbacks del padre.
 * ========================================================================== */
import { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";

type Lyric = {
  id: string;
  text: string;
  start_time_seconds: number | string;
  order_index: number;
};

const BUCKET_SECONDS = 0.02;   // resolución del análisis de picos (20 ms)
const BAR_W = 2;               // ancho de cada barrita
const BAR_GAP = 1;             // espacio entre barritas
const WAVE_TOP = 96;           // alto de la mitad superior
const WAVE_BOT = 34;           // alto del reflejo
const WAVE_H = WAVE_TOP + 4 + WAVE_BOT;
const MAX_CANVAS_W = 28000;    // límite de ancho de canvas (memoria/navegador)
const COLOR_REST = "#8a8a8a";
const COLOR_PLAYED = "#22d3ee";

function fmtClock(t: number, withCents = false): string {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return withCents
    ? `${m}:${s.toFixed(2).padStart(5, "0")}`
    : `${m}:${String(Math.floor(s)).padStart(2, "0")}`;
}

export default function WaveformLyricsEditor({
  audioUrl,
  lyrics,
  offsetSeconds = 0,
  endSeconds = null,
  onChangeTime,
  onChangeText,
  onInsertAt,
  onRemove,
  onChangeEnd,
  onChangeTimeMany,
}: {
  audioUrl: string;
  lyrics: Lyric[];
  offsetSeconds?: number;
  /** Fin marcado de la canción, en segundos DEL ARCHIVO (audio_end_seconds). null = archivo entero. */
  endSeconds?: number | null;
  /** Guarda el nuevo start_time_seconds (tiempo de contenido, ya con offset). */
  onChangeTime: (lyricId: string, newStartSeconds: number) => void;
  onChangeText: (lyricId: string, text: string) => void;
  /** Inserta una línea nueva en ese tiempo de contenido. */
  onInsertAt: (startSeconds: number) => void;
  onRemove: (lyricId: string) => void;
  /** Guarda el fin marcado (segundos de archivo) o null para usar el archivo entero. */
  onChangeEnd?: (sec: number | null) => void;
  /** Guardado en lote (mover varias líneas juntas). Si falta, se llama onChangeTime por cada una. */
  onChangeTimeMany?: (changes: { id: string; sec: number }[]) => void;
}) {
  const offset = Number(offsetSeconds) || 0;

  // --- Audio + análisis ---
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  const [duration, setDuration] = useState(0);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [loadErr, setLoadErr] = useState<string | null>(null);

  // --- Vista ---
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const playedCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const clipRef = useRef<HTMLDivElement | null>(null);
  const playheadRef = useRef<HTMLDivElement | null>(null);
  const [containerW, setContainerW] = useState(800);
  const [zoomPps, setZoomPps] = useState<number | null>(null); // null = ajustar al ancho

  // --- Reproducción / selección / drag ---
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);              // coarse, para la UI (200 ms)
  const posRef = useRef(0);                        // fino, para el rAF
  const [rate, setRate] = useState(1);
  const [selIds, setSelIds] = useState<string[]>([]);          // selección múltiple
  const [primaryId, setPrimaryId] = useState<string | null>(null); // ancla para rangos
  const [dragMove, setDragMove] = useState<{ delta: number } | null>(null); // drag en bloque
  const dragMoveRef = useRef<number | null>(null);
  const [boxSel, setBoxSel] = useState<{ t0: number; t1: number } | null>(null); // recuadro
  const boxRef = useRef<{ t0: number; add: boolean } | null>(null);
  const [dragEnd, setDragEnd] = useState<number | null>(null);   // bandera FIN mientras se arrastra
  const dragEndRef = useRef<number | null>(null);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);

  const fitPps = duration > 0 ? Math.max(1, (containerW - 2) / duration) : 100;
  const maxPps = duration > 0 ? MAX_CANVAS_W / duration : 400;
  const pps = Math.min(zoomPps ?? fitPps, maxPps);
  const fullW = Math.max(containerW - 2, Math.min(MAX_CANVAS_W, Math.ceil(duration * pps)));

  /* ---------- crear el <audio> ---------- */
  useEffect(() => {
    const a = new Audio();
    a.src = audioUrl;
    a.preload = "auto";
    audioRef.current = a;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onPause);
    return () => {
      a.pause();
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("ended", onPause);
      a.src = "";
      audioRef.current = null;
    };
  }, [audioUrl]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = rate;
  }, [rate]);

  /* ---------- bajar + decodificar el audio → picos ---------- */
  useEffect(() => {
    let cancel = false;
    setLoadState("loading");
    setPeaks(null);
    (async () => {
      try {
        const resp = await fetch(audioUrl);
        if (!resp.ok) throw new Error(`No se pudo bajar el audio (HTTP ${resp.status})`);
        const buf = await resp.arrayBuffer();
        const AC: typeof AudioContext =
          (window as any).AudioContext || (window as any).webkitAudioContext;
        const ctx = new AC();
        const audioBuf = await ctx.decodeAudioData(buf);
        ctx.close().catch(() => {});
        if (cancel) return;

        const ch0 = audioBuf.getChannelData(0);
        const ch1 = audioBuf.numberOfChannels > 1 ? audioBuf.getChannelData(1) : null;
        const n = Math.max(1, Math.ceil(audioBuf.duration / BUCKET_SECONDS));
        const per = Math.max(1, Math.floor(ch0.length / n));
        const pk = new Float32Array(n);
        // Muestreo salteado (cada 4 samples): suficiente para picos visuales
        for (let i = 0; i < n; i++) {
          let m = 0;
          const end = Math.min(ch0.length, (i + 1) * per);
          for (let j = i * per; j < end; j += 4) {
            const v0 = Math.abs(ch0[j]);
            if (v0 > m) m = v0;
            if (ch1) { const v1 = Math.abs(ch1[j]); if (v1 > m) m = v1; }
          }
          pk[i] = m;
        }
        // Normalizar al pico global para que la onda llene el alto
        let g = 0;
        for (let i = 0; i < n; i++) if (pk[i] > g) g = pk[i];
        if (g > 0) for (let i = 0; i < n; i++) pk[i] = pk[i] / g;

        setDuration(audioBuf.duration);
        setPeaks(pk);
        setLoadState("ready");
      } catch (e: any) {
        if (!cancel) { setLoadErr(e?.message || String(e)); setLoadState("error"); }
      }
    })();
    return () => { cancel = true; };
  }, [audioUrl]);

  /* ---------- medir el contenedor ---------- */
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setContainerW(el.clientWidth || 800);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ---------- dibujar la onda (una vez por zoom) ---------- */
  useEffect(() => {
    if (!peaks || duration <= 0) return;
    const drawInto = (canvas: HTMLCanvasElement | null, color: string) => {
      if (!canvas) return;
      const dpr = fullW > 6000 ? 1 : Math.min(2, window.devicePixelRatio || 1);
      canvas.width = fullW * dpr;
      canvas.height = WAVE_H * dpr;
      canvas.style.width = fullW + "px";
      canvas.style.height = WAVE_H + "px";
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, fullW, WAVE_H);
      ctx.fillStyle = color;
      const step = BAR_W + BAR_GAP;
      const n = peaks.length;
      for (let x = 0; x < fullW; x += step) {
        const b0 = Math.floor((x / pps) / BUCKET_SECONDS);
        const b1 = Math.min(n, Math.max(b0 + 1, Math.ceil(((x + step) / pps) / BUCKET_SECONDS)));
        let m = 0;
        for (let b = b0; b < b1; b++) if (peaks[b] > m) m = peaks[b];
        const h = Math.max(2, m * WAVE_TOP);
        ctx.globalAlpha = 1;
        ctx.fillRect(x, WAVE_TOP - h, BAR_W, h);
        ctx.globalAlpha = 0.32;
        ctx.fillRect(x, WAVE_TOP + 4, BAR_W, Math.max(1, m * WAVE_BOT));
      }
      ctx.globalAlpha = 1;
    };
    drawInto(baseCanvasRef.current, COLOR_REST);
    drawInto(playedCanvasRef.current, COLOR_PLAYED);
  }, [peaks, duration, fullW, pps]);

  /* ---------- rAF: playhead + región reproducida + autoscroll ---------- */
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const a = audioRef.current;
      if (a) {
        const t = a.currentTime;
        posRef.current = t;
        const px = t * pps;
        if (playheadRef.current) playheadRef.current.style.left = px + "px";
        if (clipRef.current) clipRef.current.style.width = px + "px";
        const sc = scrollRef.current;
        if (sc && !a.paused) {
          const vis0 = sc.scrollLeft, visW = sc.clientWidth;
          if (px < vis0 + 40 || px > vis0 + visW - 100) {
            sc.scrollLeft = Math.max(0, px - visW * 0.3);
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pps]);

  // Estado "grueso" para textos (línea actual, reloj)
  useEffect(() => {
    const iv = setInterval(() => setPos(posRef.current), 200);
    return () => clearInterval(iv);
  }, []);

  /* ---------- helpers ---------- */
  const lyricT = useCallback(
    (l: Lyric) => Math.max(0, Number(l.start_time_seconds) - offset), // tiempo de AUDIO
    [offset]
  );
  const byTime = [...lyrics].sort((a, b) => lyricT(a) - lyricT(b));
  const selectedLyrics = byTime.filter(l => selIds.includes(l.id));
  const selected = selIds.length === 1 ? lyrics.find(l => l.id === selIds[0]) || null : null;

  /* ---------- selección ---------- */
  function clearSel(){ setSelIds([]); setPrimaryId(null); }
  function selectOnly(id: string){ setSelIds([id]); setPrimaryId(id); }
  function toggleSel(id: string){
    setSelIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    setPrimaryId(id);
  }
  function selectRangeTo(id: string){
    const target = lyrics.find(l => l.id === id);
    if (!target) return;
    const anchor = lyrics.find(l => l.id === primaryId) || target;
    const [lo, hi] = lyricT(anchor) <= lyricT(target)
      ? [lyricT(anchor), lyricT(target)] : [lyricT(target), lyricT(anchor)];
    const ids = byTime.filter(l => lyricT(l) >= lo - 1e-6 && lyricT(l) <= hi + 1e-6).map(l => l.id);
    setSelIds(prev => Array.from(new Set([...prev, ...ids])));
  }
  function selectToEnd(){
    const first = selectedLyrics[0];
    if (!first) return;
    const t0 = lyricT(first);
    setSelIds(byTime.filter(l => lyricT(l) >= t0 - 1e-6).map(l => l.id));
  }

  const seekTo = useCallback((t: number) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = Math.max(0, Math.min(duration || 0, t));
    posRef.current = a.currentTime;
    setPos(a.currentTime);
  }, [duration]);

  const togglePlay = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  }, []);

  const flash = useCallback((msg: string) => {
    setSavedFlash(msg);
    setTimeout(() => setSavedFlash(null), 1600);
  }, []);

  const commitTime = useCallback((lyricId: string, audioT: number) => {
    const start = Math.max(0, Math.round((audioT + offset) * 100) / 100);
    onChangeTime(lyricId, start);
    flash("✓ tiempo guardado");
  }, [offset, onChangeTime, flash]);

  const nudge = useCallback((l: Lyric, delta: number) => {
    commitTime(l.id, lyricT(l) + delta);
  }, [commitTime, lyricT]);

  /* Mover un conjunto de líneas por el mismo delta y guardar todo junto. */
  const commitShift = useCallback((delta: number, ids?: string[]) => {
    const idSet = ids && ids.length ? ids : selIds;
    const list = lyrics.filter(l => idSet.includes(l.id));
    if (!list.length || !delta) return;
    const changes = list.map(l => ({
      id: l.id,
      sec: Math.max(0, Math.round((Number(l.start_time_seconds) + delta) * 100) / 100),
    }));
    if (onChangeTimeMany) onChangeTimeMany(changes);
    else changes.forEach(c => onChangeTime(c.id, c.sec));
    flash(changes.length > 1 ? `✓ ${changes.length} tiempos guardados` : "✓ tiempo guardado");
  }, [selIds, lyrics, onChangeTimeMany, onChangeTime, flash]);

  /* ---------- fin marcado ("acá termina el tema") ---------- */
  const endT = dragEnd ?? (endSeconds != null && endSeconds > 0 ? Number(endSeconds) : null);

  const commitEnd = useCallback((t: number | null) => {
    if (!onChangeEnd) return;
    if (t == null) { onChangeEnd(null); flash("✓ fin: archivo entero"); return; }
    const v = Math.max(1, Math.min(duration || t, Math.round(t * 100) / 100));
    onChangeEnd(v);
    flash("✓ fin guardado — la app corta ahí");
  }, [onChangeEnd, duration, flash]);

  /** Busca dónde arranca el silencio de cola: último pico > 2% + un respiro. */
  const detectEnd = useCallback(() => {
    if (!peaks || !duration) return;
    let last = -1;
    for (let i = peaks.length - 1; i >= 0; i--) {
      if (peaks[i] > 0.02) { last = i; break; }
    }
    if (last < 0) return;
    const t = Math.min(duration, (last + 1) * BUCKET_SECONDS + 0.35);
    if (t >= duration - 0.6) { flash("no hay silencio de cola para recortar"); return; }
    commitEnd(t);
  }, [peaks, duration, commitEnd, flash]);

  const startDragEnd = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      const t = Math.max(1, Math.min(duration, (ev.clientX - rect.left) / pps));
      dragEndRef.current = t;
      setDragEnd(t);
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      const t = dragEndRef.current;
      dragEndRef.current = null;
      setDragEnd(null);
      if (t != null) commitEnd(t);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  }, [duration, pps, commitEnd]);

  /* ---------- interacción con la onda ---------- */
  const timeFromEvent = useCallback((e: { clientX: number }) => {
    const wrap = wrapRef.current;
    if (!wrap) return 0;
    const rect = wrap.getBoundingClientRect();
    return Math.max(0, Math.min(duration, (e.clientX - rect.left) / pps));
  }, [duration, pps]);

  const onWaveClick = useCallback((e: React.MouseEvent) => {
    seekTo(timeFromEvent(e));
  }, [seekTo, timeFromEvent]);

  const onWaveDblClick = useCallback((e: React.MouseEvent) => {
    const t = timeFromEvent(e);
    onInsertAt(Math.round((t + offset) * 100) / 100);
    flash("✓ línea nueva insertada");
  }, [timeFromEvent, onInsertAt, offset, flash]);

  /* ---------- drag de pins (mueve TODA la selección por el mismo delta) ---------- */
  const startDrag = useCallback((e: React.PointerEvent, l: Lyric) => {
    e.preventDefault();
    e.stopPropagation();
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    let ids: string[];
    if (selIds.includes(l.id)) {
      ids = selIds;
      setPrimaryId(l.id);
    } else {
      ids = additive ? [...selIds, l.id] : [l.id];
      setSelIds(ids);
      setPrimaryId(l.id);
    }
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const t0 = lyricT(l);
    const group = lyrics.filter(x => ids.includes(x.id));
    const minT = group.length ? Math.min(...group.map(x => lyricT(x))) : t0;
    let moved = false;
    const move = (ev: PointerEvent) => {
      const t = timeFromEvent(ev);
      let delta = t - t0;
      if (minT + delta < 0) delta = -minT;   // que ninguna quede antes de 0
      moved = true;
      dragMoveRef.current = delta;
      setDragMove({ delta });
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      const delta = dragMoveRef.current;
      dragMoveRef.current = null;
      setDragMove(null);
      if (moved && delta != null && Math.abs(delta) > 0.005) commitShift(delta, ids);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  }, [selIds, lyrics, lyricT, timeFromEvent, commitShift]);

  /* ---------- recuadro de selección sobre la franja de pins ---------- */
  const startBoxSel = useCallback((e: React.PointerEvent) => {
    if (e.target !== e.currentTarget) return;   // solo el fondo de la franja, no un pin
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const toT = (clientX: number) => Math.max(0, Math.min(duration, (clientX - rect.left) / pps));
    const t0 = toT(e.clientX);
    boxRef.current = { t0, add: e.shiftKey || e.metaKey || e.ctrlKey };
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    setBoxSel({ t0, t1: t0 });
    const move = (ev: PointerEvent) => setBoxSel({ t0: boxRef.current!.t0, t1: toT(ev.clientX) });
    const up = (ev: PointerEvent) => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      const info = boxRef.current;
      boxRef.current = null;
      setBoxSel(null);
      if (!info) return;
      const t1 = toT(ev.clientX);
      const [lo, hi] = info.t0 <= t1 ? [info.t0, t1] : [t1, info.t0];
      if (hi - lo < 0.05) { clearSel(); return; }   // click suelto en el fondo = deseleccionar
      const ids = byTime.filter(l => lyricT(l) >= lo && lyricT(l) <= hi).map(l => l.id);
      setSelIds(prev => info.add ? Array.from(new Set([...prev, ...ids])) : ids);
      if (ids.length) setPrimaryId(ids[0]);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration, pps, byTime, lyricT]);

  /* ---------- teclado ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement;
      if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.isContentEditable)) return;
      if (e.code === "Space") { e.preventDefault(); togglePlay(); }
      else if (e.code === "ArrowLeft")  { e.preventDefault(); seekTo(posRef.current - 2); }
      else if (e.code === "ArrowRight") { e.preventDefault(); seekTo(posRef.current + 2); }
      else if (e.code === "BracketLeft" && selIds.length)  { e.preventDefault(); commitShift(-0.05); }
      else if (e.code === "BracketRight" && selIds.length) { e.preventDefault(); commitShift(+0.05); }
      else if (e.code === "Escape") { setSelIds([]); setPrimaryId(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, seekTo, selIds, commitShift]);

  /* ---------- zoom ---------- */
  function zoomIn() {
    const cur = pps;
    const next = Math.min(maxPps, cur * 2);
    keepCenter(cur, next);
    setZoomPps(next);
  }
  function zoomOut() {
    const cur = pps;
    const next = cur / 2;
    if (next <= fitPps * 1.05) { setZoomPps(null); return; }
    keepCenter(cur, next);
    setZoomPps(next);
  }
  function keepCenter(curPps: number, nextPps: number) {
    const sc = scrollRef.current;
    if (!sc) return;
    const tCenter = (sc.scrollLeft + sc.clientWidth / 2) / curPps;
    setTimeout(() => {
      const s = scrollRef.current;
      if (s) s.scrollLeft = Math.max(0, tCenter * nextPps - s.clientWidth / 2);
    }, 0);
  }

  /* ---------- línea "sonando" ---------- */
  const contentPos = pos + offset;
  let currentLine: Lyric | null = null;
  for (const l of byTime) {
    if (Number(l.start_time_seconds) <= contentPos) currentLine = l;
    else break;
  }

  /* ---------- regla de tiempos ---------- */
  const rulerStep = (() => {
    const steps = [0.5, 1, 2, 5, 10, 15, 30, 60];
    for (const s of steps) if (s * pps >= 70) return s;
    return 60;
  })();
  const rulerMarks: number[] = [];
  for (let t = 0; t <= duration; t += rulerStep) rulerMarks.push(t);

  /* ======================== render ======================== */
  if (loadState === "error") {
    return (
      <div className="card mb-3">
        <p className="text-xs text-red-400">
          No pude cargar la onda del audio: {loadErr}. Podés seguir editando con la lista de abajo.
        </p>
      </div>
    );
  }

  return (
    <div className="card mb-3 space-y-3" style={{ userSelect: (dragMove || boxSel) ? "none" : undefined }}>
      {/* Barra superior: transporte + zoom */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={togglePlay} disabled={loadState !== "ready"}
                className="rounded-xl px-4 py-2 text-sm font-black bg-cyan-400 text-black disabled:opacity-40">
          {playing ? "❚❚ Pausa" : "▶ Play"}
        </button>
        <span className="font-mono text-xs text-neutral-300 w-28">
          {fmtClock(pos, true)} / {fmtClock(duration)}
        </span>
        <select value={rate} onChange={e => setRate(parseFloat(e.target.value))}
                className="bg-black border border-neutral-800 rounded px-2 py-1 text-[11px]"
                title="Velocidad de reproducción (para marcar fino)">
          <option value={0.5}>0.5×</option>
          <option value={0.75}>0.75×</option>
          <option value={1}>1×</option>
        </select>
        <span className="flex-1" />
        {savedFlash && <span className="text-[11px] text-green-400 font-mono">{savedFlash}</span>}
        <button onClick={() => onInsertAt(Math.round((posRef.current + offset) * 100) / 100)}
                disabled={loadState !== "ready"}
                className="btn text-xs" title="Inserta una línea nueva donde está el cursor de reproducción">
          + Línea en el cursor
        </button>
        {onChangeEnd && (
          <>
            <button onClick={() => commitEnd(posRef.current)}
                    disabled={loadState !== "ready"}
                    className="btn text-xs"
                    style={{ borderColor: "rgba(248,113,113,0.5)", color: "#f87171" }}
                    title="Marca el fin de la canción donde está el cursor: la app corta ahí y pasa a la siguiente">
              ⚑ Fin al cursor
            </button>
            <button onClick={detectEnd}
                    disabled={loadState !== "ready"}
                    className="btn text-xs"
                    title="Detecta dónde arranca el silencio de cola y marca el fin ahí">
              ⚑ Detectar cola
            </button>
            {endT != null && (
              <span className="flex items-center gap-1 text-[11px] font-mono px-2 py-1 rounded-full"
                    style={{ background: "rgba(248,113,113,0.12)", color: "#f87171" }}>
                fin {fmtClock(endT, true)}
                <button onClick={() => commitEnd(null)} title="Sacar el fin marcado (usar el archivo entero)"
                        className="hover:text-white leading-none">✕</button>
              </span>
            )}
          </>
        )}
        <div className="flex items-center gap-1">
          <button onClick={zoomOut} className="btn text-xs px-3" title="Alejar">−</button>
          <button onClick={() => setZoomPps(null)} className="btn text-xs px-2" title="Ajustar al ancho">⤢</button>
          <button onClick={zoomIn} className="btn text-xs px-3" title="Acercar">+</button>
        </div>
      </div>

      {/* Línea sonando */}
      <div className="rounded-lg border border-neutral-800 bg-black/50 px-3 py-2 min-h-[38px] flex items-center">
        {currentLine ? (
          <p className="text-sm font-bold truncate">
            <span className="text-cyan-300 font-mono text-[11px] mr-2">{fmtClock(lyricT(currentLine))}</span>
            {currentLine.text}
          </p>
        ) : (
          <p className="text-xs text-neutral-600">— todavía no entró ninguna línea —</p>
        )}
      </div>

      {/* Onda + pins */}
      {loadState === "loading" ? (
        <div className="h-[220px] flex items-center justify-center rounded-lg border border-neutral-800 bg-black/40">
          <p className="text-xs text-neutral-500 animate-pulse">Bajando y decodificando el audio…</p>
        </div>
      ) : (
        <div ref={scrollRef} className="overflow-x-auto rounded-lg border border-neutral-800 bg-black/40 no-scrollbar-x">
          <div ref={wrapRef} style={{ width: fullW, position: "relative" }}>
            {/* Regla */}
            <div className="relative h-4">
              {rulerMarks.map(t => (
                <span key={t} className="absolute top-0 text-[9px] font-mono text-neutral-600 border-l border-neutral-800 pl-1"
                      style={{ left: t * pps, height: "100%" }}>
                  {fmtClock(t)}
                </span>
              ))}
            </div>

            {/* Rail de pins (2 filas alternadas). Arrastrar sobre el fondo = recuadro de selección. */}
            <div className="relative" style={{ height: 44, touchAction: "none", cursor: "crosshair" }}
                 onPointerDown={startBoxSel}>
              {boxSel && (
                <div className="absolute pointer-events-none rounded"
                     style={{ left: Math.min(boxSel.t0, boxSel.t1) * pps,
                              width: Math.max(1, Math.abs(boxSel.t1 - boxSel.t0) * pps),
                              top: 0, height: "100%",
                              background: "rgba(34,211,238,0.15)", border: "1px solid rgba(34,211,238,0.5)" }} />
              )}
              {byTime.map((l, i) => {
                const sel = selIds.includes(l.id);
                const t = Math.max(0, lyricT(l) + (sel && dragMove ? dragMove.delta : 0));
                return (
                  <div key={l.id}
                       onPointerDown={e => startDrag(e, l)}
                       onClick={e => {
                         e.stopPropagation();
                         if (e.shiftKey) selectRangeTo(l.id);
                         else if (e.metaKey || e.ctrlKey) toggleSel(l.id);
                         else selectOnly(l.id);
                       }}
                       onDoubleClick={e => { e.stopPropagation(); seekTo(Math.max(0, t - 2)); audioRef.current?.play().catch(() => {}); }}
                       title={`${fmtClock(t, true)} · ${l.text}\narrastrá para mover (mueve toda la selección) · shift+click: rango · ⌘/ctrl+click: sumar/sacar · doble click: escuchar desde acá`}
                       className="absolute cursor-grab active:cursor-grabbing"
                       style={{ left: t * pps, top: i % 2 === 0 ? 2 : 22, transform: "translateX(-50%)", touchAction: "none", zIndex: sel ? 30 : 10 }}>
                    <div className={`px-1.5 py-0.5 rounded-full text-[10px] font-black font-mono leading-none whitespace-nowrap border ${
                      sel ? "bg-white text-black border-white"
                          : "bg-cyan-400 text-black border-cyan-300"}`}>
                      {i + 1}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Zona de la onda */}
            <div className="relative" style={{ height: WAVE_H, cursor: "text" }}
                 onClick={onWaveClick} onDoubleClick={onWaveDblClick}>
              <canvas ref={baseCanvasRef} className="absolute top-0 left-0" />
              <div ref={clipRef} className="absolute top-0 left-0 overflow-hidden" style={{ width: 0, height: WAVE_H }}>
                <canvas ref={playedCanvasRef} className="absolute top-0 left-0" />
              </div>
              {/* Líneas verticales de cada pin */}
              {byTime.map(l => {
                const sel = selIds.includes(l.id);
                const t = Math.max(0, lyricT(l) + (sel && dragMove ? dragMove.delta : 0));
                return (
                  <div key={`ln-${l.id}`} className="absolute top-0 pointer-events-none"
                       style={{ left: t * pps, width: 1, height: WAVE_H,
                                background: sel ? "rgba(255,255,255,0.9)" : "rgba(34,211,238,0.45)" }} />
                );
              })}
              {/* Fin marcado: zona muerta sombreada + línea + bandera arrastrable */}
              {endT != null && (
                <>
                  <div className="absolute top-0 pointer-events-none"
                       style={{ left: endT * pps, width: Math.max(0, fullW - endT * pps), height: WAVE_H,
                                background: "rgba(0,0,0,0.55)",
                                backgroundImage: "repeating-linear-gradient(-45deg, rgba(248,113,113,0.08) 0 6px, transparent 6px 12px)" }} />
                  <div className="absolute top-0 pointer-events-none"
                       style={{ left: endT * pps, width: 2, height: WAVE_H, background: "#f87171" }} />
                  <div onPointerDown={startDragEnd}
                       onClick={e => e.stopPropagation()}
                       onDoubleClick={e => e.stopPropagation()}
                       title={`Fin de la canción: ${fmtClock(endT, true)} — arrastrá para moverlo`}
                       className="absolute cursor-grab active:cursor-grabbing px-1.5 py-0.5 rounded text-[10px] font-black font-mono"
                       style={{ left: endT * pps, top: 4, transform: "translateX(-50%)", touchAction: "none",
                                background: "#f87171", color: "#000", zIndex: 40 }}>
                    ⚑ FIN
                  </div>
                </>
              )}
              {/* Playhead */}
              <div ref={playheadRef} className="absolute top-0 pointer-events-none"
                   style={{ left: 0, width: 2, height: WAVE_H, background: "#fff", boxShadow: "0 0 6px rgba(255,255,255,0.7)" }} />
              {/* Burbuja de delta mientras arrastrás (mueve toda la selección) */}
              {dragMove && selectedLyrics.length > 0 && (() => {
                const p = selectedLyrics.find(l => l.id === primaryId) || selectedLyrics[0];
                const t = Math.max(0, lyricT(p) + dragMove.delta);
                return (
                  <div className="absolute pointer-events-none px-1.5 py-0.5 rounded bg-white text-black text-[10px] font-mono font-bold whitespace-nowrap"
                       style={{ left: t * pps, top: 6, transform: "translateX(-50%)" }}>
                    {(dragMove.delta >= 0 ? "+" : "") + dragMove.delta.toFixed(2)}s · {fmtClock(t, true)}
                    {selectedLyrics.length > 1 ? ` · ${selectedLyrics.length} líneas` : ""}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Panel de la línea seleccionada */}
      {selected ? (
        <div className="rounded-lg border border-cyan-400/40 bg-cyan-400/5 p-3 flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11px] text-cyan-300 w-20 shrink-0">
            {fmtClock(Math.max(0, lyricT(selected) + (dragMove ? dragMove.delta : 0)), true)}
          </span>
          <button onClick={() => { seekTo(Math.max(0, lyricT(selected) - 2)); audioRef.current?.play().catch(() => {}); }}
                  className="btn text-xs whitespace-nowrap" title="Escuchar desde 2 s antes de esta línea">
            ▶ probar
          </button>
          <button onClick={() => nudge(selected, -0.1)} className="btn text-xs px-2" title="0,1 s antes">−0,1</button>
          <button onClick={() => nudge(selected, +0.1)} className="btn text-xs px-2" title="0,1 s después">+0,1</button>
          <button onClick={() => commitTime(selected.id, posRef.current)}
                  className="btn text-xs whitespace-nowrap" title="Mueve esta línea a donde está el cursor de reproducción">
            ⌖ al cursor
          </button>
          <input
            key={`sel-txt-${selected.id}`}
            defaultValue={selected.text}
            onBlur={e => { if (e.target.value !== selected.text) { onChangeText(selected.id, e.target.value); flash("✓ texto guardado"); } }}
            onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            className="input flex-1 min-w-[200px]"
            placeholder="Texto de la línea" />
          <button onClick={selectToEnd} className="btn text-xs whitespace-nowrap"
                  title="Seleccionar esta línea y todas las que siguen (para correr media canción de una)">
            ⇥ hasta el final
          </button>
          <button onClick={() => { onRemove(selected.id); clearSel(); }}
                  className="text-neutral-500 hover:text-red-400 text-sm px-1" title="Borrar esta línea">✕</button>
        </div>
      ) : selectedLyrics.length > 1 ? (
        <div className="rounded-lg border border-cyan-400/40 bg-cyan-400/5 p-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-black text-cyan-300 whitespace-nowrap">
            {selectedLyrics.length} líneas seleccionadas
          </span>
          <span className="font-mono text-[11px] text-neutral-400 whitespace-nowrap">
            {fmtClock(lyricT(selectedLyrics[0]))} → {fmtClock(lyricT(selectedLyrics[selectedLyrics.length - 1]))}
          </span>
          <button onClick={() => commitShift(-1)}   className="btn text-xs px-2" title="Todas 1 s antes">−1s</button>
          <button onClick={() => commitShift(-0.1)} className="btn text-xs px-2" title="Todas 0,1 s antes">−0,1</button>
          <button onClick={() => commitShift(+0.1)} className="btn text-xs px-2" title="Todas 0,1 s después">+0,1</button>
          <button onClick={() => commitShift(+1)}   className="btn text-xs px-2" title="Todas 1 s después">+1s</button>
          <button onClick={() => { const p = selectedLyrics[0]; seekTo(Math.max(0, lyricT(p) - 2)); audioRef.current?.play().catch(() => {}); }}
                  className="btn text-xs whitespace-nowrap" title="Escuchar desde 2 s antes de la primera seleccionada">
            ▶ probar
          </button>
          <button onClick={selectToEnd} className="btn text-xs whitespace-nowrap"
                  title="Extender la selección desde la primera seleccionada hasta el final">
            ⇥ hasta el final
          </button>
          <span className="flex-1" />
          <button onClick={clearSel} className="text-xs text-neutral-500 hover:text-white">deseleccionar</button>
        </div>
      ) : (
        <p className="text-[10px] text-neutral-600 font-mono">
          click en la onda: mover cursor · doble click en la onda: nueva línea ahí · click en un pin: editarlo ·
          arrastrar pin: corregir tiempo (mueve toda la selección) · shift+click: seleccionar rango ·
          ⌘/ctrl+click: sumar/sacar de la selección · arrastrar sobre la franja de pins: seleccionar con recuadro ·
          doble click en pin: escucharlo · ⚑ FIN: arrastralo para marcar dónde termina el tema (la app corta ahí) ·
          ESPACIO play/pausa · ←/→ ±2 s · [ ] mueve la selección ±0,05 s · ESC deseleccionar
        </p>
      )}
    </div>
  );
}
