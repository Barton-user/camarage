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
import { createPortal } from "react-dom";

/** accidental: cómo se escribe una tecla negra. 1 = con sostenido (Sol♯), −1 = con bemol (La♭),
 *  null/0 = según la tonalidad de la canción. */
export type BassNote = { id: string; midi: number; start_beat: number | string; duration_beats: number | string; accidental?: number | null };
type Patch = { midi?: number; start_beat?: number; duration_beats?: number; accidental?: number | null };
type NewNote = { midi: number; start_beat: number; duration_beats: number; accidental?: number | null };

/** "1½ t", "2 t", "½ t" */
function fmtBeats(b: number) {
  const whole = Math.floor(b + 1e-6), half = b - whole > 0.25;
  return `${whole || (half ? "" : "0")}${half ? "½" : ""} t`;
}

/* Portapapeles del pentagrama: vive mientras la página esté abierta (sirve para copiar entre canciones). */
let CLIP: { midi: number; rel: number; dur: number; acc: number | null }[] = [];

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
export function spell(midi: number, preferFlats: boolean, accidental?: number | null) {
  const oct = Math.floor(midi / 12) - 1;
  const pc = ((midi % 12) + 12) % 12;
  let step = STEP_SEMI.indexOf(pc);
  let acc = 0;
  if (step < 0) {
    const flat = accidental === -1 ? true : accidental === 1 ? false : preferFlats;
    if (flat) { step = STEP_SEMI.indexOf(pc + 1); acc = -1; }
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
/** Sonidito de bajo: diente de sierra filtrado, ataque corto.
 *  vol 0–1 (0 = mudo). when = instante del AudioContext (para agendar con precisión). */
export function playTone(hz: number, seconds = 0.45, vol = 0.6, when?: number) {
  if (!(vol > 0)) return;
  const ctx = audioCtx();
  const t = Math.max(ctx.currentTime + 0.005, when ?? 0);
  vol = vol * 1.4;
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
  tuningSemis = 0, tuningCents = 0, preferFlats = false, volume = 0.6,
  onAdd, onUpdate, onRemove, onAddMany, onUpdateMany, onRemoveMany, toolbarTarget,
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
  /** Volumen de las notas (0–1). Suenan solas junto con la pista; 0 = mudas. */
  volume?: number;
  onAdd: (midi: number, startBeat: number, accidental?: number | null) => Promise<string | null | undefined> | void;
  onUpdate: (id: string, patch: Patch) => void;
  onRemove: (id: string) => void;
  /** Operaciones en lote (copiar/pegar/mover varias). Si faltan, se hace nota por nota. */
  onAddMany?: (list: NewNote[]) => Promise<string[] | void>;
  onUpdateMany?: (changes: { id: string; patch: Patch }[]) => void;
  onRemoveMany?: (ids: string[]) => void;
  /** Dónde va la barra de la nota elegida (♭ ♮ ♯ + datos). Si falta, flota junto a la nota. */
  toolbarTarget?: HTMLElement | null;
}) {
  const beatDur = bpm > 0 ? 60 / bpm : 0;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const volRef = useRef(volume);
  volRef.current = volume;
  const headRef = useRef<HTMLDivElement | null>(null);
  const [selIds, setSelIds] = useState<string[]>([]);
  const [drag, setDrag] = useState<{ ids: string[]; dBeat: number; dSteps: number; copy: boolean } | null>(null);
  const [box, setBox] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [resize, setResize] = useState<{ ids: string[]; dDur: number } | null>(null);
  const [clipN, setClipN] = useState(CLIP.length);
  const [hover, setHover] = useState<{ beat: number; d: number } | null>(null);

  const xOfBeat = useCallback((b: number) => (b * beatDur - offset) * pps, [beatDur, offset, pps]);
  const beatOfX = (x: number) => (x / pps + offset) / beatDur;
  const snapBeat = (b: number) => Math.max(0, Math.round(b / SNAP_BEATS) * SNAP_BEATS);
  const dOfY = (y: number) => Math.max(D_MIN, Math.min(D_MAX, Math.round(D_MAX - (y - PAD) / HALF)));

  const hzOf = useCallback((midi: number) => soundingHz(midi, tuningSemis, tuningCents), [tuningSemis, tuningCents]);
  const sound = useCallback((midi: number, beats = 0.5) => {
    playTone(hzOf(midi), Math.max(0.25, beats * beatDur), volRef.current);
  }, [hzOf, beatDur]);

  const sorted = [...notes].sort((a, b) => Number(a.start_beat) - Number(b.start_beat));

  /* ---------- playhead + reproducción junto con la pista ---------- */
  const notesRef = useRef(sorted);
  notesRef.current = sorted;
  const hzRef = useRef(hzOf);
  hzRef.current = hzOf;
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const a = getAudio();
      if (a && headRef.current) headRef.current.style.left = a.currentTime * pps + "px";
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [getAudio, pps]);

  /* ---------- las notas suenan con la pista ----------
   * Igual que el click del editor: se ancla (reloj de Web Audio, posición del
   * audio), se proyecta, y cada nota se agenda ~120 ms antes con precisión de
   * sample. Si el audio salta (seek) o se re-arranca, se re-ancla. */
  const audible = volume > 0;
  useEffect(() => {
    if (!beatDur || !audible) return;
    const ctx = audioCtx();
    let anchor: { c: number; a: number } | null = null;
    const done = new Set<string>();
    const reset = () => { anchor = null; done.clear(); };
    const a0 = getAudio();
    a0?.addEventListener("seeking", reset);
    a0?.addEventListener("play", reset);
    const iv = setInterval(() => {
      const a = getAudio();
      if (!a || a.paused) { anchor = null; return; }
      const r = a.playbackRate || 1;
      const cNow = ctx.currentTime, aNow = a.currentTime;
      if (!anchor || Math.abs(anchor.a + (cNow - anchor.c) * r - aNow) > 0.04) anchor = { c: cNow, a: aNow };
      const aEst = anchor.a + (cNow - anchor.c) * r;
      const horizon = aEst + 0.12 * r;
      for (const n of notesRef.current) {
        const nt = Number(n.start_beat) * beatDur - offset;
        if (nt > horizon) break;                       // ordenadas por tiempo
        if (nt < aEst - 0.01) continue;
        const key = `${n.id}@${n.start_beat}`;
        if (done.has(key)) continue;
        done.add(key);
        playTone(hzRef.current(n.midi), Number(n.duration_beats) * beatDur / r, volRef.current,
                 anchor.c + (nt - anchor.a) / r);
      }
    }, 25);
    return () => {
      clearInterval(iv);
      a0?.removeEventListener("seeking", reset);
      a0?.removeEventListener("play", reset);
    };
  }, [getAudio, beatDur, offset, audible]);

  /* ---------- selección múltiple ---------- */
  const selSet = new Set(selIds);
  const selRef = useRef(selIds);
  selRef.current = selIds;
  const selectOnly = (ids: string[]) => setSelIds(ids);
  const selected = () => notesRef.current.filter(n => selRef.current.includes(n.id));

  /* Una nota corrida dBeat tiempos y dSteps lugares del pentagrama (conserva su ♯/♭). */
  function moved(n: BassNote, dBeat: number, dSteps: number) {
    const sp = spell(n.midi, preferFlats, n.accidental);
    const accSemi = n.midi - naturalMidi(sp.d);
    const midi = Math.max(0, Math.min(127, naturalMidi(sp.d + dSteps) + accSemi));
    return { beat: Math.max(0, Number(n.start_beat) + dBeat), midi };
  }

  /* Monofónico: las notas que caen exactamente donde aterrizan otras se van. */
  function clearLanding(beats: number[], except: Set<string>) {
    const hit = notesRef.current
      .filter(n => !except.has(n.id) && beats.some(b => Math.abs(Number(n.start_beat) - b) < 1e-3))
      .map(n => n.id);
    if (hit.length) removeMany(hit);
  }
  const removeMany = (ids: string[]) => { if (onRemoveMany) onRemoveMany(ids); else ids.forEach(id => onRemove(id)); };
  const updateMany = (changes: { id: string; patch: Patch }[]) => {
    if (!changes.length) return;
    if (onUpdateMany) onUpdateMany(changes); else changes.forEach(c => onUpdate(c.id, c.patch));
  };
  async function addMany(list: NewNote[]): Promise<string[]> {
    if (!list.length) return [];
    if (onAddMany) { const r = await onAddMany(list); return Array.isArray(r) ? r : []; }
    const ids: string[] = [];
    for (const n of list) {
      const id = await onAdd(n.midi, n.start_beat, n.accidental ?? null);
      if (typeof id === "string" && id) ids.push(id);
    }
    return ids;
  }

  /* ---------- acciones sobre la selección ---------- */
  function shiftSel(dBeat: number, dSteps: number) {
    const sel = selected();
    if (!sel.length) return;
    const minB = Math.min(...sel.map(n => Number(n.start_beat)));
    if (minB + dBeat < 0) dBeat = -minB;
    if (!dBeat && !dSteps) return;
    const changes = sel.map(n => {
      const m = moved(n, dBeat, dSteps);
      const patch: Patch = {};
      if (dBeat) patch.start_beat = m.beat;
      if (dSteps) patch.midi = m.midi;
      return { id: n.id, patch, beat: m.beat };
    });
    clearLanding(changes.map(c => c.beat), new Set(sel.map(n => n.id)));
    updateMany(changes.map(({ id, patch }) => ({ id, patch })));
  }
  function transposeSel(semis: number, setAcc: boolean) {
    const sel = selected();
    if (!sel.length) return;
    updateMany(sel.map(n => {
      const midi = Math.max(0, Math.min(127, n.midi + semis));
      return { id: n.id, patch: setAcc ? { midi, accidental: semis > 0 ? 1 : -1 } : { midi } };
    }));
    const first = sel[0];
    sound(Math.max(0, Math.min(127, first.midi + semis)), Number(first.duration_beats));
  }
  /* Cada nota elegida dura hasta donde arranca la siguiente (línea ligada). */
  function legatoSel() {
    const sel = selected();
    const all = notesRef.current;
    const changes: { id: string; patch: Patch }[] = [];
    for (const n of sel) {
      const b = Number(n.start_beat);
      const next = all.find(x => Number(x.start_beat) > b + 1e-3);
      if (!next) continue;
      const dur = Math.max(SNAP_BEATS, Number(next.start_beat) - b);
      if (Math.abs(dur - Number(n.duration_beats)) > 1e-3) changes.push({ id: n.id, patch: { duration_beats: dur } });
    }
    updateMany(changes);
    flash(changes.length ? `↦ ${changes.length} estiradas hasta la próxima` : "ya llegaban a la próxima");
  }
  /* Manija al final de la barra: arrastrar = cambiar el largo (de a corchea).
   * Si la nota está en la selección, cambia todas por el mismo tanto. */
  function startResize(e: React.PointerEvent, n: BassNote) {
    e.preventDefault(); e.stopPropagation();
    if (e.button !== 0) return;
    const ids = selRef.current.includes(n.id) ? selRef.current : [n.id];
    if (!selRef.current.includes(n.id)) setSelIds(ids);
    const el = e.currentTarget as Element;
    el.setPointerCapture(e.pointerId);
    const p0 = local(e);
    const group = notesRef.current.filter(x => ids.includes(x.id));
    const minDur = Math.min(...group.map(x => Number(x.duration_beats)));
    let dDur = 0;
    const move = (ev: PointerEvent) => {
      const p = local(ev);
      dDur = Math.round(((p.x - p0.x) / pps / beatDur) / SNAP_BEATS) * SNAP_BEATS;
      if (minDur + dDur < SNAP_BEATS) dDur = SNAP_BEATS - minDur;
      setResize({ ids, dDur });
    };
    const up = () => {
      el.removeEventListener("pointermove", move as any);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      setResize(null);
      if (!dDur) return;
      updateMany(group.map(x => ({ id: x.id, patch: { duration_beats: Math.max(SNAP_BEATS, Number(x.duration_beats) + dDur) } })));
    };
    el.addEventListener("pointermove", move as any);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  }
  function durationSel(delta: number) {
    const sel = selected();
    updateMany(sel.map(n => ({ id: n.id, patch: { duration_beats: Math.max(SNAP_BEATS, Number(n.duration_beats) + delta) } })));
  }
  function deleteSel() {
    const ids = selRef.current;
    if (!ids.length) return;
    removeMany(ids);
    setSelIds([]);
  }
  function copySel(cut = false) {
    const sel = selected();
    if (!sel.length) return;
    const minB = Math.min(...sel.map(n => Number(n.start_beat)));
    CLIP = sel.map(n => ({ midi: n.midi, rel: Number(n.start_beat) - minB, dur: Number(n.duration_beats), acc: n.accidental ?? null }));
    setClipN(CLIP.length);
    flash(cut ? `✂ ${sel.length} cortadas` : `⧉ ${sel.length} copiadas`);
    if (cut) deleteSel();
  }
  async function pasteAt(beat: number) {
    if (!CLIP.length) return;
    const list: NewNote[] = CLIP.map(c => ({ midi: c.midi, start_beat: beat + c.rel, duration_beats: c.dur, accidental: c.acc }));
    clearLanding(list.map(n => n.start_beat), new Set());
    const ids = await addMany(list);
    if (ids.length) setSelIds(ids);
    flash(`✓ ${list.length} pegadas en comp. ${Math.floor(beat / beatsPerBar) + 1}`);
  }
  function cursorBeat() {
    const a = getAudio();
    if (!a || !beatDur) return 0;
    return snapBeat((a.currentTime + offset) / beatDur);
  }
  async function duplicateSel() {
    const sel = selected();
    if (!sel.length) return;
    const minB = Math.min(...sel.map(n => Number(n.start_beat)));
    const maxE = Math.max(...sel.map(n => Number(n.start_beat) + Number(n.duration_beats)));
    // Corre de a compases enteros: un riff de 2 compases se duplica en los 2 siguientes
    const shift = Math.max(1, Math.ceil((maxE - minB) / beatsPerBar - 1e-6)) * beatsPerBar;
    const list: NewNote[] = sel.map(n => ({ midi: n.midi, start_beat: Number(n.start_beat) + shift,
      duration_beats: Number(n.duration_beats), accidental: n.accidental ?? null }));
    clearLanding(list.map(n => n.start_beat), new Set());
    const ids = await addMany(list);
    if (ids.length) setSelIds(ids);
    flash(`✓ duplicadas ${shift / beatsPerBar} comp. más adelante`);
  }
  /* ♯ / ♭ / ♮ sobre la letra que se ve: Sol → Sol♯, Sol → Sol♭, Sol♯ → Sol.
   * Repetir el mismo botón vuelve a natural. Con varias notas, se aplica a todas. */
  function setAccidentalSel(want: 1 | -1 | 0) {
    const sel = selected();
    if (!sel.length) return;
    const allAlready = want !== 0 && sel.every(n => spell(n.midi, preferFlats, n.accidental).acc === want);
    const target = allAlready ? 0 : want;
    updateMany(sel.map(n => {
      const nat = naturalMidi(spell(n.midi, preferFlats, n.accidental).d);
      const midi = Math.max(0, Math.min(127, nat + target));
      return { id: n.id, patch: { midi, accidental: target === 0 ? null : target } };
    }));
    if (sel.length === 1) sound(naturalMidi(spell(sel[0].midi, preferFlats, sel[0].accidental).d) + target, Number(sel[0].duration_beats));
  }

  const [msg, setMsg] = useState<string | null>(null);
  const msgT = useRef<any>(null);
  function flash(m: string) { setMsg(m); clearTimeout(msgT.current); msgT.current = setTimeout(() => setMsg(null), 1800); }

  /* ---------- teclado ---------- */
  const hoverStaff = useRef(false);
  const actionsRef = useRef({ shiftSel, transposeSel, durationSel, deleteSel, copySel, pasteAt, cursorBeat, duplicateSel, setAccidentalSel, legatoSel });
  actionsRef.current = { shiftSel, transposeSel, durationSel, deleteSel, copySel, pasteAt, cursorBeat, duplicateSel, setAccidentalSel, legatoSel };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement;
      if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.tagName === "SELECT" || tgt.isContentEditable)) return;
      const A = actionsRef.current;
      const mod = e.metaKey || e.ctrlKey;
      const has = selRef.current.length > 0;
      const k = e.key.toLowerCase();
      const eat = () => { e.preventDefault(); e.stopPropagation(); };
      // Pegar funciona sin selección (va al cursor de reproducción)
      if (mod && k === "v" && CLIP.length) { eat(); A.pasteAt(A.cursorBeat()); return; }
      if (mod && k === "a" && (hoverStaff.current || has)) { eat(); setSelIds(notesRef.current.map(n => n.id)); return; }
      if (!has) return;
      if (mod && k === "c") { eat(); A.copySel(false); }
      else if (mod && k === "x") { eat(); A.copySel(true); }
      else if (mod && k === "d") { eat(); A.duplicateSel(); }
      else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        eat();
        const up = e.key === "ArrowUp";
        // Subiendo se escribe con sostenido, bajando con bemol (como en los editores de partitura)
        A.transposeSel((up ? 1 : -1) * (e.shiftKey ? 12 : 1), !e.shiftKey);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        eat();
        A.shiftSel((e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? beatsPerBar : SNAP_BEATS), 0);
      } else if (!mod && !e.altKey && (e.key === "#" || k === "s")) { eat(); A.setAccidentalSel(1); }
      else if (!mod && !e.altKey && k === "b") { eat(); A.setAccidentalSel(-1); }
      else if (!mod && !e.altKey && k === "n") { eat(); A.setAccidentalSel(0); }
      else if (!mod && !e.altKey && k === "l") { eat(); A.legatoSel(); }
      else if (e.key === "Delete" || e.key === "Backspace") { eat(); A.deleteSel(); }
      else if (e.key === "-" || e.key === "=" || e.key === "+") { eat(); A.durationSel(e.key === "-" ? -SNAP_BEATS : SNAP_BEATS); }
      else if (e.key === "Escape") { setSelIds([]); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [beatsPerBar]);

  /* ---------- mouse ---------- */
  const local = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  /* Fondo: click = nota nueva · arrastrar = recuadro de selección (shift/⌘ suma). */
  function onBackgroundDown(e: React.PointerEvent) {
    if (!beatDur || e.button !== 0) return;
    const el = e.currentTarget as Element;
    el.setPointerCapture(e.pointerId);
    const p0 = local(e);
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    const mods = { shift: e.shiftKey, alt: e.altKey };
    let boxing = false;
    const move = (ev: PointerEvent) => {
      const p = local(ev);
      if (!boxing && Math.hypot(p.x - p0.x, p.y - p0.y) < 5) return;
      boxing = true;
      setBox({ x0: p0.x, y0: p0.y, x1: p.x, y1: p.y });
    };
    const up = (ev: PointerEvent) => {
      el.removeEventListener("pointermove", move as any);
      el.removeEventListener("pointerup", up as any);
      el.removeEventListener("pointercancel", up as any);
      setBox(null);
      const p = local(ev);
      if (boxing) {
        const [xa, xb] = [Math.min(p0.x, p.x), Math.max(p0.x, p.x)];
        const [ya, yb] = [Math.min(p0.y, p.y), Math.max(p0.y, p.y)];
        const inside = notesRef.current.filter(n => {
          const x = xOfBeat(Number(n.start_beat));
          const y = yOfD(Math.max(D_MIN, Math.min(D_MAX, spell(n.midi, preferFlats, n.accidental).d)));
          return x >= xa - 6 && x <= xb + 6 && y >= ya - 4 && y <= yb + 4;
        }).map(n => n.id);
        setSelIds(prev => additive ? Array.from(new Set([...prev, ...inside])) : inside);
        return;
      }
      // Click suelto: con varias elegidas, solo deselecciona (para no meter notas sin querer)
      if (selRef.current.length > 1) { setSelIds([]); return; }
      addAt(p, mods);
    };
    el.addEventListener("pointermove", move as any);
    el.addEventListener("pointerup", up as any);
    el.addEventListener("pointercancel", up as any);
  }

  async function addAt(p: { x: number; y: number }, mods: { shift: boolean; alt: boolean }) {
    const beat = snapBeat(beatOfX(p.x));
    const acc = mods.shift ? 1 : mods.alt ? -1 : 0;
    const midi = naturalMidi(dOfY(p.y)) + acc;
    sound(midi);
    // Monofónico: si ya hay una nota en esa corchea, se le cambia la altura
    const there = notesRef.current.find(n => Math.abs(Number(n.start_beat) - beat) < 1e-3);
    if (there) { onUpdate(there.id, { midi, accidental: acc || null }); selectOnly([there.id]); return; }
    const id = await onAdd(midi, beat, acc || null);
    if (typeof id === "string" && id) selectOnly([id]);
  }

  /* Nota: click = elegirla (shift/⌘ suma o saca) · arrastrar = mover toda la selección
   * (tiempo + altura) · alt + arrastrar = copiar. */
  function startNoteDrag(e: React.PointerEvent, n: BassNote) {
    e.preventDefault(); e.stopPropagation();
    if (e.button !== 0) return;
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    const wasSel = selRef.current.includes(n.id);
    if (additive) {
      setSelIds(prev => prev.includes(n.id) ? prev.filter(x => x !== n.id) : [...prev, n.id]);
      sound(n.midi, Number(n.duration_beats));
      return;
    }
    const ids = wasSel ? selRef.current : [n.id];
    if (!wasSel) setSelIds(ids);
    const el = e.currentTarget as Element;
    el.setPointerCapture(e.pointerId);
    const p0 = local(e);
    const copy = e.altKey;
    const group = notesRef.current.filter(x => ids.includes(x.id));
    const minB = Math.min(...group.map(x => Number(x.start_beat)));
    let dragged = false;
    let cur = { dBeat: 0, dSteps: 0 };
    const move = (ev: PointerEvent) => {
      const p = local(ev);
      if (!dragged && Math.hypot(p.x - p0.x, p.y - p0.y) < 3) return;
      dragged = true;
      let dBeat = Math.round(((p.x - p0.x) / pps / beatDur) / SNAP_BEATS) * SNAP_BEATS;
      if (minB + dBeat < 0) dBeat = -minB;
      const dSteps = Math.round(-(p.y - p0.y) / HALF);
      if (dSteps !== cur.dSteps) sound(moved(n, 0, dSteps).midi);
      cur = { dBeat, dSteps };
      setDrag({ ids, dBeat, dSteps, copy });
    };
    const up = async () => {
      el.removeEventListener("pointermove", move as any);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      setDrag(null);
      if (!dragged) {
        sound(n.midi, Number(n.duration_beats));
        if (wasSel && ids.length > 1) setSelIds([n.id]);       // click en una de varias: queda esa sola
        return;
      }
      if (!cur.dBeat && !cur.dSteps) return;
      if (copy) {
        const list: NewNote[] = group.map(x => {
          const m = moved(x, cur.dBeat, cur.dSteps);
          return { midi: m.midi, start_beat: m.beat, duration_beats: Number(x.duration_beats), accidental: x.accidental ?? null };
        });
        clearLanding(list.map(l => l.start_beat), new Set(ids));
        const newIds = await addMany(list);
        if (newIds.length) setSelIds(newIds);
        flash(`✓ ${list.length} copiadas`);
      } else {
        const changes = group.map(x => {
          const m = moved(x, cur.dBeat, cur.dSteps);
          const patch: Patch = {};
          if (cur.dBeat) patch.start_beat = m.beat;
          if (cur.dSteps) patch.midi = m.midi;
          return { id: x.id, patch, beat: m.beat };
        });
        clearLanding(changes.map(c => c.beat), new Set(ids));
        updateMany(changes.map(({ id, patch }) => ({ id, patch })));
      }
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
  const selNotes = sorted.filter(n => selSet.has(n.id));
  const sel1 = selNotes.length === 1 ? selNotes[0] : null;
  const top = yOfD(STAFF_D[4]);
  const bottom = yOfD(STAFF_D[0]);

  const drawNote = (key: string, n: BassNote, beat: number, midi: number, color: string, opacity = 1, interactive = true) => {
    const sp = spell(midi, preferFlats, n.accidental);
    const x = xOfBeat(beat);
    const y = yOfD(Math.max(D_MIN, Math.min(D_MAX, sp.d)));
    const durNow = Number(n.duration_beats) + (resize && resize.ids.includes(n.id) ? resize.dDur : 0);
    const len = durNow * beatDur * pps;
    const isSelN = selSet.has(n.id);
    const ledgers: number[] = [];
    for (let d = 16; d >= sp.d; d -= 2) ledgers.push(d);
    for (let d = 28; d <= sp.d; d += 2) ledgers.push(d);
    return (
      <g key={key} opacity={opacity} style={{ cursor: interactive ? "grab" : undefined }}
         pointerEvents={interactive ? undefined : "none"}
         onPointerDown={interactive ? (e => startNoteDrag(e, n)) : undefined}>
        <rect x={x} y={y - 2} width={Math.max(0, len - 2)} height={4} rx={2} fill={color} opacity={isSelN ? 0.55 : 0.32} />
        {ledgers.map(d => (
          <line key={d} x1={x - 9} x2={x + 9} y1={yOfD(d)} y2={yOfD(d)} stroke={color} strokeWidth={1} />
        ))}
        {sp.acc !== 0 && (
          <text x={x - 16} y={y + 4} fontSize={12} fill={color} fontWeight={700}>{sp.acc > 0 ? "♯" : "♭"}</text>
        )}
        <ellipse cx={x} cy={y} rx={5.5} ry={4} transform={`rotate(-20 ${x} ${y})`} fill={color} />
        {/* zona de agarre más grande que la cabeza */}
        <rect x={x - 9} y={y - 7} width={18} height={14} fill="transparent" />
        {/* manija para estirar/achicar: al final de la barra */}
        {interactive && (
          <g style={{ cursor: "ew-resize" }} onPointerDown={e => startResize(e, n)}>
            <rect x={x + Math.max(10, len - 2) - 5} y={y - 8} width={11} height={16} fill="transparent" />
            <rect x={x + Math.max(10, len - 2) - 1.5} y={y - 5} width={3} height={10} rx={1.5}
                  fill={color} opacity={isSelN ? 0.95 : 0.45} />
          </g>
        )}
        {resize && resize.ids.includes(n.id) && (
          <text x={x + len + 6} y={y - 7} fontSize={10} fontWeight={700} fill="#ffffff" fontFamily="ui-monospace, monospace">
            {fmtBeats(durNow)}
          </text>
        )}
      </g>
    );
  };

  return (
    <div className="relative border-t border-neutral-800" style={{ height: H, userSelect: "none", WebkitUserSelect: "none" }}
         onMouseEnter={() => { hoverStaff.current = true; }}
         onMouseLeave={() => { hoverStaff.current = false; }}>
      {/* Clave de fa, siempre visible al scrollear */}
      <div className="pointer-events-none" style={{ position: "sticky", left: 0, width: 0, height: H, zIndex: 3 }}>
        <span style={{ position: "absolute", left: 4, top: top - 9, fontSize: 40, lineHeight: 1, color: "rgba(212,212,212,0.28)" }}>𝄢</span>
      </div>
      <svg ref={svgRef} width={fullW} height={H} className="absolute top-0 left-0"
           style={{ cursor: beatDur ? "crosshair" : "default", touchAction: "none" }}
           onPointerDown={e => { if (e.target === e.currentTarget || (e.target as Element).getAttribute("data-bg")) onBackgroundDown(e); }}
           onMouseMove={e => {
             if (!beatDur) return;
             const { x, y } = local(e);
             setHover({ beat: snapBeat(beatOfX(x)), d: dOfY(y) });
           }}
           onMouseLeave={() => setHover(null)}>
        <g data-bg="1" pointerEvents="none">
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
        </g>

        {/* fantasma bajo el mouse */}
        {hover && !drag && !box && (() => {
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
          const isSel = selSet.has(n.id);
          const color = isSel ? "#ffffff" : NOTE_COLOR;
          if (drag && drag.ids.includes(n.id)) {
            const m = moved(n, drag.dBeat, drag.dSteps);
            return (
              <g key={n.id}>
                {/* original: tenue si se mueve, normal si se copia */}
                {drawNote(`o-${n.id}`, n, Number(n.start_beat), n.midi, drag.copy ? NOTE_COLOR : color, drag.copy ? 1 : 0.25, false)}
                {drawNote(`m-${n.id}`, n, m.beat, m.midi, "#ffffff", 0.9, false)}
              </g>
            );
          }
          return drawNote(n.id, n, Number(n.start_beat), n.midi, color);
        })}

        {/* recuadro de selección */}
        {box && (
          <rect x={Math.min(box.x0, box.x1)} y={Math.min(box.y0, box.y1)}
                width={Math.abs(box.x1 - box.x0)} height={Math.abs(box.y1 - box.y0)}
                fill="rgba(251,191,36,0.10)" stroke="rgba(251,191,36,0.7)" strokeDasharray="4 3" pointerEvents="none" />
        )}
      </svg>

      {/* Barra de la selección: ♭ ♮ ♯ + datos + copiar/pegar/duplicar/borrar.
          Va afuera del pentagrama (toolbarTarget) para no tapar notas. */}
      {(() => {
        const n = selNotes.length;
        const accNow = n ? (selNotes.every(x => spell(x.midi, preferFlats, x.accidental).acc === spell(selNotes[0].midi, preferFlats, selNotes[0].accidental).acc)
          ? spell(selNotes[0].midi, preferFlats, selNotes[0].accidental).acc : 99) : 99;
        const btn = (label: React.ReactNode, title: string, onClick: () => void, opts: { active?: boolean; disabled?: boolean; wide?: boolean; danger?: boolean } = {}) => (
          <button disabled={opts.disabled}
                  onPointerDown={e => e.stopPropagation()}
                  onClick={e => { e.stopPropagation(); onClick(); }}
                  title={title}
                  className={`${opts.wide ? "px-2" : "w-7"} h-7 rounded-md leading-none font-black disabled:opacity-30 ${
                    opts.wide ? "text-[11px]" : "text-[15px]"} ${
                    opts.active ? "bg-amber-300 text-black"
                    : opts.danger ? "bg-neutral-800 text-red-300 hover:bg-red-500/30"
                    : "bg-neutral-800 text-neutral-200 hover:bg-neutral-700"}`}>
            {label}
          </button>
        );
        let info: React.ReactNode = (
          <span className="text-neutral-500">click: elegir · arrastrar el fondo: elegir varias · shift/⌘+click: sumar</span>
        );
        if (sel1) {
          const sp = spell(sel1.midi, preferFlats, sel1.accidental);
          const beat = Number(sel1.start_beat);
          const bar = Math.floor(beat / beatsPerBar) + 1;
          const inBar = beat - (bar - 1) * beatsPerBar;
          info = (
            <span className="text-neutral-200">
              <b className="text-amber-300 text-sm">{sp.name}{sp.oct}</b>
              <span className="text-neutral-500"> · comp. {bar}.{(inBar + 1).toString().replace(".5", "½")} · dura </span>
              <b className="text-neutral-200">{fmtBeats(Number(sel1.duration_beats))}</b>
              <span className="text-neutral-500"> · suena {hzOf(sel1.midi).toFixed(1)} Hz</span>
            </span>
          );
        } else if (n > 1) {
          const b0 = Math.min(...selNotes.map(x => Number(x.start_beat)));
          const b1 = Math.max(...selNotes.map(x => Number(x.start_beat)));
          info = (
            <span className="text-neutral-200">
              <b className="text-amber-300 text-sm">{n} notas</b>
              <span className="text-neutral-500"> · comp. {Math.floor(b0 / beatsPerBar) + 1}–{Math.floor(b1 / beatsPerBar) + 1}</span>
            </span>
          );
        }
        const barEl = (
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-amber-400/25 bg-amber-400/5 px-2 py-1.5 font-mono text-[11px]"
               onClick={e => e.stopPropagation()}>
            <span className="text-amber-300 mr-1">𝄢</span>
            {btn("♭", "Bemol (tecla B)", () => setAccidentalSel(-1), { active: accNow === -1, disabled: !n })}
            {btn("♮", "Natural (tecla N)", () => setAccidentalSel(0), { active: accNow === 0, disabled: !n })}
            {btn("♯", "Sostenido (tecla # o S)", () => setAccidentalSel(1), { active: accNow === 1, disabled: !n })}
            <span className="ml-2 truncate min-w-0">{info}</span>
            <span className="flex-1" />
            {msg && <span className="text-green-400 mr-1">{msg}</span>}
            {btn("−", "Más corta, una corchea (tecla −)", () => durationSel(-SNAP_BEATS), { disabled: !n })}
            {btn("+", "Más larga, una corchea (tecla =)", () => durationSel(SNAP_BEATS), { disabled: !n })}
            {btn("↦ Hasta la próxima", "Estirar cada nota elegida hasta donde arranca la siguiente (tecla L)", () => legatoSel(), { wide: true, disabled: !n })}
            {btn("⧉ Copiar", "Copiar (⌘C)", () => copySel(false), { wide: true, disabled: !n })}
            {btn(`⎘ Pegar${clipN ? ` (${clipN})` : ""}`, "Pegar en el cursor de reproducción (⌘V)", () => pasteAt(cursorBeat()), { wide: true, disabled: !clipN })}
            {btn("⧺ Duplicar", "Duplicar a continuación, de a compases enteros (⌘D)", () => duplicateSel(), { wide: true, disabled: !n })}
            {btn("✕ Borrar", "Borrar (Supr)", () => deleteSel(), { wide: true, disabled: !n, danger: true })}
          </div>
        );
        if (toolbarTarget) return createPortal(barEl, toolbarTarget);
        if (!n) return null;
        return <div className="absolute" style={{ left: 40, bottom: 4, zIndex: 7 }}>{barEl}</div>;
      })()}

      {/* playhead */}
      <div ref={headRef} className="absolute top-0 pointer-events-none"
           style={{ left: 0, width: 2, height: H, background: "rgba(255,255,255,0.8)", zIndex: 4 }} />
    </div>
  );
}
