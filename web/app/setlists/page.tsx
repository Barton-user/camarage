"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-client";
import Link from "next/link";

export default function SetlistsPage() {
  const supabase = createClient();
  const [setlists, setSetlists] = useState<any[]>([]);
  const [bands, setBands] = useState<any[]>([]);
  const [bandId, setBandId] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [showDate, setShowDate] = useState("");
  const [venue, setVenue] = useState("");

  useEffect(() => { (async () => {
    const { data: bs } = await supabase.from("bands").select("*").order("created_at");
    setBands(bs || []);
    if (bs && bs.length > 0) setBandId(bs[0].id);
  })(); }, []);

  useEffect(() => { if (bandId) loadSetlists(); }, [bandId]);

  async function loadSetlists() {
    const { data } = await supabase.from("setlists").select("*").eq("band_id", bandId).order("created_at", { ascending: false });
    setSetlists(data || []);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || !bandId) return;
    const { error } = await supabase.from("setlists").insert({
      band_id: bandId,
      name: newName.trim(),
      show_date: showDate || null,
      venue: venue || null,
    });
    if (error) { alert(error.message); return; }
    setNewName(""); setShowDate(""); setVenue(""); setCreating(false);
    loadSetlists();
  }

  async function remove(id: string) {
    if (!confirm("¿Borrar setlist?")) return;
    await supabase.from("setlists").delete().eq("id", id);
    loadSetlists();
  }

  if (bands.length === 0) {
    return (
      <div className="p-6 max-w-4xl">
        <h1 className="text-3xl font-black mb-1">Setlists</h1>
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
          <h1 className="text-3xl font-black">Setlists</h1>
          <p className="text-neutral-400 text-sm">Listas de canciones para cada show o ensayo</p>
        </div>
        <button onClick={() => setCreating(true)} className="btn btn-primary">+ Nuevo setlist</button>
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
            <label className="label">Nombre</label>
            <input autoFocus required value={newName} onChange={e => setNewName(e.target.value)} className="input" placeholder="Vivo Niceto" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Fecha del show</label>
              <input type="date" value={showDate} onChange={e => setShowDate(e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">Venue</label>
              <input value={venue} onChange={e => setVenue(e.target.value)} className="input" placeholder="Niceto Club" />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary">Crear</button>
            <button type="button" onClick={() => { setCreating(false); setNewName(""); setShowDate(""); setVenue(""); }} className="btn btn-secondary">Cancelar</button>
          </div>
        </form>
      )}

      {setlists.length === 0 ? (
        <p className="text-neutral-500 text-center py-12">Sin setlists todavía</p>
      ) : (
        <div className="space-y-2">
          {setlists.map(s => (
            <div key={s.id} className="card flex items-center justify-between">
              <Link href={`/setlists/${s.id}`} className="flex-1">
                <p className="font-bold">{s.name}</p>
                <p className="mono text-[10px] text-neutral-500">
                  {s.show_date || 'sin fecha'} {s.venue && `· ${s.venue}`}
                </p>
              </Link>
              <button onClick={() => remove(s.id)} className="text-xs text-neutral-600 hover:text-red-400">Borrar</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
