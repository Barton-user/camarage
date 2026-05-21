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

export default function SongEditor() {
  const supabase = createClient();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [song, setSong] = useState<any>(null);
  const [lyrics, setLyrics] = useState<any[]>([]);
  const [cues, setCues] = useState<any[]>([]);
  const [chords, setChords] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"meta"|"lyrics"|"cues"|"chords">("meta");

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

  // ===== LYRICS =====
  async function addLyric() {
    const next = lyrics.length;
    const lastT = lyrics.at(-1)?.start_time_seconds ?? 0;
    const { data } = await supabase.from("lyric_lines").insert({
      song_id: id, order_index: next, text: "Nueva línea", start_time_seconds: lastT + 4,
    }).select().single();
    if (data) setLyrics([...lyrics, data]);
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

  // ===== CUES MIDI =====
  async function addCue() {
    const next = cues.length;
    const lastCue = cues.at(-1);
    const newNote = lastCue ? Math.min(127, lastCue.midi_note + 2) : 60;
    const { data } = await supabase.from("midi_cues").insert({
      song_id: id, order_index: next,
      midi_note: newNote, label: "Nueva parte",
      jump_to_seconds: (lastCue?.jump_to_seconds || 0) + 8,
    }).select().single();
    if (data) setCues([...cues, data]);
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

      {tab === "lyrics" && (
        <div className="space-y-2">
          <p className="text-xs text-neutral-500 mb-2">Cada línea con su timestamp en segundos (desde el inicio de la canción).</p>
          {lyrics.map(l => (
            <div key={l.id} className="card flex items-center gap-2">
              <input type="number" min="0" step="0.5" value={l.start_time_seconds}
                     onChange={e => updateLyric(l.id, { start_time_seconds: parseFloat(e.target.value)||0 })}
                     onBlur={() => saveLyric(l.id)}
                     className="input w-20 text-center mono text-xs" />
              <span className="mono text-[10px] text-neutral-500">s</span>
              <input value={l.text}
                     onChange={e => updateLyric(l.id, { text: e.target.value })}
                     onBlur={() => saveLyric(l.id)}
                     className="input flex-1" />
              <button onClick={() => removeLyric(l.id)} className="text-neutral-600 hover:text-red-400 px-2">×</button>
            </div>
          ))}
          <button onClick={addLyric} className="w-full card border-dashed text-neutral-500 hover:text-white hover:border-cyan-400/40 transition">
            + Agregar línea
          </button>
        </div>
      )}

      {tab === "cues" && (
        <div className="space-y-2">
          <p className="text-xs text-neutral-500 mb-2">Cada Note On que Logic mande dispara un salto a un segundo específico.</p>
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
              <input type="number" min="0" step="0.5" value={c.jump_to_seconds}
                     onChange={e => updateCue(c.id, { jump_to_seconds: parseFloat(e.target.value)||0 })}
                     onBlur={() => saveCue(c.id)}
                     className="input w-20 text-center mono text-xs" />
              <span className="mono text-[10px] text-neutral-500">s</span>
              <button onClick={() => removeCue(c.id)} className="text-neutral-600 hover:text-red-400 px-2">×</button>
            </div>
          ))}
          <button onClick={addCue} className="w-full card border-dashed text-neutral-500 hover:text-white hover:border-cyan-400/40 transition">
            + Agregar cue MIDI
          </button>
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
