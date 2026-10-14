"use client";
/* Integrantes de la banda: crear cuentas, sumar a la banda, cambiar rol,
 * nombre o contraseña, y sacar. Todo pasa por /api/members (servidor), que
 * verifica que quien pide sea el dueño de la banda. */
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-client";
import { DEFAULT_PERMS, PERM_HELP, PERM_KEYS, PERM_LABELS, type Perms } from "@/lib/perms";

const ROLES: { id: string; label: string }[] = [
  { id: "singer", label: "Cantante" },
  { id: "bassist", label: "Bajo" },
  { id: "guitarist", label: "Guitarra" },
  { id: "drummer", label: "Batería" },
  { id: "keys", label: "Teclados" },
  { id: "fx", label: "FX / Técnico" },
  { id: "other", label: "Otro" },
  { id: "owner", label: "Dueño" },
];
const roleLabel = (r: string) => ROLES.find(x => x.id === r)?.label || r;

type Member = {
  user_id: string; role: string; display_name: string | null; is_active: boolean;
  joined_at: string; email: string | null; last_sign_in_at: string | null; is_owner: boolean;
  permissions: Perms;
};

function genPassword() {
  const words = ["bajo", "riff", "tempo", "groove", "nota", "acorde", "click", "tema", "show", "banda"];
  const w = words[Math.floor(Math.random() * words.length)];
  return w + "-" + Math.floor(1000 + Math.random() * 9000);
}

