"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-client";

interface Band {
  id: string;
  name: string;
  description?: string;
  cover_color?: string;
  created_at: string;
}

export default function BandsPage() {
  const supabase = createClient();
  const [bands, setBands] = useState<Band[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => { loadBands(); }, []);

  async function loadBands() {
    setLoading(true);
    const { data, error } = await supabase.from("bands").select("*").order("created_at", { ascending: false });
    if (!error) setBands(data || []);
    setLoading(false);
  }

  async function createBand(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("bands").insert({
      name: newName.trim(),
      owner_id: user.id,
    });
    if (error) { alert(error.message); return; }
    setNewName(""); setCreating(false);
    await loadBands();
  }

  async function deleteBand(id: string) {
    if (!confirm("¿Borrar banda y todo su contenido?")) return;
    const { error } = await supabase.from("bands").delete().eq("id", id);
    if (error) alert(error.message);
    await loadBands();
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-black">Bandas</h1>
          <p className="text-neutral-400 text-sm">Cada banda tiene sus canciones, setlists y miembros</p>
        </div>
        <button onClick={() => setCreating(true)} className="btn btn-primary">+ Nueva banda</button>
      </div>

      {creating && (
        <form onSubmit={createBand} className="card mb-4">
          <label className="label">Nombre de la banda</label>
          <input
            type="text" autoFocus required value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Mi banda"
            className="input mb-3"
          />
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary">Crear</button>
            <button type="button" onClick={() => { setCreating(false); setNewName(""); }} className="btn btn-secondary">
              Cancelar
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-neutral-500">Cargando…</p>
      ) : bands.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-neutral-400 mb-3">No tenés bandas todavía</p>
          {!creating && (
            <button onClick={() => setCreating(true)} className="btn btn-primary">Crear primera banda</button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {bands.map(b => (
            <div key={b.id} className="card flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg" style={{ background: b.cover_color || "#22d3ee" }}></div>
                <div>
                  <p className="font-bold">{b.name}</p>
                  {b.description && <p className="text-xs text-neutral-500">{b.description}</p>}
                </div>
              </div>
              <button onClick={() => deleteBand(b.id)} className="text-xs text-neutral-600 hover:text-red-400 transition">
                Borrar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
