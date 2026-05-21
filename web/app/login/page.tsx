"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase-client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setLoading(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-lg grid place-items-center"
               style={{ background: "linear-gradient(135deg, var(--accent-cyan), var(--accent-purple))" }}>
            <span className="mono font-black text-black">C</span>
          </div>
          <span className="font-black tracking-wider">CAMARAGE</span>
          <span className="mono text-[10px] uppercase tracking-[0.2em] text-neutral-500 ml-2">admin</span>
        </div>

        <h1 className="text-3xl font-black mb-2">Entrá</h1>
        <p className="text-neutral-400 mb-6 text-sm">Te mandamos un link al mail para entrar sin contraseña.</p>

        {sent ? (
          <div className="card">
            <p className="mono text-[10px] uppercase tracking-widest text-green-500 mb-1">Mail enviado</p>
            <p className="text-sm">Revisá <b>{email}</b> y tocá el link para entrar. Si no llega, mirá en spam.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                required
                placeholder="vos@ejemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
              />
            </div>
            {error && (
              <p className="text-xs text-red-400">{error}</p>
            )}
            <button type="submit" disabled={loading} className="btn btn-primary w-full disabled:opacity-50">
              {loading ? "Enviando..." : "Enviar link mágico"}
            </button>
          </form>
        )}

        <p className="mono text-[10px] uppercase tracking-widest text-neutral-600 mt-8 text-center">
          live sync para bandas
        </p>
      </div>
    </main>
  );
}