export default function MembersPage() {
  const supabase = createClient();
  const [bands, setBands] = useState<{ id: string; name: string; owner_id: string }[]>([]);
  const [bandId, setBandId] = useState<string>("");
  const [me, setMe] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [needsKey, setNeedsKey] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [iAmOwner, setIAmOwner] = useState(false);
  const [permsReady, setPermsReady] = useState(true);
  const [newPerms, setNewPerms] = useState<Perms>({ ...DEFAULT_PERMS });

  // Formulario de alta
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("bassist");
  const [password, setPassword] = useState(genPassword());
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<{ email: string; password: string | null; created: boolean } | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setMe(user?.id || null);
      const { data } = await supabase.from("bands").select("id, name, owner_id").order("created_at");
      const list = data || [];
      setBands(list);
      const mine = list.find(b => b.owner_id === user?.id) || list[0];
      if (mine) setBandId(mine.id);
      else setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    if (!bandId) return;
    setLoading(true); setErr(null);
    const r = await fetch(`/api/members?bandId=${bandId}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setNeedsKey(/SERVICE_ROLE/.test(j.error || ""));
      setCanManage(false);
      // 403 = no tiene permiso: no es un error, es solo lectura
      setErr(r.status === 403 ? null : (j.error || "No pude cargar los integrantes."));
      setMembers([]);
    } else {
      setMembers(j.members || []); setNeedsKey(false);
      setCanManage(true); setIAmOwner(!!j.isOwner); setPermsReady(j.permsReady !== false);
    }
    setLoading(false);
  }, [bandId]);
  useEffect(() => { load(); }, [load]);

  async function call(method: string, body: object) {
    const r = await fetch("/api/members", {
      method, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bandId, ...body }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "Algo falló.");
    return j;
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setErr(null); setDone(null);
    try {
      const j = await call("POST", { email, name, role, password, permissions: newPerms });
      setDone({ email: j.email, password: j.password, created: j.created });
      setName(""); setEmail(""); setPassword(genPassword()); setNewPerms({ ...DEFAULT_PERMS });
      await load();
    } catch (e: any) { setErr(e.message); }
    setSaving(false);
  }

  async function changeRole(m: Member, r: string) {
    try { await call("PATCH", { userId: m.user_id, role: r }); await load(); } catch (e: any) { alert(e.message); }
  }
  async function togglePerm(m: Member, k: keyof Perms) {
    const next = { ...m.permissions, [k]: !m.permissions[k] };
    setMembers(prev => prev.map(x => x.user_id === m.user_id ? { ...x, permissions: next } : x));
    try { await call("PATCH", { userId: m.user_id, permissions: next }); }
    catch (e: any) { alert(e.message); await load(); }
  }
  async function rename(m: Member) {
    const n = prompt("Nombre que se muestra en la app:", m.display_name || "");
    if (n === null) return;
    try { await call("PATCH", { userId: m.user_id, name: n }); await load(); } catch (e: any) { alert(e.message); }
  }
  async function resetPw(m: Member) {
    const pw = prompt(`Nueva contraseña para ${m.email} (mínimo 6 caracteres):`, genPassword());
    if (!pw) return;
    try { await call("PATCH", { userId: m.user_id, password: pw }); alert(`Listo. Contraseña nueva de ${m.email}:\n\n${pw}\n\nMandásela.`); }
    catch (e: any) { alert(e.message); }
  }
  async function remove(m: Member) {
    if (!confirm(`¿Sacar a ${m.display_name || m.email} de la banda?\n\nLa cuenta no se borra: si lo volvés a agregar, entra con la misma contraseña.`)) return;
    try { await call("DELETE", { userId: m.user_id }); await load(); } catch (e: any) { alert(e.message); }
  }

  const band = bands.find(b => b.id === bandId);
  // "isOwner" de acá en adelante = puede manejar integrantes (dueño o con ese permiso)
  const isOwner = canManage;

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="text-3xl font-black">Integrantes</h1>
          <p className="text-neutral-400 text-sm">Quién entra a la web y a la app, y con qué rol.</p>
        </div>
        {bands.length > 1 && (
          <select value={bandId} onChange={e => setBandId(e.target.value)} className="input w-auto">
            {bands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
      </div>

      {needsKey && (
        <div className="card mb-4 border-amber-400/40">
          <p className="font-black text-amber-300 mb-2">Falta un paso de configuración (una sola vez)</p>
          <ol className="text-sm text-neutral-300 list-decimal ml-5 space-y-1">
            <li>En <b>Supabase</b>: Project Settings → <b>API</b> → copiá la clave <b className="mono">service_role</b> (la secreta).</li>
            <li>En <b>Vercel</b>: proyecto camarage → Settings → <b>Environment Variables</b> → agregá
              <span className="mono"> SUPABASE_SERVICE_ROLE_KEY</span> con esa clave.</li>
            <li>En Vercel → Deployments → el último → <b>Redeploy</b>. Después recargá esta página.</li>
          </ol>
          <p className="text-xs text-neutral-500 mt-2">Esa clave queda solo en el servidor; nunca se manda al navegador ni a la app.</p>
        </div>
      )}
      {err && !needsKey && <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/30 rounded-lg p-3 mb-4">{err}</p>}

      {band && !isOwner && !loading && !needsKey && (
        <p className="card text-sm text-neutral-400 mb-4">No tenés permiso para manejar los integrantes de <b>{band.name}</b>.</p>
      )}
      {isOwner && !permsReady && (
        <div className="card mb-4 text-sm" style={{ borderColor: "rgba(251,191,36,0.4)" }}>
          <p className="font-black text-amber-300 mb-1">Para usar los permisos falta un paso (una sola vez)</p>
          <p className="text-neutral-300">En Supabase → SQL Editor, pegá <b className="mono">migration_permisos.sql</b> y dale Run. Después recargá.</p>
        </div>
      )}

      {/* ---------- Alta ---------- */}
      {isOwner && !needsKey && (
        <form onSubmit={add} className="card mb-6">
          <p className="font-black mb-3">+ Agregar integrante</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Nombre (como se ve en la app)</label>
              <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Paloma" />
            </div>
            <div>
              <label className="label">Mail</label>
              <input className="input" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="paloma@mail.com" />
            </div>
            <div>
              <label className="label">Rol</label>
              <select className="input" value={role} onChange={e => setRole(e.target.value)}>
                {ROLES.filter(r => r.id !== "owner").map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Contraseña (si todavía no tiene cuenta)</label>
              <div className="flex gap-2">
                <input className="input mono" value={password} onChange={e => setPassword(e.target.value)} />
                <button type="button" className="btn btn-secondary whitespace-nowrap" onClick={() => setPassword(genPassword())}>↻ Otra</button>
              </div>
            </div>
          </div>
          {permsReady && (
            <div className="mt-4">
              <label className="label">Permisos</label>
              <div className="flex flex-wrap gap-2">
                {PERM_KEYS.filter(k => k !== "manage_members" || iAmOwner).map(k => (
                  <label key={k} title={PERM_HELP[k]}
                         className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm cursor-pointer ${
                           newPerms[k] ? "border-cyan-400/60 bg-cyan-400/10 text-white" : "border-neutral-800 text-neutral-500"}`}>
                    <input type="checkbox" checked={newPerms[k]} onChange={() => setNewPerms(p => ({ ...p, [k]: !p[k] }))} />
                    {PERM_LABELS[k]}
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-neutral-500 mt-1">Ver todo (web y app) lo pueden todos los integrantes; esto es solo para editar.</p>
            </div>
          )}
          <div className="flex items-center gap-3 mt-4">
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Agregando…" : "Agregar a la banda"}</button>
            <p className="text-xs text-neutral-500">Si ese mail ya tiene cuenta, solo se suma a la banda y conserva su contraseña.</p>
          </div>
        </form>
      )}

      {done && (
        <div className="card mb-6 border-green-400/40">
          <p className="font-black text-green-400 mb-2">✓ {done.created ? "Cuenta creada y sumada a la banda" : "Ya tenía cuenta: quedó sumada a la banda"}</p>
          {done.created && done.password ? (
            <>
              <p className="text-sm text-neutral-300 mb-2">Mandale esto (entra igual en la web y en la app):</p>
              <pre className="mono text-sm bg-black/60 rounded-lg p-3 select-all whitespace-pre-wrap">{`CAMARAGE
Web: https://camarage.vercel.app
Mail: ${done.email}
Contraseña: ${done.password}`}</pre>
              <button className="btn btn-secondary mt-2 text-xs" onClick={() => navigator.clipboard?.writeText(
                `CAMARAGE\nWeb: https://camarage.vercel.app\nMail: ${done.email}\nContraseña: ${done.password}`)}>⧉ Copiar</button>
            </>
          ) : (
            <p className="text-sm text-neutral-400">Entra con su mail y la contraseña que ya usaba. En la app: sincronizar.</p>
          )}
        </div>
      )}

      {/* ---------- Lista ---------- */}
      {loading ? <p className="text-neutral-500">Cargando…</p> : (
        <div className="space-y-2">
          {members.map(m => (
            <div key={m.user_id} className="card flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[200px]">
                <p className="font-black">
                  {m.display_name || "—"}
                  {m.is_owner && <span className="ml-2 text-[10px] mono uppercase tracking-widest text-cyan-300">dueño</span>}
                </p>
                <p className="mono text-xs text-neutral-500">{m.email}</p>
                <p className="text-[10px] text-neutral-600">
                  {m.last_sign_in_at ? `último ingreso ${new Date(m.last_sign_in_at).toLocaleDateString("es-AR")}` : "todavía no entró"}
                </p>
              </div>
              {isOwner && !m.is_owner ? (
                <select className="input w-auto" value={m.role} onChange={e => changeRole(m, e.target.value)}>
                  {ROLES.filter(r => r.id !== "owner").map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
              ) : (
                <span className="text-sm text-neutral-300">{roleLabel(m.role)}</span>
              )}
              {permsReady && (
                <div className="basis-full flex flex-wrap gap-2 order-last">
                  {PERM_KEYS.map(k => {
                    const on = m.permissions?.[k];
                    const locked = m.is_owner || !isOwner || (k === "manage_members" && !iAmOwner) || m.user_id === me;
                    return (
                      <button key={k} type="button" disabled={locked} title={m.is_owner ? "El dueño tiene todo" : PERM_HELP[k]}
                              onClick={() => togglePerm(m, k)}
                              className={`px-2.5 py-1 rounded-md border text-xs font-bold transition ${
                                on ? "border-cyan-400/60 bg-cyan-400/10 text-cyan-200" : "border-neutral-800 text-neutral-600 line-through"
                              } ${locked ? "opacity-60 cursor-default" : "hover:border-cyan-300"}`}>
                        {on ? "✓ " : ""}{PERM_LABELS[k]}
                      </button>
                    );
                  })}
                </div>
              )}
              {isOwner && (
                <div className="flex gap-2">
                  <button className="btn btn-secondary text-xs" onClick={() => rename(m)}>Nombre</button>
                  <button className="btn btn-secondary text-xs" onClick={() => resetPw(m)}>Contraseña</button>
                  {!m.is_owner && <button className="btn btn-danger text-xs" onClick={() => remove(m)}>Sacar</button>}
                </div>
              )}
            </div>
          ))}
          {!members.length && !err && <p className="text-neutral-500 text-sm">Todavía no hay integrantes.</p>}
        </div>
      )}
    </div>
  );
}
