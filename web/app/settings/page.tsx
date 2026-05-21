"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-client";

export default function SettingsPage() {
  const supabase = createClient();
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => { (async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email) setEmail(user.email);
  })(); }, []);

  async function setNewPassword(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (password.length < 6) return setMsg({ type: "err", text: "La contraseña debe tener al menos 6 caracteres" });
    if (password !== confirm) return setMsg({ type: "err", text: "Las contraseñas no coinciden" });
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) setMsg({ type: "err", text: error.message });
    else {
      setMsg({ type: "ok", text: "Contraseña actualizada. La próxima vez podés entrar con email + contraseña." });
      setPassword(""); setConfirm("");
    }
  }

  return (
    <div className="p-6 max-w-xl">
      <h1 className="text-3xl font-black mb-1">Configuración</h1>
      <p className="text-neutral-400 text-sm mb-6">Tu cuenta y preferencias.</p>

      <div className="card mb-4">
        <p className="label">Email</p>
        <p className="font-bold">{email || "—"}</p>
      </div>

      <div className="card">
        <h2 className="font-black text-lg mb-1">Contraseña</h2>
        <p className="text-xs text-neutral-500 mb-4">
          Configurá una contraseña para no usar código cada vez que entrás.
        </p>
        <form onSubmit={setNewPassword} className="space-y-3">
          <div>
            <label className="label">Nueva contraseña</label>
            <input type="password" required minLength={6}
                   value={password} onChange={(e) => setPassword(e.target.value)}
                   className="input" placeholder="mínimo 6 caracteres" />
          </div>
          <div>
            <label className="label">Confirmar contraseña</label>
            <input type="password" required minLength={6}
                   value={confirm} onChange={(e) => setConfirm(e.target.value)}
                   className="input" placeholder="repetí la contraseña" />
          </div>
          {msg && (
            <p className={`text-xs ${msg.type === "ok" ? "text-green-400" : "text-red-400"}`}>
              {msg.text}
            </p>
          )}
          <button type="submit" disabled={loading || !password || !confirm}
                  className="btn btn-primary w-full disabled:opacity-50">
            {loading ? "Guardando..." : "Guardar contraseña"}
          </button>
        </form>
      </div>
    </div>
  );
}
