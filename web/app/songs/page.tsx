"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-client";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SongsPage() {
  const supabase = createClient();
  const router = useRouter();
  const [songs, setSongs] = useState<any[]>([]);
  const [bands, setBands] = useState<any[]>([]);
  const [bandId, setBandId] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", key: "C", bpm: 120, time_signature: "4/4", program_change: "" });

  useEffect(() => { (async () => {
    const { data: bs } = await supabase.from("bands").select("*").order("created_at");
    setBands(bs || []);
    if (bs && bs.length > 0) setBandId(bs[0].id);
  })(); }, []);

  useEffect(() => { if (bandId) load(); }, [bandId]);

  async function load() {
    const { data } = await supabase.from("songs").select("*").eq("band_id", bandId).order("title");
    setSongs(data || []);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !bandId) return;
    const { data, error } = await supabase.from("songs").insert({
      band_id: bandId,
      title: form.title.trim(),
      key: form.key || null,
      bpm: form.bpm || 120,
      time_signature: form.time_signature || "4/4",
      program_change: form.program_change ? parseInt(form.program_change, 10) : null,
    }).select().single();
    if (error) { alert(error.message); return; }
    setCreating(false);
    setForm({ title: "", key: "C", bpm: 120, time_signature: "4/4", program_change: "" });
    if (data) router.push(`/songs/${data.id}`);
  }

  if (bands.length === 0) {
    return (
      <div className="p-6 max-w-4xl">
        <h1 className="text-3xl font-black mb-1">Canciones</h1>
        <div className="card mt-4">
          <p className="text-neutral-400">Primero creá una banda en <Link href="/bands" className="text-cyan-400 underline">Bandas</Link>.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-black">Canciones</h1>
          <p className="text-neutral-400 text-sm">Catálogo completo de la banda</p>
        </div>
        <button onClick={() => setCreating(true)} className="btn btn-primary">+ Nueva canción</button>
      </div>

      {bands.length > 1 && (
        <div className="mb-4">
          <label className="label">Banda</label>
          <select value={bandId} onChange={e => setBandId(e.target.value)} className="input max-w-xs">
            {bands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      )}

      {creating && (
        <form onSubmit={create} className="card mb-4 space-y-3">
          <div>
            <label className="label">Título</label>
            <input autoFocus required value={form.title} onChange={e => setForm({...form, title: e.target.value})} className="input" placeholder="Lluvia de Neón" />
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div><label className="label">Tonalidad</label><input value={form.key} onChange={e => setForm({...form, key: e.target.value})} className="input" /></div>
            <div><label className="label">BPM</label><input type="number" min="40" max="240" value={form.bpm} onChange={e => setForm({...form, bpm: parseInt(e.target.value)||120})} className="input" /></div>
            <div><label className="label">Time sig</label><input value={form.time_signature} onChange={e => setForm({...form, time_signature: e.target.value})} className="input" /></div>
            <div><label className="label">PC#</label><input type="number" min="0" max="127" value={form.program_change} onChange={e => setForm({...form, program_change: e.target.value})} className="input" placeholder="opcional" /></div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary">Crear y editar</button>
            <button type="button" onClick={() => setCreating(false)} className="btn btn-secondary">Cancelar</button>
          </div>
        </form>
      )}

      {songs.length === 0 ? (
        <p className="text-neutral-500 text-center py-12">Sin canciones todavía</p>
      ) : (
        <div className="space-y-2">
          {songs.map(s => (
            <Link key={s.id} href={`/songs/${s.id}`} className="card hover:border-cyan-400/40 flex items-center justify-between transition">
              <div>
                <p className="font-bold">{s.title}</p>
                <p className="mono text-[10px] text-neutral-500">
                  {s.key || '—'} · {s.bpm} BPM · {s.time_signature} · PC#{String(s.program_change ?? '–').padStart(2,'0')}
                </p>
              </div>
              <span className="text-neutral-600">→</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
