"use client";
/* ============================================================================
 * BassStaff — pentagrama en clave de fa, alineado con la onda.
 *
 * Vive DENTRO del scroll del editor de onda (mismo ancho y mismo pps), así
 * que cada nota cae debajo del golpe que se ve en la onda.
 *
 *   click en el pentagrama: pone una nota en esa corchea y esa altura
 *     (shift = sostenido, alt = bemol) y suena
 *   click en una nota: la selecciona y suena · arrastrarla: tiempo y altura
 *   con una nota seleccionada: ↑/↓ semitono · shift+↑/↓ octava ·
 *     − / = acorta/alarga una corchea · Supr/⌫ borra · Esc deselecciona
 *
 * Alturas: MIDI ESCRITO (el bajo se escribe una octava arriba de lo que suena).
 * El sonido sale a la altura real: escrita − 12 + afinación del tema.
 * Tiempo: negras desde el compás 1 (tiempo de contenido = beat × 60/BPM).
 * ========================================================================== */
import { useCallback, useEffect, useRef, useState } from "react";

export type BassNote = { id: string; midi: number; start_beat: number | string; duration_beats: number | string };

const HALF = 6;                 // medio espacio (px): distancia entre línea y espacio
const D_MIN = 13;               // Si1 escrito (bajo de 5 cuerdas al aire)
const D_MAX = 32;               // Sol4 escrito
const PAD = 16;
const H = (D_MAX - D_MIN) * HALF + PAD * 2;
const STAFF_D = [18, 20, 22, 24, 26];          // Sol2 Si2 Re3 Fa3 La3
const STEP_SEMI = [0, 2, 4, 5, 7, 9, 11];
const NAMES = ["Do", "Re", "Mi", "Fa", "Sol", "La", "Si"];
const NOTE_COLOR = "#fbbf24";
const SNAP_BEATS = 0.5;          // corcheas

const yOfD = (d: number) => PAD + (D_MAX - d) * HALF;
const naturalMidi = (d: number) => (Math.floor(d / 7) + 1) * 12 + STEP_SEMI[((d % 7) + 7) % 7];

/** Cómo se escribe una altura: posición diatónica + alteración (−1, 0, +1). */
export function spell(midi: number, preferFlats: boolean) {
  const oct = Math.floor(midi / 12) - 1;
  const pc = ((midi % 12) + 12) % 12;
  let step = STEP_SEMI.indexOf(pc);
  let acc = 0;
  if (step < 0) {
    if (preferFlats) { step = STEP_SEMI.indexOf(pc + 1); acc = -1; }
    else { step = STEP_SEMI.indexOf(pc - 1); acc = 1; }
  }
  return { d: oct * 7 + step, acc, name: NAMES[step] + (acc > 0 ? "♯" : acc < 0 ? "♭" : ""), oct };
}

/** Frecuencia real: escrita − 1 octava, más la afinación del tema. */
export function soundingHz(midi: number, semis: number, cents: number) {
  const x = midi - 12 + (Number(semis) || 0) + (Number(cents) || 0) / 100;
  return 440 * Math.pow(2, (x - 69) / 12);
}

let sharedCtx: AudioContext | null = null;
function audioCtx() {
  if (!sharedCtx) {
    const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
    sharedCtx = new AC();
  }
  sharedCtx.resume().catch(() => {});
  return sharedCtx;
}
/** Sonidito de bajo: diente de sierra filtrado, ataque corto. */
export function playTone(hz: number, seconds = 0.45, vol = 0.5) {
  const ctx = audioCtx();
  const t = ctx.currentTime + 0.005;
  const dur = Math.max(0.12, Math.min(1.6, seconds));
  const o = ctx.createOscillator();
  const o2 = ctx.createOscillator();
  const f = ctx.createBiquadFilter();
  const g = ctx.createGain();
  o.type = "sawtooth"; o.frequency.value = hz;
  o2.type = "sine"; o2.frequency.value = hz * 2;          // para que se oiga en parlantes chicos
  f.type = "lowpass"; f.frequency.value = Math.min(4000, hz * 10); f.Q.value = 2;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.35 * vol, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.18 * vol, t + 0.12);
  g.gain.setValueAtTime(0.18 * vol, t + dur);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
  o.connect(f); o2.connect(f); f.connect(g); g.connect(ctx.destination);
  o.start(t); o2.start(t); o.stop(t + dur + 0.1); o2.stop(t + dur + 0.1);
}

