"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-client";
import Link from "next/link";
import { parseMidiFile, describeEvent, type MidiEvent } from "@/lib/midi-file";
import WaveformLyricsEditor from "@/components/WaveformLyricsEditor";
import BassStaff, { playTone, soundingHz } from "@/components/BassStaff";

const FLAT_KEYS = new Set(["F","Bb","Eb","Ab","Db","Gb","Dm","Gm","Cm","Fm","Bbm","Ebm"]);

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
function noteNumToName(n: number) { return NOTE_NAMES[n%12] + (Math.floor(n/12)-1); }
function noteNameToNum(s: string): number | null {
  const m = s.trim().match(/^([A-G])([#b]?)(-?\d+)$/i);
  if (!m) return null;
  const base = ({C:0,D:2,E:4,F:5,G:7,A:9,B:11} as any)[m[1].toUpperCase()];
  let n = base + (m[2]==='#'?1: m[2]==='b'?-1 : 0);
  return n + (parseInt(m[3],10)+1)*12;
}

// ============================================================================
// MIDI file generator — convierte cues en .mid descargable
// ============================================================================
function encodeVariableLength(value: number): number[] {
  if (value < 0) value = 0;
  const bytes = [value & 0x7F];
  value >>= 7;
  while (value > 0) {
    bytes.unshift((value & 0x7F) | 0x80);
    value >>= 7;
  }
  return bytes;
}

function generateMidiFile(
  cues: Array<{ midi_note: number; jump_to_seconds: number; label: string }>,
  bpm: number,
  channel: number = 2,
  trackName: string = 'CAMARAGE Cues'
): Uint8Array {
  const PPQ = 480; // pulses per quarter note (estándar Logic Pro)
  const microsPerBeat = Math.round(60000000 / bpm);
  const ticksPerSecond = (bpm / 60) * PPQ;
  const noteDuration = PPQ; // cada cue dura 1 negra

  const sorted = [...cues]
    .filter(c => c.midi_note >= 0 && c.midi_note <= 127)
    .sort((a, b) => Number(a.jump_to_seconds) - Number(b.jump_to_seconds));

  // Build events with ABSOLUTE ticks (desde tiempo 0 de la canción).
  // El usuario arrastra el .mid al BAR donde arranca la canción en Logic
  // (ej: bar 600). Así las notas se posicionan en sus bars correctos según
  // el tiempo de cada lyric (ej: lyric a 31s = bar 16 a 120 BPM = bar 615
  // de Logic cuando se suelta en bar 600).
  type MidiEvent = { tick: number; bytes: number[]; order: number };
  const events: MidiEvent[] = [];
  let order = 0;

  // Track name event (FF 03 len text)
  const nameBytes = Array.from(new TextEncoder().encode(trackName));
  events.push({ tick: 0, bytes: [0xFF, 0x03, nameBytes.length, ...nameBytes], order: order++ });

  // Tempo event at time 0
  events.push({ tick: 0, bytes: [0xFF, 0x51, 0x03,
    (microsPerBeat >> 16) & 0xFF,
    (microsPerBeat >> 8) & 0xFF,
    microsPerBeat & 0xFF], order: order++ });

  // Note On / Note Off para cada cue, en posición ABSOLUTA desde song-time-0
  const channelByte = (channel - 1) & 0x0F;
  for (const cue of sorted) {
    const tick = Math.round(Number(cue.jump_to_seconds) * ticksPerSecond);
    events.push({ tick, bytes: [0x90 | channelByte, cue.midi_note, 80], order: order++ });
    events.push({ tick: tick + noteDuration, bytes: [0x80 | channelByte, cue.midi_note, 64], order: order++ });
  }

  // Sort by tick, keep order for ties
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);

  // End of track
  const lastTick = events.length ? events[events.length - 1].tick + PPQ : PPQ;
  events.push({ tick: lastTick, bytes: [0xFF, 0x2F, 0x00], order: order++ });

  // Build track data
  const trackData: number[] = [];
  let prevTick = 0;
  for (const evt of events) {
    const delta = Math.max(0, evt.tick - prevTick);
    trackData.push(...encodeVariableLength(delta));
    trackData.push(...evt.bytes);
    prevTick = evt.tick;
  }

  // Header chunk
  const header = [
    0x4D, 0x54, 0x68, 0x64,       // "MThd"
    0x00, 0x00, 0x00, 0x06,       // length 6
    0x00, 0x00,                    // format 0
    0x00, 0x01,                    // 1 track
    (PPQ >> 8) & 0xFF, PPQ & 0xFF, // PPQ
  ];

  // Track chunk
  const trackChunk = [
    0x4D, 0x54, 0x72, 0x6B,       // "MTrk"
    (trackData.length >> 24) & 0xFF,
    (trackData.length >> 16) & 0xFF,
    (trackData.length >> 8) & 0xFF,
    trackData.length & 0xFF,
    ...trackData,
  ];

  return new Uint8Array([...header, ...trackChunk]);
}

// Genera texto en el formato EXACTO de Logic Event List (cuando copiás notas).
// Cada nota = 2 líneas: principal + "Rel Vel". Tabs y ♯ Unicode (no #).
function generateLogicEventListText(
  cues: Array<{ midi_note: number; jump_to_seconds: number; label: string }>,
  bpm: number,
  channel: number = 2,
  beatsPerBar: number = 4
): string {
  const sorted = [...cues]
    .filter(c => c.midi_note >= 0 && c.midi_note <= 127)
    .sort((a, b) => Number(a.jump_to_seconds) - Number(b.jump_to_seconds));

  // Logic usa ♯ Unicode, no # ASCII.
  // CRÍTICO: Logic usa convención Yamaha (Middle C = C3 = MIDI 60).
  // Mi app usa convención estándar (Middle C = C4 = MIDI 60).
  // Para que Logic envíe la nota MIDI que el cue espera, escribir el
  // nombre en la convención Yamaha = 1 octava más baja que la estándar.
  const noteNames = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
  const noteName = (n: number) => noteNames[n % 12] + (Math.floor(n / 12) - 2);

  // Posiciones ABSOLUTAS desde tiempo 0 de la canción. El usuario debe
  // pegar/soltar en Logic en el bar donde arranca la canción (no donde está
  // la primera lyric — eso ya está calculado según el tiempo de cada frase).
  const lines: string[] = [];
  for (const cue of sorted) {
    const sec = Number(cue.jump_to_seconds);
    const totalBeats = (sec / 60) * bpm;
    // Bar (1-based), Beat (1-based), Division (1-based, 16ths = 4 por beat), Tick (1-240)
    const bar = Math.floor(totalBeats / beatsPerBar) + 1;
    const beatInBar = totalBeats - (bar - 1) * beatsPerBar;
    const beat = Math.floor(beatInBar) + 1;
    const subBeat = beatInBar - Math.floor(beatInBar);
    const division = Math.floor(subBeat * 4) + 1;
    const subDiv = subBeat * 4 - Math.floor(subBeat * 4);
    const tick = Math.round(subDiv * 240) + 1;

    // Formato Logic Event List exacto (matchea tu ejemplo):
    //  \t  \t POSITION \t Note\t CH\t PITCH\t VEL\t LENGTH\t
    //  \t\t\t Rel Vel\t\t\t 64\t\t
    lines.push(` \t  \t ${bar} ${beat} ${division} ${tick} \t Note\t ${channel}\t ${noteName(cue.midi_note)}\t 80\t 5 0 1 0\t`);
    lines.push(`\t\t\t Rel Vel\t\t\t 64\t\t`);
  }
  return lines.join('\n');
}

// Parse "1:30", "1:30.5", "90", "90.5" → segundos. Tolera espacios y formatos mezclados.
function parseTimeInput(value: string): number {
  if (!value) return 0;
  const v = value.toString().trim();
  if (v.includes(':')) {
    const parts = v.split(':');
    const min = parseFloat(parts[0]) || 0;
    const sec = parseFloat(parts[1]) || 0;
    return min * 60 + sec;
  }
  return parseFloat(v) || 0;
}
// Formatea segundos → "mm:ss" si >= 60, sino "ss". Conserva decimales.
function formatTime(seconds: number): string {
  if (seconds == null) return '0';
  const s = Number(seconds);
  if (s < 60) return Number.isInteger(s) ? String(s) : s.toString();
  const min = Math.floor(s / 60);
  const sec = s - min * 60;
  const secStr = Number.isInteger(sec)
    ? sec.toString().padStart(2, '0')
    : sec.toFixed(1).padStart(4, '0');
  return `${min}:${secStr}`;
}

/* Cifrado: "Am7" → raíz A + calidad m7. La app del escenario muestra
 * raíz + calidad, así que esos dos campos se derivan SIEMPRE del símbolo. */
function parseChordSymbol(raw: string) {
  const sym = String(raw || "").trim().replace(/\s+/g, "");
  const m = sym.match(/^([A-Ga-g])([#b♯♭]?)(.*)$/);
  if (!m) return { chord_symbol: sym || "?", root_note: sym || "?", quality: "" };
  const acc = m[2] === "♯" ? "#" : m[2] === "♭" ? "b" : m[2];
  const root = m[1].toUpperCase() + acc;
  const quality = m[3];
  return { chord_symbol: root + quality, root_note: root, quality };
}
const chordShown = (c: any) => `${c.root_note ?? ""}${c.quality ?? ""}`;

/* Clase de altura (0–11) de una raíz escrita: "A", "Bb", "F#", "B♭"… */
function pitchClassOf(root: string): number | null {
  const m = String(root || "").trim().match(/^([A-Ga-g])([#b♯♭]?)/);
  if (!m) return null;
  const base = ({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 } as any)[m[1].toUpperCase()];
  const acc = m[2] === "#" || m[2] === "♯" ? 1 : m[2] === "b" || m[2] === "♭" ? -1 : 0;
  return (base + acc + 12) % 12;
}
const ROOTS_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const ROOTS_FLAT  = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

export default function SongEditor() {
  const supabase = createClient();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [song, setSong] = useState<any>(null);
  const [lyrics, setLyrics] = useState<any[]>([]);
  const [cues, setCues] = useState<any[]>([]);
  const [chords, setChords] = useState<any[]>([]);
  const chordsRef = useRef<any[]>([]);
  chordsRef.current = chords;
  // --- Pentagrama del bajo ---
  const [bassNotes, setBassNotes] = useState<any[]>([]);
  const bassNotesRef = useRef<any[]>([]);
  bassNotesRef.current = bassNotes;
  const chordSyncTimer = useRef<any>(null);
  const chordSyncBusy = useRef<Promise<void>>(Promise.resolve());
  const [bassNotesErr, setBassNotesErr] = useState<string | null>(null);
  // Volumen de las notas del pentagrama (0 = mudas), recordado en este navegador
  const [staffVol, setStaffVol] = useState(0.6);
  useEffect(() => {
    try { const v = parseFloat(localStorage.getItem("camarage.staff.vol") || ""); if (v >= 0 && v <= 1) setStaffVol(v); } catch {}
  }, []);
  function changeStaffVol(v: number) {
    setStaffVol(v);
    try { localStorage.setItem("camarage.staff.vol", String(v)); } catch {}
  }
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"meta"|"lyrics"|"cues"|"chords"|"audio"|"midiout">("meta");
  // --- Pistas de audio ---
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [audioErr, setAudioErr] = useState<string|null>(null);
  const [previewUrl, setPreviewUrl] = useState<string|null>(null);
  // --- Eventos MIDI salientes ---
  const [midiEvents, setMidiEvents] = useState<any[]>([]);
  const [midiPreview, setMidiPreview] = useState<{ eventos: MidiEvent[]; nombre: string } | null>(null);
  const [midiTarget, setMidiTarget] = useState("master");
  const [midiErr, setMidiErr] = useState<string|null>(null);
  const [midiBusy, setMidiBusy] = useState(false);
  // --- Modo "marcar tiempos" ---
  const [tapOn, setTapOn] = useState(false);
  const [tapIdx, setTapIdx] = useState(0);
  const [tapUrl, setTapUrl] = useState<string|null>(null);
  const [tapPos, setTapPos] = useState(0);
  const [tapMarks, setTapMarks] = useState<Record<string, number>>({});
  const [tapErr, setTapErr] = useState<string|null>(null);
  const tapAudio = useRef<HTMLAudioElement|null>(null);
  // --- Editor de onda (estilo SoundCloud) ---
  const [waveUrl, setWaveUrl] = useState<string|null>(null);
  const [waveUrlErr, setWaveUrlErr] = useState<string|null>(null);

  useEffect(() => { if (id) load(); }, [id]);

  // URL firmada de la pista para el editor de onda (se pide al entrar a Letras)
  useEffect(() => {
    if ((tab !== "lyrics" && tab !== "chords") || !song?.audio_path || waveUrl) return;
    supabase.storage.from(AUDIO_BUCKET).createSignedUrl(song.audio_path, 3600)
      .then(({ data, error }) => {
        if (error) setWaveUrlErr(error.message);
        else setWaveUrl(data?.signedUrl || null);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, song?.audio_path]);

  async function load() {
    const { data: s } = await supabase.from("songs").select("*").eq("id", id).single();
    setSong(s);
    const { data: l } = await supabase.from("lyric_lines").select("*").eq("song_id", id).order("order_index");
    setLyrics(l || []);
    const { data: c } = await supabase.from("midi_cues").select("*").eq("song_id", id).order("order_index");
    setCues(c || []);
    const { data: ch } = await supabase.from("chord_charts").select("*").eq("song_id", id).order("order_index");
    setChords(ch || []);
    // Si la tabla no existe todavía (falta la migración) se avisa, sin romper el resto
    const { data: bn, error: bnErr } = await supabase.from("bass_notes").select("*").eq("song_id", id).order("start_beat");
    setBassNotes((bn || []).map((n: any) => ({ ...n, start_beat: Number(n.start_beat), duration_beats: Number(n.duration_beats) })));
    setBassNotesErr(bnErr ? bnErr.message : null);
    const { data: me } = await supabase.from("midi_events").select("*").eq("song_id", id).order("time_seconds");
    setMidiEvents(me || []);
  }

  /* ===================== EVENTOS MIDI SALIENTES =====================
   * El .mid exportado de Logic se traduce acá mismo, en el navegador, a
   * eventos con tiempo absoluto en segundos. Nada se sube a Storage: van
   * como filas a la base, que es lo que después agenda la app.
   * ================================================================== */
  const TARGETS = [
    { v: "master",    l: "El que reproduce (master)" },
    { v: "guitarist", l: "Dispositivo del guitarrista" },
    { v: "bassist",   l: "Dispositivo del bajista" },
    { v: "drummer",   l: "Dispositivo del baterista" },
    { v: "singer",    l: "Dispositivo del cantante" },
    { v: "keys",      l: "Dispositivo del tecladista" },
  ];

  async function elegirMidi(file: File) {
    setMidiErr(null);
    setMidiPreview(null);
    try {
      const buf = await file.arrayBuffer();
      const r = parseMidiFile(buf);
      if (!r.events.length) {
        setMidiErr("El archivo no trae ningún Program Change, CC ni nota. ¿Exportaste la región correcta?");
        return;
      }
      setMidiPreview({ eventos: r.events, nombre: file.name });
    } catch (e: any) {
      setMidiErr(e?.message || String(e));
    }
  }

  async function confirmarImportMidi(reemplazar: boolean) {
    if (!midiPreview) return;
    setMidiBusy(true);
    setMidiErr(null);
    try {
      if (reemplazar) await supabase.from("midi_events").delete().eq("song_id", id);
      const filas = midiPreview.eventos.map(e => ({
        song_id: id,
        time_seconds: e.timeSeconds,
        kind: e.kind,
        channel: e.channel,
        data1: e.data1,
        data2: e.data2,
        label: e.trackName || null,
        target: midiTarget,
        source: midiPreview.nombre,
      }));
      // De a tandas, por si el .mid trae cientos de eventos
      for (let i = 0; i < filas.length; i += 200) {
        const { error } = await supabase.from("midi_events").insert(filas.slice(i, i + 200));
        if (error) throw error;
      }
      setMidiPreview(null);
      await load();
    } catch (e: any) {
      const msg = e?.message || String(e);
      setMidiErr(/midi_events/.test(msg) && /exist/i.test(msg)
        ? "Falta la tabla midi_events. Corré migration_midi_events.sql en Supabase."
        : msg);
    } finally {
      setMidiBusy(false);
    }
  }

  async function borrarEvento(evId: string) {
    await supabase.from("midi_events").delete().eq("id", evId);
    setMidiEvents(midiEvents.filter(e => e.id !== evId));
  }
  async function borrarTodosLosEventos() {
    if (!confirm(`¿Borrar los ${midiEvents.length} eventos MIDI de esta canción?`)) return;
    await supabase.from("midi_events").delete().eq("song_id", id);
    setMidiEvents([]);
  }
  async function cambiarTarget(evId: string, target: string) {
    await supabase.from("midi_events").update({ target }).eq("id", evId);
    setMidiEvents(midiEvents.map(e => e.id === evId ? { ...e, target } : e));
  }
  function fmtT(sec: number) {
    const s = Number(sec) || 0;
    return Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0") + "." + String(Math.round((s % 1) * 10));
  }
  function describeRow(e: any): string {
    const ch = `ch${(e.channel ?? 0) + 1}`;
    if (e.kind === "pc") return `Program Change ${e.data1} · ${ch}`;
    if (e.kind === "cc") return `CC${e.data1} = ${e.data2} · ${ch}`;
    return `Nota ${e.data1} ${e.kind === "note_on" ? "on" : "off"} · ${ch}`;
  }

  async function saveSong() {
    setSaving(true);
    await supabase.from("songs").update({
      title: song.title, key: song.key, bpm: song.bpm,
      time_signature: song.time_signature, program_change: song.program_change,
      artist: song.artist, notes: song.notes,
    }).eq("id", id);
    setSaving(false);
  }

  /* ===================== MODO "MARCAR TIEMPOS" =====================
   * Los tiempos de las letras salieron de Whisper y algunos están corridos.
   * Corregir 39 líneas escribiendo mm:ss a mano es un suplicio; marcándolas al
   * ritmo mientras suena la pista son tres minutos.
   *
   * Detalle que importa: se guarda `audio.currentTime + offset − reacción`.
   *   · + offset   → así queda en la misma referencia que usa la app para buscar
   *                  la línea (posición del audio + offset de la canción).
   *   · − reacción → uno aprieta DESPUÉS de escuchar la frase. Sin compensar,
   *                  todas las líneas quedan sistemáticamente tarde.
   * ================================================================ */
  const [tapReaccion, setTapReaccion] = useState(0.15);

  async function abrirTap() {
    setTapErr(null);
    if (!song?.audio_path) { setTapErr("Esta canción no tiene pista subida. Subila en la solapa Audio."); return; }
    if (!lyrics.length)    { setTapErr("Esta canción no tiene letras cargadas."); return; }
    const { data, error } = await supabase.storage.from(AUDIO_BUCKET).createSignedUrl(song.audio_path, 3600);
    if (error) { setTapErr(error.message); return; }
    setTapUrl(data?.signedUrl || null);
    setTapMarks({});
    setTapIdx(0);
    setTapOn(true);
  }
  function cerrarTap() {
    setTapOn(false);
    try { tapAudio.current?.pause(); } catch {}
  }
  const marcarAhora = useCallback(() => {
    const el = tapAudio.current;
    if (!el || tapIdx >= lyrics.length) return;
    const t = Math.max(0, el.currentTime + (song?.offset_seconds || 0) - tapReaccion);
    setTapMarks(prev => ({ ...prev, [lyrics[tapIdx].id]: Number(t.toFixed(2)) }));
    setTapIdx(i => Math.min(i + 1, lyrics.length));
  }, [tapIdx, lyrics, song, tapReaccion]);
  const deshacerTap = useCallback(() => {
    if (tapIdx <= 0) return;
    const prevIdx = tapIdx - 1;
    setTapMarks(prev => { const c = { ...prev }; delete c[lyrics[prevIdx].id]; return c; });
    setTapIdx(prevIdx);
  }, [tapIdx, lyrics]);

  async function guardarTap() {
    const entradas = Object.entries(tapMarks);
    if (!entradas.length) { cerrarTap(); return; }
    for (const [lyricId, seg] of entradas) {
      await supabase.from("lyric_lines").update({ start_time_seconds: seg }).eq("id", lyricId);
    }
    cerrarTap();
    await load();
  }

  // Teclado: espacio marca, backspace deshace, escape sale
  useEffect(() => {
    if (!tapOn) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space")      { e.preventDefault(); marcarAhora(); }
      else if (e.code === "Backspace") { e.preventDefault(); deshacerTap(); }
      else if (e.code === "Escape")    { e.preventDefault(); cerrarTap(); }
      else if (e.code === "KeyP")      { e.preventDefault();
        const el = tapAudio.current; if (el) { el.paused ? el.play() : el.pause(); } }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tapOn, marcarAhora, deshacerTap]);

  // Posición del audio para la UI
  useEffect(() => {
    if (!tapOn) return;
    const iv = setInterval(() => {
      const el = tapAudio.current;
      if (el) setTapPos(el.currentTime);
    }, 100);
    return () => clearInterval(iv);
  }, [tapOn]);

  async function guardarOffset(v: number) {
    const val = Math.max(-30, Math.min(30, Number(v.toFixed(3))));
    setSong({ ...song, offset_seconds: val });
    await supabase.from("songs").update({ offset_seconds: val }).eq("id", id);
  }

  async function deleteSong() {
    if (!confirm(`¿Borrar "${song.title}" y todo su contenido?`)) return;
    await supabase.from("songs").delete().eq("id", id);
    router.push("/songs");
  }

  /* ===================== PISTAS DE AUDIO =====================
   * El archivo va a Storage en <band_id>/<song_id>.<ext> y la fila de la
   * canción guarda la ruta. Los dispositivos comparan audio_updated_at
   * con lo que tienen cacheado para saber si hay que volver a bajarlo.
   * ========================================================== */
  const AUDIO_BUCKET = "song-audio";
  // 200 MB. Tiene que coincidir con el file_size_limit del bucket Y con el
  // "Upload file size limit" global en Settings → Storage: manda el más chico
  // de los tres. Si subís este número, subí también los otros dos.
  const MAX_MB = 200;
  const MAX_BYTES = MAX_MB * 1024 * 1024;

  function fmtBytes(n: number) {
    if (!n) return "—";
    return n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.round(n / 1024) + " KB";
  }
  function fmtDur(sec: number | null) {
    if (!sec || !isFinite(sec)) return "—";
    return Math.floor(sec / 60) + ":" + String(Math.round(sec % 60)).padStart(2, "0");
  }

  /* Medir la duración del archivo antes de subirlo. El navegador la saca del
     header sin decodificar todo, así que es instantáneo incluso con un WAV
     de 100 MB. Con esto el setlist puede mostrar la duración de cada tema y
     el total del show sin que Pato cargue nada a mano. */
  function readDuration(file: File): Promise<number | null> {
    return new Promise(resolve => {
      const url = URL.createObjectURL(file);
      const el = document.createElement("audio");
      const done = (v: number | null) => { URL.revokeObjectURL(url); resolve(v); };
      el.preload = "metadata";
      el.onloadedmetadata = () => done(isFinite(el.duration) ? el.duration : null);
      el.onerror = () => done(null);
      setTimeout(() => done(null), 8000);   // si el formato no lo soporta, seguimos igual
      el.src = url;
    });
  }

  async function uploadAudio(file: File) {
    if (!song) return;
    setAudioErr(null);

    if (file.size > MAX_BYTES) {
      setAudioErr(
        `El archivo pesa ${fmtBytes(file.size)} y el máximo es ${MAX_MB} MB. ` +
        `Para un tema así de largo conviene MP3 320 kbps.`
      );
      return;
    }

    setUploading(true);
    setUploadPct(0);
    try {
      const duracion = await readDuration(file);
      const ext = (file.name.split(".").pop() || "mp3").toLowerCase();
      const path = `${song.band_id}/${song.id}.${ext}`;

      // Si antes había una pista con otra extensión, sacarla para no dejar basura
      if (song.audio_path && song.audio_path !== path) {
        await supabase.storage.from(AUDIO_BUCKET).remove([song.audio_path]);
      }

      const { error: upErr } = await supabase.storage
        .from(AUDIO_BUCKET)
        .upload(path, file, { upsert: true, contentType: file.type || undefined });
      if (upErr) throw upErr;
      setUploadPct(100);

      const patch = {
        audio_path: path,
        audio_filename: file.name,
        audio_bytes: file.size,
        audio_updated_at: new Date().toISOString(),
        audio_duration_seconds: duracion,
      };
      const { error: dbErr } = await supabase.from("songs").update(patch).eq("id", song.id);
      if (dbErr) throw dbErr;

      setSong({ ...song, ...patch });
      setPreviewUrl(null);
    } catch (e: any) {
      const msg = e?.message || String(e);
      setAudioErr(
        /bucket/i.test(msg) && /not found/i.test(msg)
          ? "No existe el bucket 'song-audio'. Corré migration_audio.sql en el SQL Editor de Supabase."
          : msg
      );
    } finally {
      setUploading(false);
    }
  }

  async function removeAudio() {
    if (!song?.audio_path) return;
    if (!confirm("¿Borrar la pista de esta canción?")) return;
    setAudioErr(null);
    try {
      await supabase.storage.from(AUDIO_BUCKET).remove([song.audio_path]);
      const patch = { audio_path: null, audio_filename: null, audio_bytes: null, audio_updated_at: null, audio_duration_seconds: null };
      await supabase.from("songs").update(patch).eq("id", song.id);
      setSong({ ...song, ...patch });
      setPreviewUrl(null);
    } catch (e: any) {
      setAudioErr(e?.message || String(e));
    }
  }

  async function loadPreview() {
    if (!song?.audio_path) return;
    setAudioErr(null);
    const { data, error } = await supabase.storage
      .from(AUDIO_BUCKET)
      .createSignedUrl(song.audio_path, 3600);
    if (error) { setAudioErr(error.message); return; }
    setPreviewUrl(data?.signedUrl || null);
  }

  async function downloadAudio() {
    if (!song?.audio_path) return;
    setAudioErr(null);
    const { data, error } = await supabase.storage
      .from(AUDIO_BUCKET)
      .createSignedUrl(song.audio_path, 300, { download: song.audio_filename || true });
    if (error) { setAudioErr(error.message); return; }
    if (!data?.signedUrl) return;
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.download = song.audio_filename || "pista";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // ===== LYRICS =====
  async function addLyric() {
    const lastT = lyrics.at(-1)?.start_time_seconds ?? 0;
    const maxOrder = lyrics.length ? Math.max(...lyrics.map(l => l.order_index)) : -1;
    const { data } = await supabase.from("lyric_lines").insert({
      song_id: id, order_index: maxOrder + 1, text: "Nueva línea", start_time_seconds: lastT + 4,
    }).select().single();
    if (data) setLyrics([...lyrics, data]);
  }
  async function insertLyricAfter(afterId: string) {
    const idx = lyrics.findIndex(l => l.id === afterId);
    if (idx < 0) return;
    const current = lyrics[idx];
    const next = lyrics[idx + 1];
    const newTime = next
      ? (current.start_time_seconds + next.start_time_seconds) / 2
      : current.start_time_seconds + 4;
    const maxOrder = lyrics.length ? Math.max(...lyrics.map(l => l.order_index)) : -1;
    const { data } = await supabase.from("lyric_lines").insert({
      song_id: id, order_index: maxOrder + 1,
      text: "Nueva línea", start_time_seconds: Math.round(newTime * 10) / 10,
    }).select().single();
    if (data) {
      const newList = [...lyrics];
      newList.splice(idx + 1, 0, data);
      setLyrics(newList);
    }
  }
  async function updateLyric(lyricId: string, patch: any) {
    setLyrics(lyrics.map(l => l.id === lyricId ? { ...l, ...patch } : l));
  }
  async function saveLyric(lyricId: string) {
    const l = lyrics.find(x => x.id === lyricId);
    if (!l) return;
    await supabase.from("lyric_lines").update({
      text: l.text, start_time_seconds: l.start_time_seconds,
    }).eq("id", lyricId);
  }
  async function removeLyric(lyricId: string) {
    await supabase.from("lyric_lines").delete().eq("id", lyricId);
    setLyrics(lyrics.filter(l => l.id !== lyricId));
  }

  /* ===== Callbacks del editor de onda =====
   * Guardan directo en Supabase con el valor nuevo (sin pasar por saveLyric,
   * que lee el state y puede quedar desactualizado en el mismo tick). */
  async function waveChangeTime(lyricId: string, newSec: number) {
    const l = lyrics.find(x => x.id === lyricId);
    if (!l) return;
    const oldTime = Number(l.start_time_seconds);
    const sec = Math.max(0, Math.round(newSec * 100) / 100);
    setLyrics(prev => prev.map(x => x.id === lyricId ? { ...x, start_time_seconds: sec } : x));
    await supabase.from("lyric_lines").update({ start_time_seconds: sec }).eq("id", lyricId);
    await syncCueTimeWithLyric(l, oldTime, sec);
  }
  /* Mover varias líneas juntas (selección múltiple en la onda): una pasada
   * de updates con los valores nuevos + sync de cues, y un solo setState. */
  async function waveChangeTimeMany(changes: { id: string; sec: number }[]) {
    if (!changes.length) return;
    const oldById = new Map(lyrics.map(l => [l.id, Number(l.start_time_seconds)]));
    setLyrics(prev => prev.map(x => {
      const c = changes.find(ch => ch.id === x.id);
      return c ? { ...x, start_time_seconds: c.sec } : x;
    }));
    for (const c of changes) {
      await supabase.from("lyric_lines").update({ start_time_seconds: c.sec }).eq("id", c.id);
      const l = lyrics.find(x => x.id === c.id);
      const old = oldById.get(c.id);
      if (l && old != null) await syncCueTimeWithLyric(l, old, c.sec);
    }
  }
  async function waveChangeText(lyricId: string, text: string) {
    setLyrics(prev => prev.map(x => x.id === lyricId ? { ...x, text } : x));
    await supabase.from("lyric_lines").update({ text }).eq("id", lyricId);
  }
  /* Fin marcado de la pista: segundo del ARCHIVO donde termina el tema de
   * verdad (corta el silencio de cola). null = usar el archivo entero. */
  async function saveAudioEnd(sec: number | null) {
    const val = sec == null || !isFinite(sec) || sec <= 0
      ? null
      : Math.round(Math.min(sec, Number(song?.audio_duration_seconds) || sec) * 100) / 100;
    setSong({ ...song, audio_end_seconds: val });
    await supabase.from("songs").update({ audio_end_seconds: val }).eq("id", id);
  }

  async function insertLyricAtTime(sec: number) {
    const maxOrder = lyrics.length ? Math.max(...lyrics.map(l => l.order_index)) : -1;
    const { data } = await supabase.from("lyric_lines").insert({
      song_id: id, order_index: maxOrder + 1,
      text: "Nueva línea", start_time_seconds: Math.max(0, Math.round(sec * 100) / 100),
    }).select().single();
    if (data) setLyrics(prev => [...prev, data]);
    return data?.id as string | undefined;
  }

  // ===== CUE inline para una letra =====
  // Buscar el cue asociado a una línea de letra (por matching de timestamp ±0.5s)
  function findCueForLyric(l: any) {
    const target = Number(l.start_time_seconds);
    return cues.find(c => Math.abs(Number(c.jump_to_seconds) - target) < 0.5);
  }
  async function setCueOnLyric(lyric: any, noteName: string) {
    const noteNum = noteNameToNum(noteName);
    if (noteNum === null || noteNum < 0 || noteNum > 127) {
      alert(`"${noteName}" no es una nota MIDI válida. Usá formato C4, D#4, Bb3, etc.`);
      return;
    }
    const existingByTime = findCueForLyric(lyric);
    const existingByNote = cues.find(c => c.midi_note === noteNum);

    // Caso 1: ya existe un cue en esta línea (por tiempo) — actualizar su nota
    if (existingByTime) {
      // Si la nueva nota ya está usada por OTRO cue, hay que liberarla primero
      // (unique constraint song_id+midi_note)
      if (existingByNote && existingByNote.id !== existingByTime.id) {
        await supabase.from("midi_cues").delete().eq("id", existingByNote.id);
      }
      const { error } = await supabase.from("midi_cues").update({
        midi_note: noteNum, label: lyric.text.slice(0, 60),
      }).eq("id", existingByTime.id);
      if (error) { alert("Error guardando: " + error.message); return; }
      setCues(cues
        .filter(c => !(existingByNote && c.id === existingByNote.id))
        .map(c => c.id === existingByTime.id
          ? { ...c, midi_note: noteNum, label: lyric.text.slice(0, 60) } : c));
      return;
    }

    // Caso 2: la nota ya existe en otra línea — moverla a esta línea
    if (existingByNote) {
      const { error } = await supabase.from("midi_cues").update({
        jump_to_seconds: lyric.start_time_seconds,
        label: lyric.text.slice(0, 60),
      }).eq("id", existingByNote.id);
      if (error) { alert("Error moviendo cue: " + error.message); return; }
      setCues(cues.map(c => c.id === existingByNote.id
        ? { ...c, jump_to_seconds: lyric.start_time_seconds, label: lyric.text.slice(0, 60) } : c));
      return;
    }

    // Caso 3: cue nuevo, no conflicto — insertar
    const maxOrder = cues.length ? Math.max(...cues.map(c => c.order_index)) : -1;
    const { data, error } = await supabase.from("midi_cues").insert({
      song_id: id, order_index: maxOrder + 1,
      midi_note: noteNum, label: lyric.text.slice(0, 60),
      jump_to_seconds: lyric.start_time_seconds,
    }).select().single();
    if (error) {
      alert("Error creando cue: " + error.message);
      return;
    }
    if (data) setCues([...cues, data]);
  }
  async function removeCueFromLyric(lyric: any) {
    const existing = findCueForLyric(lyric);
    if (!existing) return;
    await supabase.from("midi_cues").delete().eq("id", existing.id);
    setCues(cues.filter(c => c.id !== existing.id));
  }
  // Sync del cue cuando cambia el tiempo de la letra
  async function syncCueTimeWithLyric(lyric: any, oldTime: number, newTime: number) {
    if (oldTime === newTime) return;
    const cue = cues.find(c => Math.abs(c.jump_to_seconds - oldTime) < 0.5);
    if (!cue) return;
    await supabase.from("midi_cues").update({ jump_to_seconds: newTime }).eq("id", cue.id);
    setCues(cues.map(c => c.id === cue.id ? { ...c, jump_to_seconds: newTime } : c));
  }

  /* Auto-asignar notas MIDI a TODAS las letras (chromatic ascendente desde C3) */
  async function autoAssignNotesToLyrics() {
    if (lyrics.length === 0) { alert('No hay líneas de letra'); return; }
    if (!confirm(`Esto BORRA todos los cues actuales y asigna notas MIDI automáticas (C3, C#3, D3, D#3...) a cada una de las ${lyrics.length} líneas. ¿Continuar?`)) return;

    // PASO 1: Borrar TODOS los cues de esta canción (bulk delete, no solo los del state local)
    // Esto evita race conditions y asegura DB limpia antes de insertar.
    const { error: delErr } = await supabase.from('midi_cues').delete().eq('song_id', id);
    if (delErr) { alert('Error borrando cues anteriores: ' + delErr.message); return; }
    setCues([]);

    // PASO 2: Esperar un toque para que la DB procese antes de insertar
    await new Promise(r => setTimeout(r, 150));

    // PASO 3: Construir filas con notas únicas (C3 a B9, máx 80 notas chromatic)
    const sorted = [...lyrics].sort((a, b) => Number(a.start_time_seconds) - Number(b.start_time_seconds));
    const startNote = 48; // C3 (en convención C4=60)
    const rows = sorted.slice(0, 80).map((l, i) => ({
      song_id: id,
      order_index: i,
      midi_note: startNote + i,
      label: (l.text || '').slice(0, 60),
      jump_to_seconds: Number(l.start_time_seconds),
    }));

    // PASO 4: Bulk insert en una sola operación (atómica)
    const { data, error } = await supabase.from('midi_cues').insert(rows).select();
    if (error) {
      alert('Error creando cues: ' + error.message + '\n\nProbá tocar el botón otra vez en 3 segundos.');
      return;
    }
    setCues(data || []);
    alert(`✓ ${data?.length || 0} cues creados con notas C3 → ${data?.length ? noteNumToName(48 + data.length - 1) : 'C3'}.\nAhora tocá "Copiar para Logic".`);
  }

  /* Copiar al portapapeles en formato Logic Event List */
  async function copyForLogic() {
    if (cues.length === 0) { alert('No hay cues para copiar. Asigná notas primero.'); return; }
    const text = generateLogicEventListText(cues, song.bpm, 2);
    try {
      await navigator.clipboard.writeText(text);
      alert(`⚠ Logic no acepta pegar texto plano en su Event List (solo acepta su propio formato propietario).\n\nUSAR EL BOTÓN .mid en su lugar — es la forma confiable:\n1. Click 📥 .mid → descarga archivo\n2. Arrastrá el .mid desde Finder al bar de Logic donde ARRANCA tu canción (ej: bar 600)\n3. Las notas se posicionan según el tiempo de cada lyric calculado con el BPM de la canción`);
    } catch (e) {
      // Fallback con textarea
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      alert(`✓ Copiado (fallback). Pegá en Logic Event List.`);
    }
  }

  /* Descargar .mid (método PRINCIPAL para llevar cues a Logic) */
  function downloadMidi() {
    if (cues.length === 0) { alert('No hay cues para exportar.'); return; }
    const bytes = generateMidiFile(cues, song.bpm, 2, song.title || 'CAMARAGE Cues');
    const blob = new Blob([bytes as unknown as BlobPart], { type: 'audio/midi' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(song.title || 'cues').replace(/[^a-z0-9]+/gi,'_')}_cues.mid`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setTimeout(() => {
      alert(`✓ Archivo .mid descargado (${cues.length} cues @ ${song.bpm} BPM).\n\nPara usarlo en Logic:\n1. Abrí Finder → Descargas\n2. Arrastrá el archivo .mid AL BAR donde ARRANCA tu canción en Logic\n   (NO al bar donde sube la primera lyric — la posición de cada nota ya está\n   calculada según los segundos que pusiste en cada lyric, a ${song.bpm} BPM)\n3. Logic crea una región con todos los cues posicionados correctamente\n4. Verificá que la pista tenga Output → A56 de Patricio, Channel 2`);
    }, 100);
  }

  // ===== CUES MIDI =====
  async function addCue() {
    const lastCue = cues.at(-1);
    const newNote = lastCue ? Math.min(127, lastCue.midi_note + 2) : 60;
    const maxOrder = cues.length ? Math.max(...cues.map(c => c.order_index)) : -1;
    const { data } = await supabase.from("midi_cues").insert({
      song_id: id, order_index: maxOrder + 1,
      midi_note: newNote, label: "Nueva parte",
      jump_to_seconds: (lastCue?.jump_to_seconds || 0) + 8,
    }).select().single();
    if (data) setCues([...cues, data]);
  }
  async function insertCueAfter(afterId: string) {
    const idx = cues.findIndex(c => c.id === afterId);
    if (idx < 0) return;
    const current = cues[idx];
    const next = cues[idx + 1];
    const newTime = next
      ? (current.jump_to_seconds + next.jump_to_seconds) / 2
      : current.jump_to_seconds + 8;
    const newNote = Math.min(127, current.midi_note + 1);
    const maxOrder = cues.length ? Math.max(...cues.map(c => c.order_index)) : -1;
    const { data } = await supabase.from("midi_cues").insert({
      song_id: id, order_index: maxOrder + 1,
      midi_note: newNote, label: "Nueva parte",
      jump_to_seconds: Math.round(newTime * 10) / 10,
    }).select().single();
    if (data) {
      const newList = [...cues];
      newList.splice(idx + 1, 0, data);
      setCues(newList);
    }
  }
  function updateCue(cueId: string, patch: any) {
    setCues(cues.map(c => c.id === cueId ? { ...c, ...patch } : c));
  }
  async function saveCue(cueId: string) {
    const c = cues.find(x => x.id === cueId);
    if (!c) return;
    await supabase.from("midi_cues").update({
      midi_note: c.midi_note, label: c.label, jump_to_seconds: c.jump_to_seconds,
    }).eq("id", cueId);
  }
  async function removeCue(cueId: string) {
    await supabase.from("midi_cues").delete().eq("id", cueId);
    setCues(cues.filter(c => c.id !== cueId));
  }

  // ===== CHORDS =====
  // Un compás en segundos (tiempo de contenido). El compás 1 = start_bar 0 = 0 s,
  // igual que la app del escenario (bar * tiemposPorCompás * 60/BPM).
  const chordBpb = Math.max(1, parseInt(String(song?.time_signature || "4/4"), 10) || 4);
  const chordBarDur = Number(song?.bpm) > 0 ? (60 / Number(song.bpm)) * chordBpb : 0;
  const secToBar = (sec: number) => chordBarDur ? Math.max(0, Math.round(sec / chordBarDur)) : 0;

  /* Ordena por compás y recalcula cuántos compases dura cada acorde (hasta el siguiente). */
  function chordsWithCounts(list: any[]) {
    const sorted = [...list].sort((x, y) => x.start_bar - y.start_bar);
    return sorted.map((c, i) => {
      const next = sorted[i + 1];
      const bc = next ? Math.max(1, next.start_bar - c.start_bar) : Math.max(1, c.bar_count || 1);
      return { ...c, bar_count: bc };
    });
  }
  /* Guarda en Supabase solo lo que cambió respecto de `prev`. */
  async function persistChords(next: any[], prev: any[]) {
    const withCounts = chordsWithCounts(next);
    chordsRef.current = withCounts;
    setChords(withCounts);
    const prevById = new Map(prev.map(c => [c.id, c]));
    for (const c of withCounts) {
      const p = prevById.get(c.id);
      if (!p) continue;
      const patch: any = {};
      for (const k of ["start_bar", "bar_count", "chord_symbol", "root_note", "quality"]) {
        if (p[k] !== c[k]) patch[k] = c[k];
      }
      if (Object.keys(patch).length) await supabase.from("chord_charts").update(patch).eq("id", c.id);
    }
  }
  async function chordInsertBar(bar: number): Promise<string | null> {
    const prev = chordsRef.current;
    const there = prev.find(c => c.start_bar === bar);
    if (there) return there.id;                    // ya hay uno ahí: seleccionarlo
    const maxOrder = prev.length ? Math.max(...prev.map(c => c.order_index ?? 0)) : -1;
    const { data, error } = await supabase.from("chord_charts").insert({
      song_id: id, order_index: maxOrder + 1,
      chord_symbol: "?", root_note: "?", quality: "",
      start_bar: bar, bar_count: 1,
    }).select().single();
    if (error || !data) { alert("No pude crear el acorde: " + (error?.message || "")); return null; }
    const cur = [...chordsRef.current, data];
    await persistChords(cur, cur);
    return data.id;
  }
  async function addChord() {
    const sorted = chordsWithCounts(chordsRef.current);
    const last = sorted.at(-1);
    await chordInsertBar(last ? last.start_bar + (last.bar_count || 2) : 0);
  }
  async function chordWaveTimeMany(changes: { id: string; sec: number }[]) {
    const prev = chordsRef.current;
    const next = prev.map(c => {
      const ch = changes.find(x => x.id === c.id);
      return ch ? { ...c, start_bar: secToBar(ch.sec) } : c;
    });
    await persistChords(next, prev);
  }
  async function chordWaveTime(chordId: string, sec: number) {
    await chordWaveTimeMany([{ id: chordId, sec }]);
  }
  async function chordSetBar(chordId: string, bar: number) {
    const prev = chordsRef.current;
    await persistChords(prev.map(c => c.id === chordId ? { ...c, start_bar: Math.max(0, bar) } : c), prev);
  }
  async function chordSetSymbol(chordId: string, text: string) {
    const prev = chordsRef.current;
    const parsed = parseChordSymbol(text);
    await persistChords(prev.map(c => c.id === chordId ? { ...c, ...parsed } : c), prev);
  }
  /* Acordes cargados antes, con raíz/calidad que no coinciden con el símbolo. */
  async function fixAllChordFields() {
    const prev = chordsRef.current;
    await persistChords(prev.map(c => ({ ...c, ...parseChordSymbol(c.chord_symbol) })), prev);
  }
  async function removeChord(chordId: string) {
    await supabase.from("chord_charts").delete().eq("id", chordId);
    const rest = chordsRef.current.filter(c => c.id !== chordId);
    await persistChords(rest, rest);
  }
  // ===== PENTAGRAMA DEL BAJO =====
  async function addBassNote(midi: number, startBeat: number): Promise<string | null> {
    const { data, error } = await supabase.from("bass_notes").insert({
      song_id: id, midi, start_beat: startBeat, duration_beats: 0.5,
    }).select().single();
    if (error || !data) { alert("No pude guardar la nota: " + (error?.message || "")); return null; }
    const row = { ...data, start_beat: Number(data.start_beat), duration_beats: Number(data.duration_beats) };
    bassNotesRef.current = [...bassNotesRef.current, row];
    setBassNotes(bassNotesRef.current);
    scheduleChordSync();
    return data.id;
  }
  async function updateBassNote(noteId: string, patch: { midi?: number; start_beat?: number; duration_beats?: number }) {
    bassNotesRef.current = bassNotesRef.current.map(n => n.id === noteId ? { ...n, ...patch } : n);
    setBassNotes(bassNotesRef.current);
    if (patch.midi != null || patch.start_beat != null) scheduleChordSync();
    const { error } = await supabase.from("bass_notes").update(patch).eq("id", noteId);
    if (error) alert("No pude guardar la nota: " + error.message);
  }
  async function removeBassNote(noteId: string) {
    bassNotesRef.current = bassNotesRef.current.filter(n => n.id !== noteId);
    setBassNotes(bassNotesRef.current);
    scheduleChordSync();
    await supabase.from("bass_notes").delete().eq("id", noteId);
  }

  /* ===== El pentagrama manda: cifrado automático =====
   * La primera nota de cada compás es el acorde de ese compás; si se repite
   * la misma nota en compases seguidos, queda un solo acorde que dura más.
   * Si el acorde que ya estaba tiene la misma raíz (p.ej. "Bm7" y la nota es
   * Si), se respeta su calidad. Sin notas no se toca nada. */
  function scheduleChordSync() {
    clearTimeout(chordSyncTimer.current);
    chordSyncTimer.current = setTimeout(() => {
      chordSyncBusy.current = chordSyncBusy.current.then(syncChordsFromNotes).catch(e => console.warn("[sync cifrado]", e));
    }, 450);
  }
  async function syncChordsFromNotes() {
    const notes = [...bassNotesRef.current].sort((a, b) => Number(a.start_beat) - Number(b.start_beat));
    if (!notes.length || !chordBarDur) return;
    const flats = FLAT_KEYS.has(String(song?.key || "").trim());
    const desired: { bar: number; pc: number; name: string }[] = [];
    const seenBars = new Set<number>();
    for (const n of notes) {
      const bar = Math.floor(Number(n.start_beat) / chordBpb + 1e-6);
      if (seenBars.has(bar)) continue;
      seenBars.add(bar);
      const pc = ((n.midi % 12) + 12) % 12;
      if (desired.length && desired[desired.length - 1].pc === pc) continue;   // misma nota: sigue el acorde
      desired.push({ bar, pc, name: (flats ? ROOTS_FLAT : ROOTS_SHARP)[pc] });
    }
    const prev = chordsRef.current;
    const byBar = new Map<number, any>();
    const toDelete: string[] = [];
    for (const c of [...prev].sort((a, b) => a.start_bar - b.start_bar)) {
      if (byBar.has(c.start_bar)) toDelete.push(c.id); else byBar.set(c.start_bar, c);
    }
    // Solo se maneja el tramo escrito (de la primera a la última nota): los
    // acordes cargados a mano antes o después de ese tramo no se tocan.
    const firstBar = desired.length ? desired[0].bar : 0;
    const lastBar = Math.max(...Array.from(seenBars));
    const wanted = new Set(desired.map(d => d.bar));
    byBar.forEach((c, bar) => { if (bar >= firstBar && bar <= lastBar && !wanted.has(bar)) toDelete.push(c.id); });

    const kept: any[] = [];
    const toInsert: any[] = [];
    let order = prev.length ? Math.max(...prev.map(c => c.order_index ?? 0)) + 1 : 0;
    for (const d of desired) {
      const ex = byBar.get(d.bar);
      if (ex && pitchClassOf(ex.root_note) === d.pc) kept.push(ex);
      else if (ex) kept.push({ ...ex, ...parseChordSymbol(d.name) });
      else toInsert.push({ song_id: id, order_index: order++, chord_symbol: d.name, root_note: d.name,
                           quality: "", start_bar: d.bar, bar_count: 1 });
    }
    if (toDelete.length) await supabase.from("chord_charts").delete().in("id", toDelete);
    let inserted: any[] = [];
    if (toInsert.length) {
      const { data, error } = await supabase.from("chord_charts").insert(toInsert).select();
      if (error) { console.warn("[sync cifrado]", error.message); }
      inserted = data || [];
    }
    const prevKept = prev.filter(c => !toDelete.includes(c.id));
    await persistChords([...kept, ...inserted], [...prevKept, ...inserted]);
  }
  /* Afinación real del tema: un Fa escrito suena Fa + semitonos + cents. */
  async function saveTuning(patch: { tuning_semitones?: number; tuning_cents?: number }) {
    setSong((s: any) => ({ ...s, ...patch }));
    const { error } = await supabase.from("songs").update(patch).eq("id", id);
    if (error) alert("No pude guardar la afinación (¿corriste migration_bass_notes.sql?): " + error.message);
  }
  const tuneSemis = Number(song?.tuning_semitones) || 0;
  const tuneCents = Number(song?.tuning_cents) || 0;

  const chordItems = chords.map(c => ({
    id: c.id,
    text: c.chord_symbol,
    start_time_seconds: (c.start_bar || 0) * chordBarDur,
    order_index: c.order_index,
  }));
  const chordsMismatch = chords.filter(c => c.chord_symbol && chordShown(c) !== parseChordSymbol(c.chord_symbol).chord_symbol);

  if (!song) return <div className="p-6">Cargando…</div>;

  return (
    <div className="p-6 max-w-5xl">
      <Link href="/songs" className="text-xs text-neutral-500 hover:text-white mb-2 inline-block">← Canciones</Link>
      <div className="flex items-start justify-between mb-1">
        <input value={song.title} onChange={e => setSong({...song, title: e.target.value})} onBlur={saveSong}
               className="text-3xl font-black bg-transparent outline-none focus:bg-neutral-900 px-1 -mx-1 rounded transition" />
        <button onClick={deleteSong} className="text-xs text-neutral-600 hover:text-red-400 mt-2">Borrar canción</button>
      </div>
      <p className="mono text-[10px] uppercase tracking-widest text-neutral-500 mb-6">
        {saving ? 'guardando…' : 'auto-guardado al salir de cada campo'}
      </p>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-neutral-900 mb-4">
        {[
          { id: "meta", label: "Datos" },
          { id: "lyrics", label: `Letras (${lyrics.length})` },
          { id: "cues", label: `Cues MIDI (${cues.length})` },
          { id: "chords", label: `Cifrado (${chords.length})` },
          { id: "audio", label: song.audio_path ? "Audio ●" : "Audio" },
          { id: "midiout", label: `MIDI out (${midiEvents.length})` },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)}
                  className={`px-4 py-2 text-sm font-bold border-b-2 transition ${
                    tab === t.id ? "border-cyan-400 text-white" : "border-transparent text-neutral-500 hover:text-white"
                  }`}>{t.label}</button>
        ))}
      </div>

      {tab === "meta" && (
        <div className="card space-y-3 max-w-2xl">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Artista</label><input value={song.artist || ""} onChange={e => setSong({...song, artist: e.target.value})} onBlur={saveSong} className="input" /></div>
            <div><label className="label">Tonalidad</label><input value={song.key || ""} onChange={e => setSong({...song, key: e.target.value})} onBlur={saveSong} className="input" /></div>
            <div><label className="label">BPM</label><input type="number" min="40" max="240" value={song.bpm} onChange={e => setSong({...song, bpm: parseFloat(e.target.value)||120})} onBlur={saveSong} className="input" /></div>
            <div><label className="label">Time signature</label><input value={song.time_signature} onChange={e => setSong({...song, time_signature: e.target.value})} onBlur={saveSong} className="input" /></div>
            <div className="col-span-2">
              <label className="label">Program Change (PC#) — opcional</label>
              <input type="number" min="0" max="127" value={song.program_change ?? ""} onChange={e => setSong({...song, program_change: e.target.value ? parseInt(e.target.value) : null})} onBlur={saveSong} className="input" placeholder="0-127" />
              <p className="text-[10px] text-neutral-500 mt-1">Logic manda este PC para cargar esta canción en el celu.</p>
            </div>
            <div className="col-span-2">
              <label className="label">Offset de sincronía (segundos)</label>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => guardarOffset(Number(((song.offset_seconds||0) - 0.1).toFixed(3)))}
                        className="btn text-xs px-3">−0,1</button>
                <input type="number" step="0.05" value={song.offset_seconds ?? 0}
                       onChange={e => setSong({...song, offset_seconds: parseFloat(e.target.value) || 0})}
                       onBlur={e => guardarOffset(parseFloat(e.target.value) || 0)}
                       className="input text-center" style={{maxWidth: 120}} />
                <button type="button" onClick={() => guardarOffset(Number(((song.offset_seconds||0) + 0.1).toFixed(3)))}
                        className="btn text-xs px-3">+0,1</button>
                {!!song.offset_seconds && (
                  <button type="button" onClick={() => guardarOffset(0)}
                          className="text-xs text-neutral-500 hover:text-white ml-1">a cero</button>
                )}
              </div>
              <p className="text-[10px] text-neutral-500 mt-1 leading-snug">
                Corrige un desfase <strong>constante</strong> entre el archivo de audio y los
                tiempos de las letras y del MIDI. Si la letra va <strong>adelantada</strong>, subí
                el número. Si va <strong>atrasada</strong>, bajalo. No cambia el tiempo que
                muestra el transporte.
              </p>
            </div>
            <div className="col-span-2">
              <label className="flex items-start gap-3 rounded-lg border border-neutral-800 p-3 cursor-pointer hover:border-neutral-700">
                <input type="checkbox" className="mt-0.5"
                       checked={!!song.chain_next}
                       onChange={async e => {
                         const v = e.target.checked;
                         setSong({ ...song, chain_next: v });
                         await supabase.from("songs").update({ chain_next: v }).eq("id", id);
                       }} />
                <span>
                  <span className="block text-sm font-bold">Encadenar con la siguiente</span>
                  <span className="block text-[11px] text-neutral-500 mt-0.5">
                    Al terminar esta canción, la próxima arranca sola y sin cuenta regresiva.
                    Para medleys o bloques seguidos. Si está apagado, la app cuenta 5 segundos,
                    deja la próxima cargada y espera tu PLAY.
                  </span>
                </span>
              </label>
            </div>
            <div className="col-span-2">
              <label className="label">Notas internas</label>
              <textarea value={song.notes || ""} onChange={e => setSong({...song, notes: e.target.value})} onBlur={saveSong} className="input" rows={3} placeholder="Recordatorios para la banda" />
            </div>
          </div>
        </div>
      )}

      {tab === "midiout" && (
        <div className="card space-y-4 max-w-3xl">
          <div>
            <h2 className="text-lg font-black mb-1">MIDI que dispara la app</h2>
            <p className="text-xs text-neutral-400">
              Los cambios de patch y efectos que hoy tenés en pistas MIDI de Logic. Exportá
              la región desde Logic (<span className="font-mono">Archivo → Exportar → Selección como archivo MIDI</span>)
              y subí el <span className="font-mono">.mid</span> acá: se traduce a eventos con
              tiempo, y la app los dispara sobre el reloj del audio.
            </p>
          </div>

          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
            <p className="text-[11px] text-amber-200/90">
              <strong>Importante — el punto cero.</strong> Los tiempos del .mid tienen que estar
              referidos al mismo instante que el bounce de audio. Si en Logic el tema arranca en
              el compás 50, la exportación va a traer los eventos en el minuto 2:30 y no en 0:00.
              Movė la región al compás 1 antes de exportar.
            </p>
          </div>

          {!midiPreview ? (
            <label className={`block rounded-lg border-2 border-dashed p-6 text-center cursor-pointer transition ${
              midiBusy ? "border-neutral-800 opacity-60" : "border-neutral-700 hover:border-cyan-400"
            }`}>
              <p className="text-sm font-bold mb-1">Elegí el archivo .mid</p>
              <p className="text-[11px] text-neutral-500">Program Change, CC y notas · con mapa de tempo</p>
              <input type="file" accept=".mid,.midi,audio/midi" className="hidden" disabled={midiBusy}
                     onChange={e => { const f = e.target.files?.[0]; if (f) elegirMidi(f); e.currentTarget.value = ""; }} />
            </label>
          ) : (
            <div className="rounded-lg border border-cyan-400/40 bg-cyan-400/5 p-3 space-y-3">
              <div>
                <p className="text-sm font-bold">{midiPreview.nombre}</p>
                <p className="text-[11px] text-neutral-400">
                  {midiPreview.eventos.length} eventos ·{" "}
                  {["pc","cc","note_on"].map(k => {
                    const n = midiPreview.eventos.filter(e => e.kind === k).length;
                    return n ? `${n} ${k === "pc" ? "cambios de patch" : k === "cc" ? "CC" : "notas"}` : null;
                  }).filter(Boolean).join(" · ")}
                </p>
              </div>

              <div className="max-h-48 overflow-y-auto rounded border border-neutral-800 divide-y divide-neutral-900">
                {midiPreview.eventos.slice(0, 40).map((e, i) => (
                  <div key={i} className="flex items-center gap-3 px-2 py-1 text-[11px] font-mono">
                    <span className="text-cyan-300 w-14">{fmtT(e.timeSeconds)}</span>
                    <span className="text-neutral-300">{describeEvent(e)}</span>
                    {e.trackName && <span className="text-neutral-600 ml-auto">{e.trackName}</span>}
                  </div>
                ))}
                {midiPreview.eventos.length > 40 && (
                  <p className="px-2 py-1 text-[11px] text-neutral-500">
                    …y {midiPreview.eventos.length - 40} más
                  </p>
                )}
              </div>

              <div>
                <label className="label">¿Qué dispositivo los dispara?</label>
                <select value={midiTarget} onChange={e => setMidiTarget(e.target.value)} className="input">
                  {TARGETS.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
                </select>
                <p className="text-[10px] text-neutral-500 mt-1">
                  El master tiene precisión de milisegundos porque no pasa por la red. El
                  dispositivo de otro integrante hereda el error de sincronía (±10-50 ms):
                  perfecto para cambios de patch, justo para efectos rítmicos.
                </p>
              </div>

              <div className="flex gap-2">
                <button onClick={() => confirmarImportMidi(true)} disabled={midiBusy}
                        className="btn text-xs font-bold">
                  {midiBusy ? "Importando…" : `Reemplazar todo con estos ${midiPreview.eventos.length}`}
                </button>
                {midiEvents.length > 0 && (
                  <button onClick={() => confirmarImportMidi(false)} disabled={midiBusy}
                          className="btn text-xs">Agregar a los existentes</button>
                )}
                <button onClick={() => setMidiPreview(null)} disabled={midiBusy}
                        className="btn text-xs text-neutral-400">Cancelar</button>
              </div>
            </div>
          )}

          {midiErr && (
            <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/30 rounded-lg p-3">{midiErr}</p>
          )}

          {midiEvents.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-bold">{midiEvents.length} eventos guardados</p>
                <button onClick={borrarTodosLosEventos} className="text-xs text-red-400 hover:text-red-300">
                  Borrar todos
                </button>
              </div>
              <div className="rounded-lg border border-neutral-800 divide-y divide-neutral-900 max-h-96 overflow-y-auto">
                {midiEvents.map(e => (
                  <div key={e.id} className="flex items-center gap-3 px-3 py-2">
                    <span className="font-mono text-xs text-cyan-300 w-14 shrink-0">{fmtT(e.time_seconds)}</span>
                    <span className="font-mono text-xs text-neutral-300 flex-1 truncate">{describeRow(e)}</span>
                    <select value={e.target} onChange={ev => cambiarTarget(e.id, ev.target.value)}
                            className="bg-black border border-neutral-800 rounded px-2 py-1 text-[11px]">
                      {TARGETS.map(t => <option key={t.v} value={t.v}>{t.v}</option>)}
                    </select>
                    <button onClick={() => borrarEvento(e.id)}
                            className="text-neutral-600 hover:text-red-400 text-sm px-1">×</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "audio" && (
        <div className="card space-y-4 max-w-2xl">
          <div>
            <h2 className="text-lg font-black mb-1">Pista de audio</h2>
            <p className="text-xs text-neutral-400">
              Subí acá el bounce de la canción. Los celulares y el iPad lo descargan solos
              la primera vez y después funcionan sin internet.
            </p>
          </div>

          {song.audio_path ? (
            <div className="rounded-lg border border-neutral-800 bg-black/40 p-3 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold truncate">{song.audio_filename}</p>
                  <p className="text-[11px] text-neutral-500 font-mono">
                    {fmtDur(song.audio_duration_seconds)} · {fmtBytes(song.audio_bytes)}
                    {song.audio_updated_at && ` · subida ${new Date(song.audio_updated_at).toLocaleDateString("es-AR")}`}
                  </p>
                </div>
                <span className="text-[10px] font-mono px-2 py-1 rounded-full bg-cyan-400/10 text-cyan-300 shrink-0">
                  ● en la nube
                </span>
              </div>

              {previewUrl ? (
                <audio src={previewUrl} controls className="w-full" />
              ) : (
                <button onClick={loadPreview}
                        className="text-xs font-bold text-cyan-300 hover:text-cyan-200">
                  ▶ Escuchar
                </button>
              )}

              <div className="flex gap-2 pt-1">
                <label className="btn cursor-pointer text-xs">
                  Reemplazar
                  <input type="file" accept="audio/*" className="hidden" disabled={uploading}
                         onChange={e => { const f = e.target.files?.[0]; if (f) uploadAudio(f); e.currentTarget.value = ""; }} />
                </label>
                <button onClick={downloadAudio} disabled={uploading} className="btn text-xs">
                  ⬇ Descargar
                </button>
                <button onClick={removeAudio} disabled={uploading}
                        className="btn text-xs text-red-400 hover:text-red-300">
                  Borrar pista
                </button>
              </div>

              <div className="pt-2 border-t border-neutral-900">
                <label className="label">Fin de la canción (opcional)</label>
                <div className="flex items-center gap-2">
                  <input type="text"
                         key={`aend-${song.audio_end_seconds ?? "none"}`}
                         defaultValue={song.audio_end_seconds != null ? formatTime(Number(song.audio_end_seconds)) : ""}
                         placeholder="ej: 4:12"
                         onBlur={e => { const v = e.target.value.trim(); saveAudioEnd(v ? parseTimeInput(v) : null); }}
                         className="input w-28 text-center mono text-xs" />
                  {song.audio_end_seconds != null && (
                    <button onClick={() => saveAudioEnd(null)}
                            className="text-xs text-neutral-500 hover:text-white">
                      usar el archivo entero
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-neutral-500 mt-1 leading-snug">
                  Si el bounce trae silencio de cola, marcá acá dónde termina el tema de verdad:
                  la app corta ahí (barra, auto-avance y encadenado) sin tocar el archivo. También
                  lo podés arrastrar con la bandera <span className="text-red-400 font-bold">⚑ FIN</span> sobre
                  la onda, en la solapa Letras.
                </p>
              </div>
            </div>
          ) : (
            <label className={`block rounded-lg border-2 border-dashed p-8 text-center cursor-pointer transition ${
              uploading ? "border-neutral-800 opacity-60" : "border-neutral-700 hover:border-cyan-400"
            }`}>
              <p className="text-sm font-bold mb-1">
                {uploading ? "Subiendo…" : "Elegí el archivo de audio"}
              </p>
              <p className="text-[11px] text-neutral-500">
                MP3, M4A, AAC, WAV u OGG · hasta {MAX_MB} MB
              </p>
              <input type="file" accept="audio/*" className="hidden" disabled={uploading}
                     onChange={e => { const f = e.target.files?.[0]; if (f) uploadAudio(f); e.currentTarget.value = ""; }} />
            </label>
          )}

          {uploading && (
            <div className="h-1.5 rounded-full bg-neutral-900 overflow-hidden">
              <div className="h-full bg-cyan-400 transition-all"
                   style={{ width: `${uploadPct || 15}%` }} />
            </div>
          )}

          {audioErr && (
            <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/30 rounded-lg p-3">
              {audioErr}
            </p>
          )}

          <div className="text-[11px] text-neutral-500 space-y-1 pt-2 border-t border-neutral-900">
            <p><strong className="text-neutral-300">WAV o MP3:</strong> los dos andan. El WAV suena idéntico al bounce, pero un tema de 5 minutos pesa ~53 MB contra ~12 del MP3 320: tarda cuatro veces más en bajar al celu y ocupa más memoria al reproducirlo. Si vas a tocar con mal WiFi, MP3.</p>
            <p><strong className="text-neutral-300">Ojo con el arranque:</strong> si el bounce tiene silencio antes del compás 1, la letra va a ir adelantada esa misma cantidad. Exportá desde el compás 1 exacto.</p>
            <p><strong className="text-neutral-300">Click:</strong> no hace falta que lo incluyas. La app lo genera con el BPM de la canción y lo manda al canal derecho.</p>
          </div>
        </div>
      )}

      {tab === "lyrics" && (
        <div className="space-y-2">

          {/* ---------- EDITOR DE ONDA (estilo SoundCloud) ---------- */}
          {song.audio_path ? (
            waveUrl ? (
              <WaveformLyricsEditor
                audioUrl={waveUrl}
                lyrics={lyrics}
                offsetSeconds={Number(song.offset_seconds) || 0}
                endSeconds={song.audio_end_seconds != null ? Number(song.audio_end_seconds) : null}
                onChangeTime={waveChangeTime}
                onChangeTimeMany={waveChangeTimeMany}
                onChangeText={waveChangeText}
                onInsertAt={insertLyricAtTime}
                onRemove={removeLyric}
                onChangeEnd={saveAudioEnd}
                bpm={Number(song.bpm) || 0}
                timeSignature={song.time_signature || "4/4"}
                onChangeOffset={guardarOffset}
              />
            ) : waveUrlErr ? (
              <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/30 rounded-lg p-3 mb-3">
                No pude firmar la URL del audio: {waveUrlErr}
              </p>
            ) : (
              <div className="card mb-3">
                <p className="text-xs text-neutral-500 animate-pulse">Preparando el editor de onda…</p>
              </div>
            )
          ) : (
            <div className="card mb-3">
              <p className="text-xs text-neutral-500">
                Subí la pista en la solapa <b className="text-neutral-300">Audio</b> y vas a poder
                editar las letras sobre la forma de onda, arrastrando cada línea a su momento exacto.
              </p>
            </div>
          )}

          {/* ---------- MODO MARCAR TIEMPOS ---------- */}
          {!tapOn ? (
            <div className="card mb-3 flex flex-wrap items-center gap-2">
              <p className="text-xs text-neutral-400 flex-1 min-w-0">
                <b className="text-white">Marcar tiempos:</b> escuchá la pista y apretá una tecla
                en cada línea. Mucho más rápido y preciso que escribir mm:ss a mano.
              </p>
              <button onClick={abrirTap} className="btn text-xs font-bold whitespace-nowrap">
                ◉ Marcar tiempos
              </button>
            </div>
          ) : (
            <div className="card mb-3 border-cyan-400/40 bg-cyan-400/5 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-black">Marcando tiempos</p>
                <p className="font-mono text-xs text-neutral-400">
                  {Math.min(tapIdx, lyrics.length)} / {lyrics.length} · {fmtT(tapPos)}
                </p>
              </div>

              {tapUrl && (
                <audio ref={tapAudio} src={tapUrl} controls className="w-full"
                       onEnded={() => { /* deja la marcación como está */ }} />
              )}

              {/* Línea actual, grande */}
              <div className="rounded-lg border border-neutral-800 bg-black/50 p-4 text-center">
                {tapIdx < lyrics.length ? (
                  <>
                    <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-1">
                      próxima a marcar
                    </p>
                    <p className="text-xl font-black leading-tight">{lyrics[tapIdx].text}</p>
                    {lyrics[tapIdx + 1] && (
                      <p className="text-xs text-neutral-600 mt-2 truncate">
                        después: {lyrics[tapIdx + 1].text}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-lg font-black text-green-400">
                    ✓ Marcaste las {lyrics.length} líneas
                  </p>
                )}
              </div>

              <button onClick={marcarAhora} disabled={tapIdx >= lyrics.length}
                      className="w-full rounded-xl py-4 text-lg font-black bg-cyan-400 text-black disabled:opacity-40">
                MARCAR ESTA LÍNEA
              </button>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <button onClick={deshacerTap} disabled={tapIdx <= 0} className="btn text-xs disabled:opacity-40">
                  ← Deshacer
                </button>
                <button onClick={() => setTapIdx(i => Math.min(i + 1, lyrics.length))}
                        disabled={tapIdx >= lyrics.length} className="btn text-xs disabled:opacity-40">
                  Saltear línea →
                </button>
                <span className="flex-1" />
                <button onClick={cerrarTap} className="btn text-xs text-neutral-400">Cancelar</button>
                <button onClick={guardarTap} disabled={!Object.keys(tapMarks).length}
                        className="btn text-xs font-bold text-green-400 disabled:opacity-40">
                  Guardar {Object.keys(tapMarks).length} tiempos
                </button>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-neutral-900">
                <label className="text-[11px] text-neutral-400">Compensar mi reacción</label>
                <input type="number" step="0.05" min="0" max="0.6" value={tapReaccion}
                       onChange={e => setTapReaccion(parseFloat(e.target.value) || 0)}
                       className="input text-center" style={{maxWidth: 80}} />
                <span className="text-[11px] text-neutral-500">s</span>
                <span className="text-[10px] text-neutral-600 flex-1 leading-snug">
                  Se resta de cada marca: uno aprieta después de escuchar la frase.
                </span>
              </div>

              <p className="text-[10px] text-neutral-500 font-mono">
                ESPACIO marcar · BACKSPACE deshacer · P play/pausa · ESC salir
              </p>
            </div>
          )}
          {tapErr && (
            <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/30 rounded-lg p-3 mb-3">{tapErr}</p>
          )}

          <p className="text-xs text-neutral-500 mb-2">
            Cada línea con su tiempo desde el inicio (<code className="text-cyan-400">90</code> o <code className="text-cyan-400">1:30</code> es lo mismo).
            En la columna <span className="text-purple-400">♪ Cue</span> podés asignar una nota MIDI (ej: <code className="text-purple-400">D4</code>) — Logic mandará esa nota para anclar la posición a esta línea.
          </p>

          {/* Barra de herramientas: auto-asignar + exportar */}
          <div className="card mb-3 flex flex-wrap items-center gap-2">
            <p className="text-xs text-neutral-400 flex-1 min-w-0">
              <b className="text-white">Automatizar:</b> asigná notas MIDI a todas las líneas y exportá a Logic en 2 clicks.
            </p>
            <button onClick={autoAssignNotesToLyrics}
                    className="btn btn-secondary text-xs"
                    title="Borra todos los cues y asigna C3, C#3, D3... en orden a cada línea">
              🤖 Auto-asignar notas
            </button>
            <button onClick={copyForLogic}
                    className="btn text-xs"
                    style={{ background: '#a78bfa', color: '#000' }}
                    title="Copia el texto al portapapeles en formato Logic Event List">
              📋 Copiar para Logic
            </button>
            <button onClick={downloadMidi}
                    className="btn btn-secondary text-xs"
                    title="Descarga archivo .mid para arrastrar a Logic">
              📥 .mid
            </button>
          </div>

          {lyrics.map(l => {
            const linkedCue = findCueForLyric(l);
            return (
            <div key={l.id} className="card flex items-center gap-2">
              <input type="text"
                     defaultValue={formatTime(l.start_time_seconds)}
                     key={`t-${l.id}-${l.start_time_seconds}`}
                     onBlur={(e) => {
                       const oldTime = l.start_time_seconds;
                       const sec = parseTimeInput(e.target.value);
                       e.target.value = formatTime(sec);
                       updateLyric(l.id, { start_time_seconds: sec });
                       saveLyric(l.id);
                       syncCueTimeWithLyric(l, oldTime, sec);
                     }}
                     className="input w-20 text-center mono text-xs"
                     placeholder="1:30" />
              <input value={l.text}
                     onChange={e => updateLyric(l.id, { text: e.target.value })}
                     onBlur={() => saveLyric(l.id)}
                     className="input flex-1" />
              <input type="text"
                     defaultValue={linkedCue ? noteNumToName(linkedCue.midi_note) : ''}
                     key={`cue-${l.id}-${linkedCue?.midi_note || 'none'}`}
                     onBlur={(e) => {
                       const val = e.target.value.trim();
                       if (val) setCueOnLyric(l, val);
                       else if (linkedCue) removeCueFromLyric(l);
                     }}
                     title="Nota MIDI que dispara salto a esta línea (ej: D4). Dejá vacío para no usar cue."
                     className="input w-20 text-center mono uppercase text-xs"
                     placeholder="♪ cue"
                     style={linkedCue
                       ? { borderColor: '#a78bfa', color: '#a78bfa', fontWeight: 700 }
                       : { borderStyle: 'dashed' }} />
              <button onClick={() => insertLyricAfter(l.id)}
                      title="Insertar línea abajo"
                      className="text-neutral-600 hover:text-cyan-400 px-2 text-lg leading-none">+</button>
              <button onClick={() => removeLyric(l.id)}
                      title="Borrar línea"
                      className="text-neutral-600 hover:text-red-400 px-2">×</button>
            </div>
            );
          })}
          <div className="flex gap-2">
            <button onClick={addLyric} className="flex-1 card border-dashed text-neutral-500 hover:text-white hover:border-cyan-400/40 transition">
              + Agregar línea
            </button>
            <button onClick={() => {
              const sorted = [...lyrics].sort((a,b) => a.start_time_seconds - b.start_time_seconds);
              setLyrics(sorted);
            }} className="card border-dashed text-neutral-500 hover:text-white hover:border-cyan-400/40 transition px-4">
              ↕ Ordenar por tiempo
            </button>
          </div>
        </div>
      )}

      {tab === "cues" && (
        <div className="space-y-2">
          <p className="text-xs text-neutral-500 mb-2">
            Cada Note On que Logic mande dispara un salto. Tiempo en <code className="text-cyan-400">segundos</code> o <code className="text-cyan-400">mm:ss</code>.
          </p>
          {cues.map(c => (
            <div key={c.id} className="card flex items-center gap-2">
              <input value={noteNumToName(c.midi_note)}
                     onChange={e => { const num = noteNameToNum(e.target.value); if (num !== null) updateCue(c.id, { midi_note: num }); }}
                     onBlur={() => saveCue(c.id)}
                     className="input w-16 text-center mono uppercase text-xs" />
              <input value={c.label}
                     onChange={e => updateCue(c.id, { label: e.target.value })}
                     onBlur={() => saveCue(c.id)}
                     className="input flex-1" placeholder="Verse 1" />
              <input type="text"
                     defaultValue={formatTime(c.jump_to_seconds)}
                     key={`ct-${c.id}-${c.jump_to_seconds}`}
                     onBlur={(e) => {
                       const sec = parseTimeInput(e.target.value);
                       e.target.value = formatTime(sec);
                       updateCue(c.id, { jump_to_seconds: sec });
                       saveCue(c.id);
                     }}
                     className="input w-20 text-center mono text-xs"
                     placeholder="1:30" />
              <button onClick={() => insertCueAfter(c.id)}
                      title="Insertar cue abajo"
                      className="text-neutral-600 hover:text-cyan-400 px-2 text-lg leading-none">+</button>
              <button onClick={() => removeCue(c.id)}
                      title="Borrar cue"
                      className="text-neutral-600 hover:text-red-400 px-2">×</button>
            </div>
          ))}
          <div className="flex gap-2">
            <button onClick={addCue} className="flex-1 card border-dashed text-neutral-500 hover:text-white hover:border-cyan-400/40 transition">
              + Agregar cue MIDI
            </button>
            <button onClick={() => {
              const sorted = [...cues].sort((a,b) => a.jump_to_seconds - b.jump_to_seconds);
              setCues(sorted);
            }} className="card border-dashed text-neutral-500 hover:text-white hover:border-cyan-400/40 transition px-4">
              ↕ Ordenar por tiempo
            </button>
          </div>
        </div>
      )}

      {tab === "chords" && (
        <div className="space-y-2">

          {/* ---------- EDITOR DE ONDA: acordes clavados en su compás ---------- */}
          {!chordBarDur ? (
            <div className="card mb-3">
              <p className="text-xs text-neutral-500">
                Cargá el <b className="text-neutral-300">BPM</b> y el compás en la solapa <b className="text-neutral-300">Datos</b>:
                los acordes se ubican por compás y sin tempo no hay grilla.
              </p>
            </div>
          ) : song.audio_path ? (
            waveUrl ? (
              <WaveformLyricsEditor
                audioUrl={waveUrl}
                lyrics={chordItems}
                offsetSeconds={Number(song.offset_seconds) || 0}
                endSeconds={song.audio_end_seconds != null ? Number(song.audio_end_seconds) : null}
                onChangeTime={chordWaveTime}
                onChangeTimeMany={chordWaveTimeMany}
                onChangeText={chordSetSymbol}
                onInsertAt={sec => chordInsertBar(secToBar(sec))}
                onRemove={removeChord}
                bpm={Number(song.bpm) || 0}
                timeSignature={song.time_signature || "4/4"}
                onChangeOffset={guardarOffset}
                snapSeconds={chordBarDur}
                itemNoun="acorde"
                itemNounPlural="acordes"
                pinShowsText
                contextLines={lyrics}
                textPlaceholder="Am7, F/A, C#m…"
                belowWave={bassNotesErr ? undefined : v => (
                  <BassStaff
                    notes={bassNotes}
                    bpm={Number(song.bpm) || 0}
                    beatsPerBar={chordBpb}
                    offset={v.offset}
                    pps={v.pps}
                    fullW={v.fullW}
                    getAudio={v.getAudio}
                    tuningSemis={tuneSemis}
                    tuningCents={tuneCents}
                    preferFlats={FLAT_KEYS.has(String(song.key || "").trim())}
                    volume={staffVol}
                    onAdd={addBassNote}
                    onUpdate={updateBassNote}
                    onRemove={removeBassNote}
                  />
                )}
              />
            ) : waveUrlErr ? (
              <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/30 rounded-lg p-3 mb-3">
                No pude firmar la URL del audio: {waveUrlErr}
              </p>
            ) : (
              <div className="card mb-3">
                <p className="text-xs text-neutral-500 animate-pulse">Preparando el editor de onda…</p>
              </div>
            )
          ) : (
            <div className="card mb-3">
              <p className="text-xs text-neutral-500">
                Subí la pista en la solapa <b className="text-neutral-300">Audio</b> y vas a poder
                clavar cada acorde sobre la forma de onda, con la grilla de compases.
              </p>
            </div>
          )}

          {/* ---------- Pentagrama: afinación del tema + sonido ---------- */}
          {chordBarDur > 0 && (bassNotesErr ? (
            <div className="card border-amber-400/40">
              <p className="text-xs text-amber-300">
                Para el pentagrama del bajo falta correr <b className="mono">migration_bass_notes.sql</b> en
                Supabase (SQL Editor → Run). Después recargá la página.
              </p>
            </div>
          ) : (
            <div className="card flex flex-wrap items-center gap-2">
              <span className="text-xs font-black text-amber-300 whitespace-nowrap">𝄢 Pentagrama</span>
              <label className="flex items-center gap-1.5 text-[11px] text-neutral-400 whitespace-nowrap"
                     title="Volumen de las notas del pentagrama. Suenan solas cuando le das Play a la pista; en 0 quedan mudas.">
                🔊 notas
                <input type="range" min={0} max={1} step={0.05} value={staffVol}
                       onChange={e => changeStaffVol(parseFloat(e.target.value))}
                       onPointerUp={() => playTone(soundingHz(45 + 12, tuneSemis, tuneCents), 0.3, staffVol)}
                       className="w-24 accent-amber-400" />
              </label>
              <span className="text-[11px] text-neutral-500 ml-2">{bassNotes.length} notas</span>
              <p className="basis-full order-last text-[11px] text-amber-200/80">
                Los acordes de arriba salen solos de la primera nota de cada compás (es lo que ve el bajista en el escenario),
                en el tramo que va de tu primera a tu última nota; fuera de ese tramo no se toca nada.
                Si querés sumarle la calidad, doble click en el acorde y escribí <span className="mono">Bm</span>, <span className="mono">E7</span>…:
                se mantiene mientras no cambies esa nota.
              </p>
              <p className="basis-full order-last text-[10px] text-neutral-600 font-mono">
                click en el pentagrama: nota en esa corchea (shift = ♯, alt = ♭) · click en una nota: suena · arrastrarla:
                tiempo y altura · con una nota elegida: ↑/↓ semitono, shift+↑/↓ octava, − / = más corta / más larga,
                Supr borra · el bajo se escribe una octava arriba de cómo suena · la afinación cambia solo el sonido, no lo escrito
              </p>
              <span className="flex-1" />
              <span className="text-[11px] text-neutral-400 whitespace-nowrap" title="Cuánto se aparta la afinación real del tema de la escrita. Las notas se siguen viendo igual en el pentagrama; cambia solo cómo suenan.">
                Afinación del tema
              </span>
              <select value={tuneSemis} onChange={e => saveTuning({ tuning_semitones: parseInt(e.target.value, 10) || 0 })}
                      className="bg-black border border-neutral-800 rounded px-2 py-1 text-[11px]">
                {Array.from({ length: 13 }, (_, i) => i - 6).map(v => (
                  <option key={v} value={v}>{v > 0 ? `+${v}` : v} st{v === -1 ? " (½ tono abajo)" : v === -2 ? " (1 tono abajo)" : ""}</option>
                ))}
              </select>
              <button onClick={() => saveTuning({ tuning_cents: Math.max(-50, tuneCents - 1) })} className="btn text-[11px] px-2">−1</button>
              <input key={`cents-${tuneCents}`} defaultValue={tuneCents}
                     onBlur={e => { const v = Math.max(-50, Math.min(50, parseFloat(e.target.value) || 0)); if (v !== tuneCents) saveTuning({ tuning_cents: v }); }}
                     onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                     className="input w-14 text-center mono text-xs" />
              <button onClick={() => saveTuning({ tuning_cents: Math.min(50, tuneCents + 1) })} className="btn text-[11px] px-2">+1</button>
              <span className="text-[10px] text-neutral-500">cents</span>
              <button onClick={() => saveTuning({ tuning_semitones: 0, tuning_cents: -32 })} className="btn text-[11px]"
                      title="La = 432 Hz (−31,8 cents respecto de 440)">La 432</button>
              <button onClick={() => playTone(soundingHz(81, tuneSemis, tuneCents), 1.2, Math.max(staffVol, 0.3))} className="btn text-[11px]"
                      title="Toca un La de referencia con la afinación del tema, para comparar de oído con la pista">
                ♪ La {soundingHz(81, tuneSemis, tuneCents).toFixed(1)} Hz
              </button>
            </div>
          ))}

          {chordsMismatch.length > 0 && (
            <div className="card flex flex-wrap items-center gap-2 border-amber-400/40">
              <p className="text-xs text-amber-300 flex-1 min-w-0">
                ⚠ {chordsMismatch.length} acorde{chordsMismatch.length > 1 ? "s" : ""} se
                {chordsMismatch.length > 1 ? " ven" : " ve"} distinto en el escenario de lo que dice el símbolo
                (ej. <b>{chordsMismatch[0].chord_symbol}</b> aparece como <b>{chordShown(chordsMismatch[0]) || "—"}</b>).
              </p>
              <button onClick={fixAllChordFields} className="btn text-xs">Arreglar todos</button>
            </div>
          )}

          {/* ---------- Lista (para ver todo de un vistazo o escribir de corrido) ---------- */}
          <p className="text-xs text-neutral-500 mb-2">
            Escribí el acorde completo (<span className="mono">Am7</span>, <span className="mono">F/A</span>,
            <span className="mono"> C#m</span>…): la raíz y la calidad salen solas. Cada acorde dura hasta el siguiente.
          </p>
          {chordsWithCounts(chords).map(c => (
            <div key={c.id} className="card flex items-center gap-2">
              <span className="mono text-[10px] text-neutral-500">comp.</span>
              <input key={`bar-${c.id}-${c.start_bar}`} defaultValue={c.start_bar + 1}
                     onBlur={e => {
                       const v = parseInt(e.target.value, 10);
                       if (isFinite(v) && v >= 1 && v - 1 !== c.start_bar) chordSetBar(c.id, v - 1);
                       else e.target.value = String(c.start_bar + 1);
                     }}
                     onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                     className="input w-16 text-center mono text-xs" />
              <input key={`sym-${c.id}-${c.chord_symbol}`} defaultValue={c.chord_symbol === "?" ? "" : c.chord_symbol}
                     onBlur={e => { if (e.target.value.trim() && e.target.value.trim() !== c.chord_symbol) chordSetSymbol(c.id, e.target.value); }}
                     onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                     className="input w-28 font-bold" placeholder="Am7" />
              <span className="mono text-[10px] text-neutral-500 whitespace-nowrap">
                {c.bar_count} comp.{chordBarDur ? ` · ${Math.floor(c.start_bar * chordBarDur / 60)}:${String(Math.floor((c.start_bar * chordBarDur) % 60)).padStart(2, "0")}` : ""}
              </span>
              <span className="flex-1" />
              <button onClick={() => removeChord(c.id)} className="text-neutral-600 hover:text-red-400 px-2" title="Borrar acorde">×</button>
            </div>
          ))}
          <button onClick={addChord} className="w-full card border-dashed text-neutral-500 hover:text-white hover:border-cyan-400/40 transition">
            + Agregar acorde
          </button>
        </div>
      )}
    </div>
  );
}
