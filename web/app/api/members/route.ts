/* ============================================================================
 * /api/members — alta y manejo de integrantes de una banda.
 *
 * Crear cuentas de Supabase Auth necesita la clave de administrador
 * (SUPABASE_SERVICE_ROLE_KEY). Esa clave vive SOLO acá, en el servidor de
 * Vercel; nunca llega al navegador. Cada pedido se valida así:
 *   1. hay sesión (cookie de Supabase) → quién pide
 *   2. ese usuario es el DUEÑO de la banda (bands.owner_id)
 * Recién ahí se usa la clave de admin.
 *
 *   GET    ?bandId=…                         lista con mails
 *   POST   { bandId, email, name, role, password?, permissions? }   crea la cuenta (si no existe) y la suma
 *   PATCH  { bandId, userId, role?, name?, password?, permissions? } cambia rol/nombre/permisos o la contraseña
 *
 * Puede usarla el dueño de la banda o quien tenga el permiso manage_members.
 * Nadie (salvo el dueño) toca la fila del dueño.
 *   DELETE { bandId, userId }                saca de la banda (no borra la cuenta)
 * ========================================================================== */
import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";

const ROLES = ["owner", "singer", "bassist", "drummer", "guitarist", "keys", "fx", "other"] as const;
const PERM_KEYS = ["edit_songs", "upload_audio", "edit_setlists", "manage_members"] as const;
const DEFAULT_PERMS = { edit_songs: true, upload_audio: true, edit_setlists: true, manage_members: false };
/** Solo las 4 casillas conocidas, en booleano. */
function cleanPerms(p: any, base: Record<string, boolean> = DEFAULT_PERMS) {
  const out: Record<string, boolean> = { ...base };
  if (p && typeof p === "object") for (const k of PERM_KEYS) if (k in p) out[k] = !!p[k];
  return out;
}

function admin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

/** Quién pide + chequeo de que sea dueño de la banda o tenga "manejar integrantes". */
async function ownerGuard(bandId: string | null) {
  const db = admin();
  if (!db) return { err: fail(500, "Falta configurar SUPABASE_SERVICE_ROLE_KEY en Vercel (ver la página Integrantes).") };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { err: fail(401, "No hay sesión.") };
  if (!bandId) return { err: fail(400, "Falta la banda.") };
  const { data: band } = await db.from("bands").select("id, owner_id, name").eq("id", bandId).single();
  if (!band) return { err: fail(404, "No existe esa banda.") };
  const isOwner = band.owner_id === user.id;
  if (!isOwner) {
    const { data: me } = await db.from("band_members").select("*")
      .eq("band_id", band.id).eq("user_id", user.id).maybeSingle();
    const can = !!me && me.is_active !== false && !!(me as any).permissions?.manage_members;
    if (!can) return { err: fail(403, "No tenés permiso para manejar integrantes de esta banda.") };
  }
  return { db, user, band, isOwner };
}

/** Busca una cuenta por mail (recorre las páginas del listado de Auth). */
type AdminDb = NonNullable<ReturnType<typeof admin>>;
async function findUserByEmail(db: AdminDb, email: string) {
  const target = email.trim().toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const users = (data?.users || []) as { id: string; email?: string }[];
    const hit = users.find(u => (u.email || "").toLowerCase() === target);
    if (hit) return hit;
    if (users.length < 200) break;
  }
  return null;
}

