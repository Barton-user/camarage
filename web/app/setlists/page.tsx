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
  // --- edicion en linea ---
  const [editId, setEditId] = useState<string | null>(null);
  const [eName, setEName] = useState("");
  const [eDate, setEDate] = useState("");
  const [eVenue, setEVenue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Cuantas canciones tiene cada setlist. Sirve para avisar antes de borrar:
  // borrar un setlist se lleva sus canciones de la lista (no del catalogo).
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => { (async () => {
    const { data: bs } = await supabase.from("bands").select("*").order("created_at");
    setBands(bs || []);
    if (bs && bs.length > 0) setBandId(bs[0].id);
  })(); }, []);

  useEffect(() => { if (bandId) loadSetlists(); }, [bandId]);

  async function loadSetlists() {
    // Pido el conteo de canciones embebido. Si por cualquier motivo esa consulta
    // falla, NO dejo la pantalla vacía: caigo al select simple y muestro la lista
    // sin los conteos. Perder un número es aceptable; perder la lista, no.
    const conConteo = await supabase.from("setlists")
      .select("*, setlist_songs(count)")
      .eq("band_id", bandId)
      .order("created_at", { ascending: false });

    if (!conConteo.error) {
      const data = conConteo.data || [];
      setSetlists(data);
      const c: Record<string, number> = {};
      data.forEach((s: any) => {
        c[s.id] = Array.isArray(s.setlist_songs) ? (s.setlist_songs[0]?.count ?? 0) : 0;
      });
      setCounts(c);
      setError(null);
      return;
    }

    const simple = await supabase.from("setlists").select("*")
      .eq("band_id", bandId)
      .order("created_at", { ascending: false });
    if (simple.error) { setError(simple.error.message); return; }
    setSetlists(simple.data || []);
    setCounts({});
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

  function startEdit(s: any) {
    setError(null);
    setEditId(s.id);
    setEName(s.name || "");
    setEDate(s.show_date || "");
    setEVenue(s.venue || "");
  }

  function cancelEdit() {
    setEditId(null); setEName(""); setEDate(""); setEVenue(""); setError(null);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editId) return;
    const nombre = eName.trim();
    if (!nombre) { setError("El nombre no puede quedar vacío."); return; }
    setSaving(true); setError(null);
    const { error } = await supabase.from("setlists")
      .update({ name: nombre, show_date: eDate || null, venue: eVenue.trim() || null })
      .eq("id", editId);
    setSaving(false);
    if (error) { setError(error.message); return; }
    cancelEdit();
    loadSetlists();
  }

  async function remove(s: any) {
    const n = counts[s.id];
    if (n === undefined) {
      // Sin conteo no puedo decir cuántas canciones se van: lo digo así.
      if (!confirm(`Vas a borrar el setlist "${s.name}" y su lista de canciones.\n\n` +
                   `Las canciones siguen en el catálogo.\n\nEsto no se puede deshacer.`)) return;
      const { error } = await supabase.from("setlists").delete().eq("id", s.id);
      if (error) { setError("No se pudo borrar: " + error.message); return; }
      if (editId === s.id) cancelEdit();
      loadSetlists();
      return;
    }
    // Decir exactamente qué se pierde y qué no. El catálogo de canciones NO se
    // toca: se borra la lista, no las canciones.
    const aviso = n > 0
      ? `Vas a borrar el setlist "${s.name}" y sus ${n} canciones DE ESTA LISTA.\n\n` +
        `Las canciones siguen en el catálogo, con sus letras y tiempos intactos.\n\nEsto no se puede deshacer.`
      : `Vas a borrar el setlist "${s.name}", que está vacío.\n\nEsto no se puede deshacer.`;
    if (!confirm(aviso)) return;
    setError(null);
    const { error } = await supabase.from("setlists").delete().eq("id", s.id);
    if (error) { setError("No se pudo borrar: " + error.message); return; }
    if (editId === s.id) cancelEdit();
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

      {error && editId === null && (
        <div className="card mb-4 border-red-900">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

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
            <div key={s.id} className="card">
              {editId === s.id ? (
                /* ---------- modo edición ---------- */
                <form onSubmit={saveEdit} className="space-y-3">
                  <div>
                    <label className="label">Nombre</label>
                    <input autoFocus required value={eName} onChange={e => setEName(e.target.value)}
                           className="input" placeholder="Vivo Niceto" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">Fecha del show</label>
                      <input type="date" value={eDate} onChange={e => setEDate(e.target.value)} className="input" />
                    </div>
                    <div>
                      <label className="label">Venue</label>
                      <input value={eVenue} onChange={e => setEVenue(e.target.value)}
                             className="input" placeholder="Niceto Club" />
                    </div>
                  </div>
                  <p className="text-[10px] text-neutral-600">
                    Dejá la fecha o el venue en blanco para borrarlos.
                  </p>
                  {error && <p className="text-xs text-red-400">{error}</p>}
                  <div className="flex gap-2">
                    <button type="submit" disabled={saving} className="btn btn-primary text-xs disabled:opacity-50">
                      {saving ? "Guardando…" : "Guardar"}
                    </button>
                    <button type="button" onClick={cancelEdit} className="btn btn-secondary text-xs">Cancelar</button>
                  </div>
                </form>
              ) : (
                /* ---------- modo lectura ---------- */
                <div className="flex items-center justify-between gap-3">
                  <Link href={`/setlists/${s.id}`} className="flex-1 min-w-0">
                    <p className="font-bold truncate">{s.name}</p>
                    <p className="mono text-[10px] text-neutral-500">
                      {s.show_date || 'sin fecha'}{s.venue ? ` · ${s.venue}` : ''}
                      {counts[s.id] !== undefined ? ` · ${counts[s.id]} canciones` : ''}
                    </p>
                  </Link>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => startEdit(s)} title="Editar nombre, fecha y venue"
                            className="px-2 py-1 text-xs text-neutral-400 hover:text-white">Editar</button>
                    <button onClick={() => remove(s)} title="Borrar setlist"
                            className="px-2 py-1 text-xs text-neutral-600 hover:text-red-400">Borrar</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
