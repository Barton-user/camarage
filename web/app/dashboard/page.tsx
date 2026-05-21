import { createClient } from "@/lib/supabase-server";
import Link from "next/link";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: bands } = await supabase.from("bands").select("*").order("created_at", { ascending: false });
  const { data: setlists } = await supabase.from("setlists").select("*").order("created_at", { ascending: false }).limit(5);
  const { data: songs } = await supabase.from("songs").select("*").order("created_at", { ascending: false }).limit(5);

  return (
    <div className="p-6 max-w-5xl">
      <h1 className="text-3xl font-black mb-1">Inicio</h1>
      <p className="text-neutral-400 text-sm mb-6">Resumen rápido</p>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <StatCard label="Bandas" value={bands?.length ?? 0} href="/bands" color="cyan" />
        <StatCard label="Setlists" value={setlists?.length ?? 0} href="/setlists" color="yellow" />
        <StatCard label="Canciones" value={songs?.length ?? 0} href="/songs" color="purple" />
      </div>

      {(bands?.length ?? 0) === 0 && (
        <div className="card border-cyan-400/30 bg-cyan-400/5">
          <p className="font-bold mb-2">Empezá creando una banda</p>
          <p className="text-sm text-neutral-400 mb-3">
            Las canciones, setlists y miembros viven dentro de una banda.
          </p>
          <Link href="/bands" className="btn btn-primary inline-block">Crear banda</Link>
        </div>
      )}

      {(songs?.length ?? 0) > 0 && (
        <section className="mt-6">
          <h2 className="font-black mb-3">Canciones recientes</h2>
          <div className="space-y-2">
            {songs!.map((s: any) => (
              <Link key={s.id} href={`/songs/${s.id}`} className="card hover:border-cyan-400/40 block transition">
                <p className="font-bold">{s.title}</p>
                <p className="mono text-[10px] text-neutral-500">
                  {s.key} · {s.bpm} BPM · {s.time_signature} · PC#{String(s.program_change ?? '–').padStart(2,'0')}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function StatCard({ label, value, href, color }: { label: string; value: number; href: string; color: "cyan"|"yellow"|"purple" }) {
  const colors = {
    cyan: "var(--accent-cyan)",
    yellow: "var(--accent-yellow)",
    purple: "var(--accent-purple)",
  };
  return (
    <Link href={href} className="card hover:border-cyan-400/40 transition">
      <p className="mono text-[10px] uppercase tracking-widest text-neutral-500 mb-1">{label}</p>
      <p className="text-4xl font-black mono" style={{ color: colors[color] }}>{value}</p>
    </Link>
  );
}