export async function GET(req: Request) {
  const bandId = new URL(req.url).searchParams.get("bandId");
  const g = await ownerGuard(bandId);
  if ("err" in g) return g.err;
  const { db, band } = g;
  const { data: rows, error } = await db.from("band_members")
    .select("*")
    .eq("band_id", band.id).order("joined_at");
  if (error) return fail(500, error.message);
  const members = await Promise.all((rows || []).map(async r => {
    const { data } = await db.auth.admin.getUserById(r.user_id);
    const u = data?.user;
    const hasCol = "permissions" in r;
    return {
      user_id: r.user_id, role: r.role, display_name: r.display_name, is_active: r.is_active, joined_at: r.joined_at,
      permissions: r.user_id === band.owner_id
        ? { edit_songs: true, upload_audio: true, edit_setlists: true, manage_members: true }
        : cleanPerms(hasCol ? r.permissions : null),
      email: u?.email || null,
      last_sign_in_at: u?.last_sign_in_at || null,
      is_owner: r.user_id === band.owner_id,
    };
  }));
  const permsReady = !rows?.length || "permissions" in (rows[0] as any);
  return NextResponse.json({ band: { id: band.id, name: band.name }, members, isOwner: g.isOwner, permsReady });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const g = await ownerGuard(body.bandId);
  if ("err" in g) return g.err;
  const { db, band } = g;
  const email = String(body.email || "").trim().toLowerCase();
  const name = String(body.name || "").trim();
  const role = ROLES.includes(body.role) ? body.role : "other";
  const password = body.password ? String(body.password) : "";
  if (!/^\S+@\S+\.\S+$/.test(email)) return fail(400, "El mail no parece válido.");
  if (password && password.length < 6) return fail(400, "La contraseña tiene que tener al menos 6 caracteres.");

  let created = false;
  let user = await findUserByEmail(db, email);
  if (!user) {
    if (!password) return fail(400, "Esa persona todavía no tiene cuenta: poné una contraseña para crearla.");
    const { data, error } = await db.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { name },
    });
    if (error || !data.user) return fail(400, "No pude crear la cuenta: " + (error?.message || ""));
    user = data.user;
    created = true;
  }
  if (user.id === band.owner_id) return fail(400, "Ese mail es el del dueño de la banda.");
  const row: Record<string, unknown> = {
    band_id: band.id, user_id: user.id, role, display_name: name || null, is_active: true,
    permissions: cleanPerms(body.permissions),
  };
  let { error: mErr } = await db.from("band_members").upsert(row, { onConflict: "band_id,user_id" });
  if (mErr && /permissions/.test(mErr.message)) {          // migración de permisos sin correr
    delete row.permissions;
    ({ error: mErr } = await db.from("band_members").upsert(row, { onConflict: "band_id,user_id" }));
  }
  if (mErr) return fail(500, "La cuenta está, pero no pude sumarla a la banda: " + mErr.message);
  return NextResponse.json({ ok: true, created, email, password: created ? password : null });
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}));
  const g = await ownerGuard(body.bandId);
  if ("err" in g) return g.err;
  const { db, band } = g;
  const userId = String(body.userId || "");
  if (!userId) return fail(400, "Falta el integrante.");
  if (userId === band.owner_id && !g.isOwner) return fail(403, "Al dueño de la banda no lo podés modificar.");
  const patch: Record<string, unknown> = {};
  if (body.permissions !== undefined) {
    if (userId === band.owner_id) return fail(400, "El dueño tiene todos los permisos siempre.");
    const { data: cur } = await db.from("band_members").select("*").eq("band_id", band.id).eq("user_id", userId).maybeSingle();
    if (!cur) return fail(404, "Esa persona no está en esta banda.");
    if (!("permissions" in cur)) return fail(400, "Falta correr migration_permisos.sql en Supabase.");
    patch.permissions = cleanPerms(body.permissions, cleanPerms((cur as any).permissions));
  }
  if (body.role !== undefined) {
    if (!ROLES.includes(body.role)) return fail(400, "Rol inválido.");
    if (userId === band.owner_id && body.role !== "owner") return fail(400, "El dueño de la banda sigue siendo dueño.");
    patch.role = body.role;
  }
  if (body.name !== undefined) patch.display_name = String(body.name).trim() || null;
  if (Object.keys(patch).length) {
    const { error } = await db.from("band_members").update(patch).eq("band_id", band.id).eq("user_id", userId);
    if (error) return fail(500, error.message);
  }
  if (body.password) {
    const pw = String(body.password);
    if (pw.length < 6) return fail(400, "La contraseña tiene que tener al menos 6 caracteres.");
    // Solo se puede cambiar la clave de alguien que esté en esta banda
    const { data: m } = await db.from("band_members").select("user_id").eq("band_id", band.id).eq("user_id", userId).maybeSingle();
    if (!m) return fail(403, "Esa persona no está en esta banda.");
    const { error } = await db.auth.admin.updateUserById(userId, { password: pw });
    if (error) return fail(400, "No pude cambiar la contraseña: " + error.message);
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const body = await req.json().catch(() => ({}));
  const g = await ownerGuard(body.bandId);
  if ("err" in g) return g.err;
  const { db, band } = g;
  const userId = String(body.userId || "");
  if (userId === band.owner_id) return fail(400, "No podés sacar al dueño de la banda.");
  const { error } = await db.from("band_members").delete().eq("band_id", band.id).eq("user_id", userId);
  if (error) return fail(500, error.message);
  return NextResponse.json({ ok: true });
}
