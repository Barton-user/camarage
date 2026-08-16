"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-client";
import Link from "next/link";

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

export default function SongEditor() {
  const supabase = createClient();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [song, setSong] = useState<any>(null);
  const [lyrics, setLyrics] = useState<any[]>([]);
  const [cues, setCues] = useState<any[]>([]);
  const [chords, setChords] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"meta"|"lyrics"|"cues"|"chords"|"audio">("meta");
  // --- Pistas de audio ---
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [audioErr, setAudioErr] = useState<string|null>(null);
  const [previewUrl, setPreviewUrl] = useState<string|null>(null);

  useEffect(() => { if (id) load(); }, [id]);

  async function load() {
    const { data: s } = await supabase.from("songs").select("*").eq("id", id).single();
    setSong(s);
    const { data: l } = await supabase.from("lyric_lines").select("*").eq("song_id", id).order("order_index");
    setLyrics(l || []);
    const { data: c } = await supabase.from("midi_cues").select("*").eq("song_id", id).order("order_index");
    setCues(c || []);
    const { data: ch } = await supabase.from("chord_charts").select("*").eq("song_id", id).order("order_index");
    setChords(ch || []);
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
  const MAX_BYTES = 50 * 1024 * 1024;   // tope del plan gratis de Supabase

  function fmtBytes(n: number) {
    if (!n) return "—";
    return n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.round(n / 1024) + " KB";
  }

  async function uploadAudio(file: File) {
    if (!song) return;
    setAudioErr(null);

    if (file.size > MAX_BYTES) {
      setAudioErr(
        `El archivo pesa ${fmtBytes(file.size)} y el máximo es 50 MB. ` +
        `Si es un WAV, exportalo como MP3 320 kbps: suena igual por in-ears y pesa la cuarta parte.`
      );
      return;
    }

    setUploading(true);
    setUploadPct(0);
    try {
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
      const patch = { audio_path: null, audio_filename: null, audio_bytes: null, audio_updated_at: null };
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
  async function addChord() {
    const next = chords.length;
    const last = chords.at(-1);
    const { data } = await supabase.from("chord_charts").insert({
      song_id: id, order_index: next,
      chord_symbol: "C", root_note: "C", quality: "",
      start_bar: (last?.start_bar || 0) + (last?.bar_count || 2),
      bar_count: 2,
    }).select().single();
    if (data) setChords([...chords, data]);
  }
  function updateChord(chordId: string, patch: any) {
    setChords(chords.map(c => c.id === chordId ? { ...c, ...patch } : c));
  }
  async function saveChord(chordId: string) {
    const c = chords.find(x => x.id === chordId);
    if (!c) return;
    await supabase.from("chord_charts").update({
      chord_symbol: c.chord_symbol, root_note: c.root_note, quality: c.quality,
      start_bar: c.start_bar, bar_count: c.bar_count,
    }).eq("id", chordId);
  }
  async function removeChord(chordId: string) {
    await supabase.from("chord_charts").delete().eq("id", chordId);
    setChords(chords.filter(c => c.id !== chordId));
  }

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
              <label className="label">Notas internas</label>
              <textarea value={song.notes || ""} onChange={e => setSong({...song, notes: e.target.value})} onBlur={saveSong} className="input" rows={3} placeholder="Recordatorios para la banda" />
            </div>
          </div>
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
                    {fmtBytes(song.audio_bytes)}
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
                <button onClick={removeAudio} disabled={uploading}
                        className="btn text-xs text-red-400 hover:text-red-300">
                  Borrar pista
                </button>
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
                MP3, M4A, AAC, WAV u OGG · hasta 50 MB
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
            <p><strong className="text-neutral-300">Formato recomendado:</strong> MP3 320 kbps. Un WAV de más de 5 minutos no entra en el límite de 50 MB.</p>
            <p><strong className="text-neutral-300">Ojo con el arranque:</strong> si el bounce tiene silencio antes del compás 1, la letra va a ir adelantada esa misma cantidad. Exportá desde el compás 1 exacto.</p>
            <p><strong className="text-neutral-300">Click:</strong> no hace falta que lo incluyas. La app lo genera con el BPM de la canción y lo manda al canal derecho.</p>
          </div>
        </div>
      )}

      {tab === "lyrics" && (
        <div className="space-y-2">
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
          <p className="text-xs text-neutral-500 mb-2">Progresión armónica para la vista del bajista. Cada acorde con cuántos compases dura.</p>
          {chords.map(c => (
            <div key={c.id} className="card flex items-center gap-2">
              <input value={c.start_bar}
                     onChange={e => updateChord(c.id, { start_bar: parseInt(e.target.value)||0 })}
                     onBlur={() => saveChord(c.id)}
                     className="input w-16 text-center mono text-xs" placeholder="bar" />
              <span className="mono text-[10px] text-neutral-500">bar</span>
              <input value={c.chord_symbol}
                     onChange={e => updateChord(c.id, { chord_symbol: e.target.value })}
                     onBlur={() => saveChord(c.id)}
                     className="input w-24 font-bold" placeholder="Am7" />
              <input value={c.root_note}
                     onChange={e => updateChord(c.id, { root_note: e.target.value })}
                     onBlur={() => saveChord(c.id)}
                     className="input w-16 text-center mono" placeholder="A" />
              <input value={c.quality}
                     onChange={e => updateChord(c.id, { quality: e.target.value })}
                     onBlur={() => saveChord(c.id)}
                     className="input w-20 mono" placeholder="m7" />
              <input type="number" min="1" value={c.bar_count}
                     onChange={e => updateChord(c.id, { bar_count: parseInt(e.target.value)||1 })}
                     onBlur={() => saveChord(c.id)}
                     className="input w-16 text-center mono text-xs" />
              <span className="mono text-[10px] text-neutral-500">bars</span>
              <button onClick={() => removeChord(c.id)} className="text-neutral-600 hover:text-red-400 px-2">×</button>
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