export default function BassStaff({
  notes, bpm, beatsPerBar, offset, pps, fullW, getAudio,
  tuningSemis = 0, tuningCents = 0, preferFlats = false, playAlong = false,
  onAdd, onUpdate, onRemove,
}: {
  notes: BassNote[];
  bpm: number;
  beatsPerBar: number;
  offset: number;
  pps: number;
  fullW: number;
  getAudio: () => HTMLAudioElement | null;
  tuningSemis?: number;
  tuningCents?: number;
  preferFlats?: boolean;
  /** Que las notas suenen junto con la pista mientras reproduce. */
  playAlong?: boolean;
  onAdd: (midi: number, startBeat: number) => Promise<string | null | undefined> | void;
  onUpdate: (id: string, patch: { midi?: number; start_beat?: number; duration_beats?: number }) => void;
  onRemove: (id: string) => void;
}) {
  const beatDur = bpm > 0 ? 60 / bpm : 0;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const headRef = useRef<HTMLDivElement | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; beat: number; midi: number } | null>(null);
  const [hover, setHover] = useState<{ beat: number; d: number } | null>(null);

  const xOfBeat = useCallback((b: number) => (b * beatDur - offset) * pps, [beatDur, offset, pps]);
  const beatOfX = (x: number) => (x / pps + offset) / beatDur;
  const snapBeat = (b: number) => Math.max(0, Math.round(b / SNAP_BEATS) * SNAP_BEATS);
  const dOfY = (y: number) => Math.max(D_MIN, Math.min(D_MAX, Math.round(D_MAX - (y - PAD) / HALF)));

  const hzOf = useCallback((midi: number) => soundingHz(midi, tuningSemis, tuningCents), [tuningSemis, tuningCents]);
  const sound = useCallback((midi: number, beats = 0.5) => {
    playTone(hzOf(midi), Math.max(0.25, beats * beatDur));
  }, [hzOf, beatDur]);

  const sorted = [...notes].sort((a, b) => Number(a.start_beat) - Number(b.start_beat));

  /* ---------- playhead + reproducción junto con la pista ---------- */
  const notesRef = useRef(sorted);
  notesRef.current = sorted;
  useEffect(() => {
    let raf = 0;
    let prevT = -1;
    const tick = () => {
      const a = getAudio();
      if (a) {
        const t = a.currentTime;
        if (headRef.current) headRef.current.style.left = t * pps + "px";
        if (playAlong && beatDur && !a.paused && prevT >= 0 && t > prevT && t - prevT < 0.3) {
          for (const n of notesRef.current) {
            const nt = Number(n.start_beat) * beatDur - offset;
            if (nt > prevT && nt <= t) playTone(hzOf(n.midi), Number(n.duration_beats) * beatDur / (a.playbackRate || 1), 0.45);
          }
        }
        prevT = t;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [getAudio, pps, playAlong, beatDur, offset, hzOf]);

  /* ---------- teclado sobre la nota seleccionada ---------- */
  useEffect(() => {
    if (!selId) return;
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement;
      if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.tagName === "SELECT" || tgt.isContentEditable)) return;
      const n = notesRef.current.find(x => x.id === selId);
      if (!n) return;
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault(); e.stopPropagation();
        const step = (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 12 : 1);
        const midi = Math.max(0, Math.min(127, n.midi + step));
        onUpdate(n.id, { midi }); sound(midi, Number(n.duration_beats));
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault(); e.stopPropagation();
        onRemove(n.id); setSelId(null);
      } else if (e.key === "-" || e.key === "=" || e.key === "+") {
        e.preventDefault();
        const dur = Math.max(SNAP_BEATS, Number(n.duration_beats) + (e.key === "-" ? -SNAP_BEATS : SNAP_BEATS));
        onUpdate(n.id, { duration_beats: dur });
      } else if (e.key === "Escape") {
        setSelId(null);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [selId, onUpdate, onRemove, sound]);

  /* ---------- mouse ---------- */
  const local = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  async function onBackgroundClick(e: React.MouseEvent) {
    if (!beatDur) return;
    const { x, y } = local(e);
    const beat = snapBeat(beatOfX(x));
    const midi = naturalMidi(dOfY(y)) + (e.shiftKey ? 1 : e.altKey ? -1 : 0);
    sound(midi);
    // Monofónico: si ya hay una nota en esa corchea, se le cambia la altura
    const there = notesRef.current.find(n => Math.abs(Number(n.start_beat) - beat) < 1e-3);
    if (there) { onUpdate(there.id, { midi }); setSelId(there.id); return; }
    const id = await onAdd(midi, beat);
    if (typeof id === "string" && id) setSelId(id);
  }

  function startNoteDrag(e: React.PointerEvent, n: BassNote) {
    e.preventDefault(); e.stopPropagation();
    const el = e.currentTarget as Element;
    el.setPointerCapture(e.pointerId);
    setSelId(n.id);
    const p0 = local(e);
    const sp = spell(n.midi, preferFlats);
    const accSemi = n.midi - naturalMidi(sp.d);
    const beat0 = Number(n.start_beat);
    let moved = false;
    let cur = { beat: beat0, midi: n.midi };
    const move = (ev: PointerEvent) => {
      const p = local(ev);
      if (!moved && Math.hypot(p.x - p0.x, p.y - p0.y) < 3) return;
      moved = true;
      const beat = snapBeat(beat0 + (p.x - p0.x) / pps / beatDur);
      const d = Math.max(D_MIN, Math.min(D_MAX, sp.d + Math.round(-(p.y - p0.y) / HALF)));
      const midi = naturalMidi(d) + accSemi;
      if (midi !== cur.midi) sound(midi);
      cur = { beat, midi };
      setDrag({ id: n.id, beat, midi });
    };
    const up = () => {
      el.removeEventListener("pointermove", move as any);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      setDrag(null);
      if (!moved) { sound(n.midi, Number(n.duration_beats)); return; }
      const patch: any = {};
      if (Math.abs(cur.beat - beat0) > 1e-3) patch.start_beat = cur.beat;
      if (cur.midi !== n.midi) patch.midi = cur.midi;
      if (Object.keys(patch).length) onUpdate(n.id, patch);
    };
    el.addEventListener("pointermove", move as any);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  }

  /* ---------- dibujo ---------- */
  const barLines: { x: number; bar: number }[] = [];
  // Numerar cada 1, 2, 4, 8… compases según el zoom, para que no se encimen
  const barPx = beatDur * beatsPerBar * pps;
  let labelEvery = 1;
  while (barPx > 0 && labelEvery * barPx < 30) labelEvery *= 2;
  const beatTicks: number[] = [];
  if (beatDur) {
    const k0 = Math.max(0, Math.ceil(offset / beatDur - 1e-6));
    for (let k = k0; ; k++) {
      const x = xOfBeat(k);
      if (x > fullW) break;
      if (k % beatsPerBar === 0) {
        const bar = k / beatsPerBar + 1;
        // muy alejado: solo las líneas numeradas, si no el pentagrama es una reja
        if (barPx >= 12 || (bar - 1) % labelEvery === 0) barLines.push({ x, bar });
      }
      else if (beatDur * pps >= 10) beatTicks.push(x);
    }
  }
  const sel = selId ? notes.find(n => n.id === selId) || null : null;
  const top = yOfD(STAFF_D[4]);
  const bottom = yOfD(STAFF_D[0]);

  return (
    <div className="relative border-t border-neutral-800" style={{ height: H }}>
      {/* Clave de fa, siempre visible al scrollear */}
      <div className="pointer-events-none" style={{ position: "sticky", left: 0, width: 0, height: H, zIndex: 3 }}>
        <span style={{ position: "absolute", left: 4, top: top - 9, fontSize: 40, lineHeight: 1, color: "rgba(212,212,212,0.28)" }}>𝄢</span>
      </div>
      <svg ref={svgRef} width={fullW} height={H} className="absolute top-0 left-0"
           style={{ cursor: beatDur ? "crosshair" : "default" }}
           onClick={onBackgroundClick}
           onMouseMove={e => {
             if (!beatDur) return;
             const { x, y } = local(e);
             setHover({ beat: snapBeat(beatOfX(x)), d: dOfY(y) });
           }}
           onMouseLeave={() => setHover(null)}>
        {/* líneas guía de las líneas adicionales (muy tenues) */}
        {[14, 16, 28, 30, 32].map(d => (
          <line key={`g${d}`} x1={0} x2={fullW} y1={yOfD(d)} y2={yOfD(d)} stroke="rgba(255,255,255,0.05)" strokeDasharray="2 6" />
        ))}
        {/* pentagrama */}
        {STAFF_D.map(d => (
          <line key={d} x1={0} x2={fullW} y1={yOfD(d)} y2={yOfD(d)} stroke="rgba(212,212,212,0.45)" strokeWidth={1} />
        ))}
        {beatTicks.map((x, i) => (
          <line key={`t${i}`} x1={x} x2={x} y1={top} y2={bottom} stroke="rgba(167,139,250,0.12)" />
        ))}
        {barLines.map(b => (
          <g key={`b${b.bar}`}>
            <line x1={b.x} x2={b.x} y1={top} y2={bottom} stroke="rgba(167,139,250,0.6)" />
            {(b.bar - 1) % labelEvery === 0 && (
              <text x={b.x + 2} y={top - 4} fontSize={8} fill="rgba(196,181,253,0.7)" fontFamily="ui-monospace, monospace">{b.bar}</text>
            )}
          </g>
        ))}

        {/* fantasma bajo el mouse */}
        {hover && !drag && (() => {
          const x = xOfBeat(hover.beat);
          return (
            <g pointerEvents="none" opacity={0.35}>
              <ellipse cx={x} cy={yOfD(hover.d)} rx={5.5} ry={4} transform={`rotate(-20 ${x} ${yOfD(hover.d)})`} fill={NOTE_COLOR} />
              <text x={x + 9} y={yOfD(hover.d) + 3} fontSize={9} fill={NOTE_COLOR} fontFamily="ui-monospace, monospace">
                {NAMES[((hover.d % 7) + 7) % 7]}{Math.floor(hover.d / 7)}
              </text>
            </g>
          );
        })()}

        {/* notas */}
        {sorted.map(n => {
          const dragging = drag && drag.id === n.id;
          const midi = dragging ? drag!.midi : n.midi;
          const beat = dragging ? drag!.beat : Number(n.start_beat);
          const sp = spell(midi, preferFlats);
          const x = xOfBeat(beat);
          const y = yOfD(Math.max(D_MIN, Math.min(D_MAX, sp.d)));
          const isSel = n.id === selId;
          const color = isSel ? "#ffffff" : NOTE_COLOR;
          const len = Number(n.duration_beats) * beatDur * pps;
          const ledgers: number[] = [];
          for (let d = 16; d >= sp.d; d -= 2) ledgers.push(d);
          for (let d = 28; d <= sp.d; d += 2) ledgers.push(d);
          return (
            <g key={n.id} style={{ cursor: "grab" }}
               onPointerDown={e => startNoteDrag(e, n)}
               onClick={e => e.stopPropagation()}>
              <rect x={x} y={y - 1.5} width={Math.max(0, len - 2)} height={3} rx={1.5} fill={color} opacity={0.3} />
              {ledgers.map(d => (
                <line key={d} x1={x - 9} x2={x + 9} y1={yOfD(d)} y2={yOfD(d)} stroke={color} strokeWidth={1} />
              ))}
              {sp.acc !== 0 && (
                <text x={x - 16} y={y + 4} fontSize={12} fill={color} fontWeight={700}>{sp.acc > 0 ? "♯" : "♭"}</text>
              )}
              <ellipse cx={x} cy={y} rx={5.5} ry={4} transform={`rotate(-20 ${x} ${y})`} fill={color} />
              {/* zona de agarre más grande que la cabeza */}
              <rect x={x - 9} y={y - 7} width={18} height={14} fill="transparent" />
            </g>
          );
        })}
      </svg>

      {/* etiqueta de la nota seleccionada: nombre escrito + frecuencia real */}
      {sel && (() => {
        const midi = drag && drag.id === sel.id ? drag.midi : sel.midi;
        const beat = drag && drag.id === sel.id ? drag.beat : Number(sel.start_beat);
        const sp = spell(midi, preferFlats);
        const y = yOfD(Math.max(D_MIN, Math.min(D_MAX, sp.d)));
        const bar = Math.floor(beat / beatsPerBar) + 1;
        const inBar = beat - (bar - 1) * beatsPerBar;
        return (
          <div className="absolute pointer-events-none rounded bg-white text-black text-[10px] font-mono font-bold px-1.5 py-0.5 whitespace-nowrap"
               style={{ left: xOfBeat(beat) + 10, top: Math.max(0, y - 22), zIndex: 7 }}>
            {sp.name}{sp.oct} · comp. {bar}.{(inBar + 1).toString().replace(".5", "½")} · suena {hzOf(midi).toFixed(1)} Hz
          </div>
        );
      })()}

      {/* playhead */}
      <div ref={headRef} className="absolute top-0 pointer-events-none"
           style={{ left: 0, width: 2, height: H, background: "rgba(255,255,255,0.8)", zIndex: 4 }} />
    </div>
  );
}
