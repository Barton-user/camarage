"use client";
/* ============================================================================
 * NoteRecorder — tocás y se escribe en el pentagrama.
 *
 *  · Placa de sonido / micrófono: escucha la entrada (NO graba audio), detecta
 *    cada ataque y su altura (YIN) y escribe la nota en la corchea más cercana.
 *  · Controlador MIDI: lo mismo con note on / note off (Web MIDI: Chrome/Edge).
 *
 * El tiempo de cada nota sale de la posición de la pista en el momento del
 * ataque (tiempo de contenido = audio + offset). Al parar, se borran las notas
 * que había de antes en el tramo grabado: grabar encima reemplaza.
 * ========================================================================== */
import { useCallback, useEffect, useRef, useState } from "react";
import { decimate, hzToMidi, median, midiName, rms, yin } from "@/lib/pitch";

type Note = { id: string; midi: number; start_beat: number | string; duration_beats: number | string };
type Source = "audio" | "midi";

const POLL_MS = 10;
const SNAP = 0.5;                       // corcheas
const LS = "camarage.rec.";
function lsGet(k: string) { try { return localStorage.getItem(LS + k); } catch { return null; } }
function lsSet(k: string, v: string) { try { localStorage.setItem(LS + k, v); } catch {} }

export default function NoteRecorder({
  getAudio, bpm, offset, tuningSemis = 0, tuningCents = 0, notes,
  onAddNote, onRemoveNotes, onRecordingChange,
}: {
  getAudio: () => HTMLAudioElement | null;
  bpm: number;
  offset: number;
  tuningSemis?: number;
  tuningCents?: number;
  notes: Note[];
  onAddNote: (writtenMidi: number, startBeat: number, durationBeats: number) => Promise<unknown> | void;
  onRemoveNotes: (ids: string[]) => Promise<unknown> | void;
  onRecordingChange?: (rec: boolean) => void;
}) {
  const beatDur = bpm > 0 ? 60 / bpm : 0;
  const midiSupported = typeof navigator !== "undefined" && "requestMIDIAccess" in navigator;

  const [source, setSource] = useState<Source>("audio");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>("");
  const [latencyMs, setLatencyMs] = useState(0);
  const [octave, setOctave] = useState(0);
  const [sens, setSens] = useState(0.5);
  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const [live, setLive] = useState<string>("");
  const [count, setCount] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [midiInputs, setMidiInputs] = useState<string[]>([]);

  useEffect(() => {
    const s = lsGet("source"); if (s === "midi" || s === "audio") setSource(s);
    const d = lsGet("device"); if (d) setDeviceId(d);
    const l = parseFloat(lsGet("latency") || ""); if (isFinite(l)) setLatencyMs(l);
    const o = parseInt(lsGet("octave") || "", 10); if (isFinite(o)) setOctave(o);
    const z = parseFloat(lsGet("sens") || ""); if (z >= 0 && z <= 1) setSens(z);
  }, []);

  // Parámetros vivos que lee el loop sin reiniciarse
  const cfg = useRef({ beatDur, offset, tuningSemis, tuningCents, latencyMs, octave, sens });
  cfg.current = { beatDur, offset, tuningSemis, tuningCents, latencyMs, octave, sens };
  const cbRef = useRef({ onAddNote, onRemoveNotes, onRecordingChange });
  cbRef.current = { onAddNote, onRemoveNotes, onRecordingChange };
  const notesRef = useRef(notes);
  notesRef.current = notes;

  const sessionRef = useRef<{
    stop: () => void;
    startBeat: number;
    snapshot: Note[];
    lastBeat: number;
    maxBeat: number;
  } | null>(null);

  /* ---------- posición de la pista, suavizada ---------- */
  const audioClock = useCallback(() => {
    let anchor: { p: number; a: number } | null = null;
    return () => {
      const a = getAudio();
      if (!a) return 0;
      const r = a.playbackRate || 1;
      const now = performance.now();
      const est = anchor ? anchor.a + ((now - anchor.p) / 1000) * r : a.currentTime;
      if (!anchor || a.paused || Math.abs(est - a.currentTime) > 0.05) {
        anchor = { p: now, a: a.currentTime };
        return a.currentTime;
      }
      return est;
    };
  }, [getAudio]);

  /* ---------- escribir una nota terminada ---------- */
  const emit = useCallback((soundingMidi: number, audioStart: number, audioEnd: number) => {
    const c = cfg.current;
    const ses = sessionRef.current;
    if (!c.beatDur || !ses) return;
    const lat = c.latencyMs / 1000;
    const startBeat = Math.max(0, Math.round(((audioStart - lat + c.offset) / c.beatDur) / SNAP) * SNAP);
    let endBeat = Math.round(((audioEnd - lat + c.offset) / c.beatDur) / SNAP) * SNAP;
    if (endBeat <= startBeat) endBeat = startBeat + SNAP;
    const dur = Math.min(8, endBeat - startBeat);
    if (startBeat < ses.startBeat - SNAP) return;
    if (Math.abs(startBeat - ses.lastBeat) < 1e-3) return;     // dos notas en la misma corchea: queda la primera
    // Sonando → escrito: se descuenta la afinación del tema y se sube una octava (convención del bajo)
    const written = Math.round(soundingMidi - c.tuningSemis - c.tuningCents / 100) + 12 + 12 * c.octave;
    if (written < 0 || written > 127) return;
    ses.lastBeat = startBeat;
    ses.maxBeat = Math.max(ses.maxBeat, startBeat + dur);
    setCount(n => n + 1);
    cbRef.current.onAddNote(written, startBeat, dur);
  }, []);

  /* ---------- fuente: placa / micrófono ---------- */
  async function startAudio(clock: () => number) {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: false, noiseSuppression: false, autoGainControl: false,
      } as MediaTrackConstraints,
    });
    // Ya hay permiso: ahora sí se ven los nombres de las entradas
    navigator.mediaDevices.enumerateDevices().then(ds => setDevices(ds.filter(d => d.kind === "audioinput"))).catch(() => {});
    const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
    const ctx = new AC({ latencyHint: "interactive" });
    await ctx.resume().catch(() => {});
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    an.fftSize = 4096;
    an.smoothingTimeConstant = 0;
    src.connect(an);                       // no va a los parlantes: no se monitorea ni se graba
    const sr = ctx.sampleRate;
    const dec = sr >= 88000 ? 4 : sr >= 32000 ? 2 : 1;
    const buf = new Float32Array(an.fftSize);
    // Ventana del nivel: 30 ms, más que un ciclo del Mi grave (24 ms); si es
    // más corta el nivel "late" con la onda y aparecen ataques falsos.
    const TAIL = Math.round(sr * 0.03);

    let floor = 0.002;                     // piso de ruido, se adapta
    let calib = 0;
    const hist: number[] = [];             // niveles recientes (para detectar ataques)
    type Cur = { t0: number; peak: number; ests: number[]; stable: number | null; pend: { q: number; n: number; t: number } | null; lowN: number };
    let cur: Cur | null = null;
    let uiTick = 0;

    const finish = (tEnd: number) => {
      if (!cur) return;
      if (cur.ests.length >= 2) emit(median(cur.ests), cur.t0, tEnd);
      cur = null;
    };

    const iv = setInterval(() => {
      an.getFloatTimeDomainData(buf);
      const lvl = rms(buf, buf.length - TAIL, buf.length);
      const tNow = clock() - (TAIL / sr) / 2;      // centro de la ventana corta
      // Calibración del piso de ruido (primeros 300 ms) y luego seguimiento lento cuando no hay nota
      if (calib < 30) { floor = Math.max(floor, lvl); calib++; }
      else if (!cur && lvl < floor * 3) floor = floor * 0.995 + lvl * 0.005;
      const gate = Math.max(0.004, floor * (2.5 + (1 - cfg.current.sens) * 6));

      const recentMin = hist.length ? Math.min(...hist.slice(-6)) : lvl;
      const lvlAgo = hist.length >= 2 ? hist[hist.length - 2] : lvl;
      hist.push(lvl); if (hist.length > 50) hist.shift();

      // Ataque: el nivel sube rápido respecto de lo que venía. Con nota sonando
      // (re-ataque, p.ej. corcheas repetidas) alcanza con una subida menor, pero
      // tienen que haber pasado ≥ 70 ms (si no, es el mismo ataque que sube).
      const rising = lvl > lvlAgo * 1.2;
      const onset = !cur
        ? lvl > gate && lvl > recentMin * 2 && rising
        : tNow - cur.t0 > 0.07 && lvl > gate && lvl > recentMin * 1.35 && rising && lvl > cur.peak * 0.4;
      if (onset) {
        if (cur) finish(tNow);
        cur = { t0: tNow, peak: lvl, ests: [], stable: null, pend: null, lowN: 0 };
      }

      if (cur) {
        cur.peak = Math.max(cur.peak, lvl);
        // Altura: a partir de ~35 ms del ataque (que la ventana tenga nota)
        if (tNow - cur.t0 > 0.035) {
          const r = yin(decimate(buf, dec), sr / dec, 30, 1300, 0.15);
          if (r && r.clarity > 0.8) {
            const m = hzToMidi(r.hz);
            if (cur.stable == null) {
              cur.ests.push(m);
              if (cur.ests.length >= 4) cur.stable = median(cur.ests);
            } else {
              const q = Math.round(m);
              if (Math.abs(m - cur.stable) < 0.6) { cur.pend = null; if (cur.ests.length < 30) cur.ests.push(m); }
              else if (cur.pend && cur.pend.q === q) {
                // Cambio de altura sin ataque (ligado, slide): nueva nota
                if (++cur.pend.n >= 4) {
                  const t = cur.pend.t;
                  finish(t);
                  cur = { t0: t, peak: lvl, ests: [m], stable: null, pend: null, lowN: 0 };
                }
              } else cur.pend = { q, n: 1, t: tNow };
            }
          }
        }
        // Fin de la nota
        if (cur && (lvl < gate * 0.8 || lvl < cur.peak * 0.08)) {
          if (++cur.lowN >= 3) finish(tNow);
        } else if (cur) cur.lowN = 0;
      }

      if (++uiTick % 5 === 0) {
        setLevel(Math.min(1, lvl / 0.3));
        setLive(cur && cur.ests.length ? midiName(Math.round(median(cur.ests) - cfg.current.tuningSemis - cfg.current.tuningCents / 100)) : "");
      }
    }, POLL_MS);

    return () => {
      clearInterval(iv);
      if (cur) finish(clock());
      try { src.disconnect(); } catch {}
      stream.getTracks().forEach(t => t.stop());
      ctx.close().catch(() => {});
      setLevel(0); setLive("");
    };
  }

  /* ---------- fuente: controlador MIDI ---------- */
  async function startMidi(clock: () => number) {
    const access: any = await (navigator as any).requestMIDIAccess();
    const names: string[] = [];
    let open: { note: number; t0: number } | null = null;
    const onMsg = (e: any) => {
      const [st, d1, d2] = e.data as Uint8Array;
      const cmd = st & 0xf0;
      const t = clock();
      if (cmd === 0x90 && d2 > 0) {
        if (open) emit(open.note, open.t0, t);           // monofónico: la anterior termina acá
        open = { note: d1, t0: t };
        setLive(midiName(d1)); setLevel(d2 / 127);
      } else if ((cmd === 0x80 || (cmd === 0x90 && d2 === 0)) && open && open.note === d1) {
        emit(open.note, open.t0, t);
        open = null;
        setLive(""); setLevel(0);
      }
    };
    const inputs: any[] = [];
    access.inputs.forEach((inp: any) => { inputs.push(inp); names.push(inp.name); inp.onmidimessage = onMsg; });
    setMidiInputs(names);
    if (!inputs.length) setErr("No veo ningún controlador MIDI. Conectalo (o emparejalo por Bluetooth) y volvé a tocar Grabar.");
    return () => {
      if (open) emit(open.note, open.t0, clock());
      inputs.forEach(inp => { inp.onmidimessage = null; });
      setLevel(0); setLive("");
    };
  }

  /* ---------- grabar / parar ---------- */
  async function start() {
    setErr(null);
    const a = getAudio();
    if (!a) { setErr("La pista todavía no está lista."); return; }
    if (!beatDur) { setErr("Falta el BPM de la canción."); return; }
    const clock = audioClock();
    const startBeat = Math.max(0, Math.floor(((a.currentTime + offset) / beatDur) / SNAP) * SNAP);
    sessionRef.current = { stop: () => {}, startBeat, snapshot: [...notesRef.current], lastBeat: -1, maxBeat: startBeat };
    let stopSrc: () => void;
    try {
      stopSrc = source === "midi" ? await startMidi(clock) : await startAudio(clock);
    } catch (e: any) {
      sessionRef.current = null;
      setErr(e?.name === "NotAllowedError"
        ? "El navegador no dio permiso para usar la entrada de audio. Habilitalo en el candado de la barra de direcciones."
        : (e?.message || String(e)));
      return;
    }
    const onPause = () => stop();
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onPause);
    sessionRef.current.stop = () => {
      a.removeEventListener("pause", onPause);
      a.removeEventListener("ended", onPause);
      stopSrc();
    };
    setCount(0);
    setRecording(true);
    cbRef.current.onRecordingChange?.(true);
    if (a.paused) a.play().catch(() => {});
  }

  function stop() {
    const ses = sessionRef.current;
    if (!ses) return;
    sessionRef.current = null;
    ses.stop();
    const a = getAudio();
    if (a && !a.paused) a.pause();
    // Reemplazo: lo que había antes en el tramo grabado se va
    const endBeat = Math.max(ses.maxBeat, a && cfg.current.beatDur ? (a.currentTime + cfg.current.offset) / cfg.current.beatDur : ses.maxBeat);
    const old = ses.snapshot
      .filter(n => Number(n.start_beat) >= ses.startBeat - 1e-3 && Number(n.start_beat) < endBeat)
      .map(n => n.id);
    if (old.length) cbRef.current.onRemoveNotes(old);
    setRecording(false);
    cbRef.current.onRecordingChange?.(false);
  }

  useEffect(() => () => { if (sessionRef.current) { sessionRef.current.stop(); sessionRef.current = null; } }, []);

  // Lista de entradas (sin permiso todavía vienen sin nombre)
  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices?.()
      .then(ds => setDevices(ds.filter(d => d.kind === "audioinput"))).catch(() => {});
  }, []);

  /* ---------- UI ---------- */
  return (
    <div className="basis-full flex flex-wrap items-center gap-2 rounded-lg border border-red-400/25 bg-red-400/5 px-3 py-2">
      {!recording ? (
        <button onClick={start} disabled={!beatDur}
                className="rounded-lg px-3 py-1.5 text-xs font-black bg-red-500 text-white disabled:opacity-40"
                title="Arranca la pista desde el cursor y escribe lo que tocás. Grabar encima de algo lo reemplaza.">
          ● Grabar
        </button>
      ) : (
        <button onClick={stop} className="rounded-lg px-3 py-1.5 text-xs font-black bg-white text-black animate-pulse">
          ■ Parar
        </button>
      )}

      <select value={source} disabled={recording}
              onChange={e => { const v = e.target.value as Source; setSource(v); lsSet("source", v); }}
              className="bg-black border border-neutral-800 rounded px-2 py-1 text-[11px]">
        <option value="audio">Placa / micrófono</option>
        <option value="midi" disabled={!midiSupported}>Controlador MIDI{midiSupported ? "" : " (solo Chrome/Edge)"}</option>
      </select>

      {source === "audio" && (
        <select value={deviceId} disabled={recording}
                onChange={e => { setDeviceId(e.target.value); lsSet("device", e.target.value); }}
                className="bg-black border border-neutral-800 rounded px-2 py-1 text-[11px] max-w-[200px]">
          <option value="">Entrada por defecto</option>
          {devices.filter(d => d.deviceId && d.deviceId !== "default").map((d, i) => (
            <option key={d.deviceId} value={d.deviceId}>{d.label || `Entrada ${i + 1}`}</option>
          ))}
        </select>
      )}

      {/* Nivel + nota detectada */}
      <span className="flex items-center gap-2 min-w-[120px]">
        <span className="relative inline-block h-2 w-16 rounded bg-neutral-800 overflow-hidden">
          <span className="absolute left-0 top-0 h-full bg-red-400 transition-[width] duration-75" style={{ width: `${Math.round(level * 100)}%` }} />
        </span>
        <span className="font-mono text-xs font-black text-red-200 w-12">{live || (recording ? "…" : "")}</span>
      </span>
      {recording && <span className="text-[11px] text-neutral-400 font-mono">{count} notas</span>}

      <span className="flex-1" />

      {source === "audio" && (
        <label className="flex items-center gap-1 text-[11px] text-neutral-400 whitespace-nowrap" title="Más alto = toma notas más suaves (y también más ruido)">
          sensibilidad
          <input type="range" min={0} max={1} step={0.05} value={sens} disabled={recording}
                 onChange={e => { const v = parseFloat(e.target.value); setSens(v); lsSet("sens", String(v)); }}
                 className="w-16 accent-red-400" />
        </label>
      )}
      <label className="flex items-center gap-1 text-[11px] text-neutral-400 whitespace-nowrap"
             title="Si las notas quedan escritas una octava arriba o abajo (p.ej. con guitarra o con un teclado MIDI)">
        octava
        <select value={octave} onChange={e => { const v = parseInt(e.target.value, 10); setOctave(v); lsSet("octave", String(v)); }}
                className="bg-black border border-neutral-800 rounded px-1 py-1 text-[11px]">
          {[-2, -1, 0, 1, 2].map(v => <option key={v} value={v}>{v > 0 ? `+${v}` : v}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-1 text-[11px] text-neutral-400 whitespace-nowrap"
             title="Si las notas te quedan sistemáticamente tarde, subilo (auriculares Bluetooth: 150–250 ms)">
        latencia
        <input type="number" step={10} value={latencyMs}
               onChange={e => { const v = parseFloat(e.target.value) || 0; setLatencyMs(v); lsSet("latency", String(v)); }}
               className="input w-16 text-center mono text-[11px]" />
        ms
      </label>

      {midiInputs.length > 0 && source === "midi" && (
        <p className="basis-full text-[10px] text-neutral-500 font-mono">MIDI: {midiInputs.join(" · ")}</p>
      )}
      {err && <p className="basis-full text-[11px] text-red-300">{err}</p>}
      <p className="basis-full text-[10px] text-neutral-600 font-mono">
        ● Grabar arranca la pista desde el cursor · tocá una nota por vez · ■ Parar (o pausa) termina ·
        lo que había en el tramo grabado se reemplaza · no se graba audio, solo las notas ·
        escuchá la pista con auriculares para que la entrada no la tome
      </p>
    </div>
  );
}
