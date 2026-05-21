"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase-client";
import Link from "next/link";

export default function SetlistDetailPage() {
  const supabase = createClient();
  const { id } = useParams<{ id: string }>();
  const [setlist, setSetlist] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]); // setlist_songs joined with songs
  const [availableSongs, setAvailableSongs] = useState<any[]>([]);
  const [adding, setAdding] = useState(false);

  useEffect(() => { if (id) load(); }, [id]);

  async function load() {
    const { data: sl } = await supabase.from("setlists").select("*").eq("id", id).single();
    setSetlist(sl);
    const { data: songsInList } = await supabase
      .from("setlist_songs")
      .select("id, position, song_id, transition_notes, songs!inner(id,title,key,bpm,time_signature,program_change)")
      .eq("setlist_id", id)
      .order("position");
    setItems(songsInList || []);
    if (sl) {
      const { data: allSongs } = await supabase.from("songs").select("*").eq("band_id", sl.band_id).order("title");
      const usedIds = new Set((songsInList || []).map((i: any) => i.song_id));
      setAvailableSongs((allSongs || []).filter(s => !usedIds.has(s.id)));
    }
  }

  async function addSong(songId: string) {
    const maxPos = items.length > 0 ? Math.max(...items.map(i => i.position)) : 0;
    await supabase.from("setlist_songs").insert({ setlist_id: id, song_id: songId, position: maxPos + 1 });
    setAdding(false);
    load();
  }

  async function removeSong(itemId: string) {
    await supabase.from("setlist_songs").delete().eq("id", itemId);
    load();
  }

  async function move(itemId: string, direction: "up" | "down") {
    const idx = items.findIndex(i => i.id === itemId);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= items.length) return;
    const a = items[idx]; const b = items[swapIdx];
    // Workaround del unique constraint: usar position negativa temporal
    await supabase.from("setlist_songs").update({ position: -1 }).eq("id", a.id);
    await supabase.from("setlist_songs").update({ position: a.position }).eq("id", b.id);
    await supabase.from("setlist_songs").update({ position: b.position }).eq("id", a.id);
    load();
  }

  if (!setlist) return <div className="p-6">Cargando…</div>;

  return (
    <div className="p-6 max-w-4xl">
      <Link href="/setlists" className="text-xs text-neutral-500 hover:text-white mb-2 inline-block">← Setlists</Link>
      <h1 className="text-3xl font-black">{setlist.name}</h1>
      <p className="text-neutral-400 text-sm mb-6">
        {setlist.show_date || 'sin fecha'} {setlist.venue && `· ${setlist.venue}`}
      </p>

      <div className="flex items-center justify-between mb-3">
        <p className="mono text-[10px] uppercase tracking-widest text-neutral-500">{items.length} canciones</p>
        <button onClick={() => setAdding(true)} className="btn btn-primary text-xs">+ Agregar canción</button>
      </div>

      {adding && (
        <div className="card mb-4">
          <p className="label">Elegí una canción del catálogo</p>
          {availableSongs.length === 0 ? (
            <p className="text-sm text-neutral-500">
              No hay canciones disponibles. <Link href="/songs" className="text-cyan-400 underline">Creá una primero</Link>.
            </p>
          ) : (
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {availableSongs.map(s => (
                <button key={s.id} onClick={() => addSong(s.id)}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-neutral-900 transition">
                  <p className="font-bold text-sm">{s.title}</p>
                  <p className="mono text-[10px] text-neutral-500">
                    {s.key} · {s.bpm} BPM · PC#{String(s.program_change ?? '–').padStart(2,'0')}
                  </p>
                </button>
              ))}
            </div>
          )}
          <button onClick={() => setAdding(false)} className="text-xs text-neutral-500 mt-2">Cancelar</button>
        </div>
      )}

      <div className="space-y-2">
        {items.map((item, idx) => (
          <div key={item.id} className="card flex items-center gap-3">
            <span className="mono text-xs text-neutral-500 w-8 text-center">{String(idx+1).padStart(2,'0')}</span>
            <Link href={`/songs/${item.song_id}`} className="flex-1 min-w-0">
              <p className="font-bold truncate">{item.songs.title}</p>
              <p className="mono text-[10px] text-neutral-500">
                {item.songs.key} · {item.songs.bpm} BPM · {item.songs.time_signature} · PC#{String(item.songs.program_change ?? '–').padStart(2,'0')}
              </p>
            </Link>
            <div className="flex items-center gap-1">
              <button onClick={() => move(item.id,"up")} disabled={idx===0} className="px-2 py-1 text-neutral-400 disabled:opacity-30 hover:text-white">↑</button>
              <button onClick={() => move(item.id,"down")} disabled={idx===items.length-1} className="px-2 py-1 text-neutral-400 disabled:opacity-30 hover:text-white">↓</button>
              <button onClick={() => removeSong(item.id)} className="px-2 py-1 text-neutral-600 hover:text-red-400">×</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
