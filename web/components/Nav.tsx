"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-client";

type NavItem = { href: string; label: string; icon: string; external?: boolean };

const items: NavItem[] = [
  { href: "/dashboard", label: "Inicio", icon: "🏠" },
  { href: "/bands", label: "Bandas", icon: "🎸" },
  { href: "/setlists", label: "Setlists", icon: "📋" },
  { href: "/songs", label: "Canciones", icon: "🎵" },
  { href: "/sl2/", label: "SL-2 Studio", icon: "🎛️", external: true },
  { href: "/xs100/", label: "XS-100 Studio", icon: "🎚️", external: true },
  { href: "/settings", label: "Configuración", icon: "⚙️" },
];

export default function Nav({ userEmail }: { userEmail?: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="w-56 shrink-0 border-r border-neutral-900 bg-[var(--bg-card)] flex flex-col">
      <div className="p-4 border-b border-neutral-900">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg grid place-items-center"
               style={{ background: "linear-gradient(135deg, var(--accent-cyan), var(--accent-purple))" }}>
            <span className="mono font-black text-black text-sm">C</span>
          </div>
          <span className="font-black tracking-wider text-sm">CAMARAGE</span>
        </div>
      </div>
      <nav className="flex-1 p-2 space-y-1">
        {items.map(item => {
          const active = !item.external && (pathname === item.href || pathname.startsWith(item.href + "/"));
          const className = `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-bold transition ${
            active ? "bg-cyan-400 text-black" : "text-neutral-400 hover:bg-neutral-900 hover:text-white"
          }`;
          if (item.external) {
            return (
              <a
                key={item.href}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className={className}
              >
                <span className="text-base">{item.icon}</span>
                <span>{item.label}</span>
                <span className="ml-auto text-[10px] text-neutral-600">↗</span>
              </a>
            );
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              className={className}
            >
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t border-neutral-900">
        {userEmail && (
          <p className="mono text-[10px] text-neutral-500 truncate mb-2">{userEmail}</p>
        )}
        <button onClick={logout} className="text-xs text-neutral-500 hover:text-red-400 transition">
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
