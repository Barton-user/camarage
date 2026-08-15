import { createClient } from "@/lib/supabase-server";
import Link from "next/link";

type SetlistSong = {
  position: number;
  transition_notes: string | null;
  song: {
    id: string;
    title: string;
    key: string | null;
    bpm: number | null;
    time_signature: string | null;
    program_change: number | null;
    has_click_track: boolean | null;
    duration_seconds: number | null;
  } | null;
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  // Pick "next show" — upcoming setlist; otherwise most recently updated non-archived
  let setlist: any = null;
  const up = await supabase
    .from("setlists")
    .select("id, name, show_date, venue, notes")
    .eq("is_archived", false)
    .gte("show_date", today)
    .order("show_date", { ascending: true })
    .limit(1)
    .maybeSingle();
  setlist = up.data;
  if (!setlist) {
    const fb = await supabase
      .from("setlists")
      .select("id, name, show_date, venue, notes")
      .eq("is_archived", false)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setlist = fb.data;
  }

  let setlistSongs: SetlistSong[] = [];
  if (setlist) {
    const { data } = await supabase
      .from("setlist_songs")
      .select(
        "position, transition_notes, song:songs(id, title, key, bpm, time_signature, program_change, has_click_track, duration_seconds)"
      )
      .eq("setlist_id", setlist.id)
      .order("position", { ascending: true });
    setlistSongs = (data as any) || [];
  }

  // Lyrics count per song
  const lyricsCount: Record<string, number> = {};
  if (setlistSongs.length) {
    const ids = setlistSongs.map(s => s.song?.id).filter(Boolean) as string[];
    if (ids.length) {
      const { data } = await supabase.from("lyric_lines").select("song_id").in("song_id", ids);
      (data || []).forEach((r: any) => {
        lyricsCount[r.song_id] = (lyricsCount[r.song_id] || 0) + 1;
      });
    }
  }

  const checks = {
    hasSetlist: !!setlist,
    hasSongs: setlistSongs.length > 0,
    allConfigured:
      setlistSongs.length > 0 &&
      setlistSongs.every(
        ss => ss.song?.bpm != null && ss.song?.key && ss.song?.program_change != null
      ),
    allHaveLyrics:
      setlistSongs.length > 0 &&
      setlistSongs.every(ss => ss.song?.id && (lyricsCount[ss.song.id] || 0) > 0),
  };
  const ready = checks.hasSetlist && checks.hasSongs && checks.allConfigured && checks.allHaveLyrics;
  const passedCount = Object.values(checks).filter(Boolean).length;

  const totalSeconds = setlistSongs.reduce(
    (acc, ss) => acc + (ss.song?.duration_seconds || 0),
    0
  );
  const totalMin = Math.round(totalSeconds / 60);

  const showDate = setlist?.show_date ? new Date(setlist.show_date) : null;
  const daysToShow = showDate
    ? Math.ceil((showDate.getTime() - new Date(today).getTime()) / 86400000)
    : null;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* ============== READY HERO ============== */}
      <div
        className={`rounded-2xl border-2 p-5 md:p-6 mb-5 transition ${
          ready ? "border-green-400/50 bg-green-400/[0.04]" : "border-yellow-400/40 bg-yellow-400/[0.04]"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <p className="mono text-[10px] uppercase tracking-[0.25em] text-neutral-500 mb-1">
              Estado del show
            </p>
            <h1
              className={`text-4xl md:text-5xl font-black tracking-tight ${
                ready ? "text-green-400" : "text-yellow-400"
              }`}
              style={{ textShadow: ready ? "0 0 20px rgba(34,197,94,0.3)" : "0 0 20px rgba(250,204,21,0.25)" }}
            >
              {ready ? "✓ READY" : "⚠ NO READY"}
            </h1>
            <p className="text-xs text-neutral-500 mt-1">
              {passedCount}/4 checks pasados
            </p>
          </div>

          {setlist && (
            <div className="text-right">
              <p className="font-black text-lg md:text-xl">{setlist.name}</p>
              <p className="text-xs text-neutral-400 mt-0.5">
                {showDate ? (
                  <span>
                    {showDate.toLocaleDateString("es-AR", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })}
                    {daysToShow !== null && daysToShow >= 0 && (
                      <span className="mono text-cyan-400 ml-2">
                        {daysToShow === 0 ? "HOY" : daysToShow === 1 ? "MAÑANA" : `EN ${daysToShow} DÍAS`}
                      </span>
                    )}
                  </span>
                ) : (
                  "Sin fecha"
                )}
              </p>
              {setlist.venue && <p className="text-xs text-neutral-500">{setlist.venue}</p>}
              <p className="mono text-[10px] text-neutral-500 mt-1">
                {setlistSongs.length} canciones{totalMin > 0 ? ` · ~${totalMin} min` : ""}
              </p>
            </div>
          )}
        </div>

        {/* Checks grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Check ok={checks.hasSetlist} label="Setlist activo" />
          <Check ok={checks.hasSongs} label={`Canciones${setlistSongs.length ? ` (${setlistSongs.length})` : ""}`} />
          <Check ok={checks.allConfigured} label="MIDI configurado" />
          <Check ok={checks.allHaveLyrics} label="Letras cargadas" />
        </div>
      </div>

      {/* ============== ROLE TILES ============== */}
      <p className="mono text-[10px] uppercase tracking-[0.25em] text-neutral-500 mb-2">
        Abrir vista en el celular
      </p>
      <div className="grid grid-cols-3 gap-2 md:gap-3 mb-5">
        <RoleTile href="/performer/?role=singer" icon="🎤" label="Cantante" color="cyan" />
        <RoleTile href="/performer/?role=bassist" icon="🎸" label="Bajista" color="yellow" />
        <RoleTile href="/performer/?role=drummer" icon="🥁" label="Baterista" color="purple" />
      </div>

      {/* ============== SETLIST DESPLEGADO ============== */}
      {setlistSongs.length > 0 ? (
        <div className="rounded-2xl border border-neutral-800 bg-[var(--bg-card)]">
          <div className="px-4 py-3 border-b border-neutral-900 flex items-center justify-between">
            <p className="mono text-[10px] uppercase tracking-[0.25em] text-neutral-500">
              Setlist desplegado
            </p>
            {setlist && (
              <Link href={`/setlists/${setlist.id}`} className="text-xs text-cyan-400 hover:underline">
                Editar →
              </Link>
            )}
          </div>
          <ol className="divide-y divide-neutral-900">
            {setlistSongs.map((ss, idx) => {
              const s = ss.song;
              const cfgMissing: string[] = [];
              if (!s?.bpm) cfgMissing.push("BPM");
              if (!s?.key) cfgMissing.push("KEY");
              if (s?.program_change == null) cfgMissing.push("PC#");
              const ll = s?.id ? lyricsCount[s.id] || 0 : 0;
              const songReady = cfgMissing.length === 0 && ll > 0;
              return (
                <li
                  key={idx}
                  className="flex items-baseline gap-3 px-4 py-3 hover:bg-neutral-900/40 transition"
                >
                  <span className="mono text-xs text-neutral-600 w-7 text-right">
                    {String(ss.position).padStart(2, "0")}
                  </span>
                  <span
                    className={`w-2 h-2 rounded-full self-center ${
                      songReady ? "bg-green-400" : "bg-yellow-400"
                    }`}
                    title={songReady ? "OK" : `Falta: ${cfgMissing.join(", ") || "letra"}`}
                  />
                  <div className="flex-1 min-w-0">
                    {s ? (
                      <Link
                        href={`/songs/${s.id}`}
                        className="font-bold hover:text-cyan-400 transition truncate block"
                      >
                        {s.title}
                      </Link>
                    ) : (
                      <span className="text-neutral-500 italic">canción eliminada</span>
                    )}
                    <p className="mono text-[10px] text-neutral-500 mt-0.5">
                      {s?.key || "—"} · {s?.bpm ? `${s.bpm} BPM` : "— BPM"} ·{" "}
                      {s?.time_signature || "—"} · PC#
                      {s?.program_change != null
                        ? String(s.program_change).padStart(2, "0")
                        : "––"}
                      {ll > 0 && ` · ${ll} líneas`}
                      {cfgMissing.length > 0 && (
                        <span className="text-yellow-500 ml-2">
                          ⚠ falta {cfgMissing.join(" + ")}
                        </span>
                      )}
                    </p>
                  </div>
                  {ss.transition_notes && (
                    <span className="text-[10px] text-neutral-500 italic max-w-[140px] truncate">
                      {ss.transition_notes}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      ) : (
        <EmptyState />
      )}
    </div>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
        ok
          ? "border-green-400/30 bg-green-400/5 text-green-400"
          : "border-neutral-800 bg-neutral-950 text-neutral-500"
      }`}
    >
      <span className="text-base leading-none">{ok ? "✓" : "○"}</span>
      <span className="text-[11px] font-bold uppercase tracking-wider">{label}</span>
    </div>
  );
}

