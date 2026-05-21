"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    // SIN emailRedirectTo → Supabase manda código numérico en vez de link
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    setLoading(false);
    if (error) setError(error.message);
    else setStep("code");
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (code.length < 4) return;
    setLoading(true);
    setError(null);
    const supabase = createClient();
    // Probar primero como 'email' (OTP login), si falla probar 'magiclink' (signup/magic link)
    let { error } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: "email",
    });
    if (error) {
      const retry = await supabase.auth.verifyOtp({
        email,
        token: code.trim(),
        type: "magiclink",
      });
      error = retry.error;
    }
    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  }

  async function resend() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    setLoading(false);
    if (error) setError(error.message);
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

        {step === "email" ? (
          <>
            <p className="text-neutral-400 mb-6 text-sm">Te mandamos un código de 6 dígitos al mail.</p>
            <form onSubmit={sendCode} className="space-y-3">
              <div>
                <label className="label">Email</label>
                <input
                  type="email"
                  required
                  placeholder="vos@ejemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input"
                  autoFocus
                />
              </div>
              {error && <p className="text-xs text-red-400">{error}</p>}
              <button type="submit" disabled={loading} className="btn btn-primary w-full disabled:opacity-50">
                {loading ? "Enviando..." : "Enviar código"}
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="text-neutral-400 mb-6 text-sm">
              Mandamos un código a <b className="text-white">{email}</b>. Revisá tu mail y pegalo acá.
            </p>
            <form onSubmit={verifyCode} className="space-y-3">
              <div>
                <label className="label">Código de 6 dígitos</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]+"
                  maxLength={12}
                  required
                  placeholder="código"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  className="input mono text-2xl tracking-[0.3em] text-center font-bold"
                  autoFocus
                />
              </div>
              {error && <p className="text-xs text-red-400">{error}</p>}
              <button type="submit" disabled={loading || code.length < 6}
                      className="btn btn-primary w-full disabled:opacity-50">
                {loading ? "Verificando..." : "Entrar"}
              </button>
              <div className="flex items-center justify-between text-xs text-neutral-500 pt-2">
                <button type="button" onClick={() => { setStep("email"); setCode(""); setError(null); }}
                        className="hover:text-white">
                  ← Usar otro mail
                </button>
                <button type="button" onClick={resend} disabled={loading} className="hover:text-white disabled:opacity-50">
                  Reenviar código
                </button>
              </div>
            </form>
          </>
        )}

        <p className="mono text-[10px] uppercase tracking-widest text-neutral-600 mt-8 text-center">
          live sync para bandas
        </p>
      </div>
    </main>
  );
}
