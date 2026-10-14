"use client";
/* Permisos del usuario actual en una banda.
 * El dueño de la banda tiene todo. El resto, lo que diga band_members.permissions.
 * OJO: esto es solo para la interfaz (avisar y bloquear controles); quien
 * realmente impide escribir es la base (has_band_perm en las políticas RLS). */
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-client";

export type PermKey = "edit_songs" | "upload_audio" | "edit_setlists" | "manage_members";
export const PERM_KEYS: PermKey[] = ["edit_songs", "upload_audio", "edit_setlists", "manage_members"];
export const PERM_LABELS: Record<PermKey, string> = {
  edit_songs: "Editar canciones",
  upload_audio: "Subir audios",
  edit_setlists: "Editar setlists",
  manage_members: "Manejar integrantes",
};
export const PERM_HELP: Record<PermKey, string> = {
  edit_songs: "datos, letras, cues, cifrado, pentagrama y MIDI out",
  upload_audio: "subir, reemplazar y borrar pistas",
  edit_setlists: "crear setlists y ordenar canciones (también desde la app)",
  manage_members: "crear usuarios y cambiar permisos",
};
export const DEFAULT_PERMS: Record<PermKey, boolean> = {
  edit_songs: true, upload_audio: true, edit_setlists: true, manage_members: false,
};
export type Perms = Record<PermKey, boolean>;

export function useBandPerms(bandId: string | null | undefined) {
  const [state, setState] = useState<{ loading: boolean; isOwner: boolean; perms: Perms }>({
    loading: true, isOwner: false, perms: { ...DEFAULT_PERMS },
  });
  useEffect(() => {
    if (!bandId) return;
    let cancel = false;
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: band } = await supabase.from("bands").select("owner_id").eq("id", bandId).maybeSingle();
      if (band && band.owner_id === user.id) {
        if (!cancel) setState({ loading: false, isOwner: true,
          perms: { edit_songs: true, upload_audio: true, edit_setlists: true, manage_members: true } });
        return;
      }
      const { data: m } = await supabase.from("band_members").select("*")
        .eq("band_id", bandId).eq("user_id", user.id).maybeSingle();
      const p = (m && (m as any).permissions) || null;
      const perms = { ...DEFAULT_PERMS, ...(p || {}) } as Perms;
      // Sin la columna permissions (migración sin correr) → como antes: todo menos integrantes
      if (!cancel) setState({ loading: false, isOwner: false, perms: m && m.is_active !== false ? perms
        : { edit_songs: false, upload_audio: false, edit_setlists: false, manage_members: false } });
    })();
    return () => { cancel = true; };
  }, [bandId]);
  return state;
}