function RoleTile({
  href,
  icon,
  label,
  color,
}: {
  href: string;
  icon: string;
  label: string;
  color: "cyan" | "yellow" | "purple";
}) {
  const map = {
    cyan: { border: "hover:border-cyan-400", text: "group-hover:text-cyan-400", glow: "rgba(34,211,238,0.25)" },
    yellow: { border: "hover:border-yellow-400", text: "group-hover:text-yellow-400", glow: "rgba(250,204,21,0.25)" },
    purple: { border: "hover:border-purple-400", text: "group-hover:text-purple-400", glow: "rgba(167,139,250,0.25)" },
  } as const;
  const c = map[color];
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      className={`group rounded-2xl border border-neutral-800 bg-[var(--bg-card)] p-4 md:p-5 text-center transition ${c.border}`}
    >
      <p className="text-4xl md:text-5xl mb-2 transition group-hover:scale-110">{icon}</p>
      <p className={`font-black text-base md:text-lg transition ${c.text}`}>{label}</p>
      <p className="mono text-[9px] text-neutral-600 mt-1 group-hover:text-neutral-400">
        ABRIR ↗
      </p>
    </a>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-cyan-400/30 bg-cyan-400/[0.04] p-6">
      <p className="font-black mb-2">Empezá creando un setlist</p>
      <p className="text-sm text-neutral-400 mb-4">
        Necesitás al menos un setlist con canciones para que aparezca el resumen del show.
      </p>
      <div className="flex gap-2">
        <Link href="/setlists" className="btn btn-primary inline-block">
          Crear setlist
        </Link>
        <Link href="/songs" className="btn btn-secondary inline-block">
          Cargar canciones
        </Link>
      </div>
    </div>
  );
}
