"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, config } from "@/lib";

type Mode = "signup" | "signin";

// Sign-up / sign-in with email + password + cédula. On sign-up we create the auth user,
// then call verify-identity (with the JWT + cédula) to validate and persist the profile.
// The raw cédula only lives in this form's state and the request body — never stored raw.
export default function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [cedula, setCedula] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function verifyIdentity() {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("No se pudo iniciar sesión");
    const res = await fetch(`${config.functionsUrl}/verify-identity`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ cedula }),
    });
    if (!res.ok) {
      // CONTRACT §4: failures come back as { error }.
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? "No pudimos verificar tu cédula");
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "signup") {
        const { error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) throw signUpError;
        await verifyIdentity();
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
      }
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Algo salió mal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-1 flex-col gap-3 px-5 py-5">
      <h2 className="mt-1 text-[22px] font-extrabold tracking-tight">
        {mode === "signup" ? "Crea tu cuenta" : "Inicia sesión"}
      </h2>
      <p className="m-0 text-[13px] text-muted">
        Cada reporte lleva una identidad real. Sin cuentas falsas.
      </p>

      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-faint">
          Correo
        </span>
        <input
          type="email"
          required
          className="rounded-xl border border-line bg-panel px-3 py-3 text-sm text-ink outline-none"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="maria.torres@correo.ec"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-faint">
          Contraseña
        </span>
        <input
          type="password"
          required
          className="rounded-xl border border-line bg-panel px-3 py-3 text-sm text-ink outline-none"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
      </label>

      {mode === "signup" && (
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-faint">
            Cédula
          </span>
          <input
            inputMode="numeric"
            required
            className="rounded-xl border border-line bg-panel px-3 py-3 font-mono text-sm tracking-widest text-ink outline-none"
            value={cedula}
            onChange={(e) => setCedula(e.target.value)}
            placeholder="0102030405"
          />
        </label>
      )}

      {error && <p className="m-0 text-[12px] text-sev-fire">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="mt-1 flex w-full items-center justify-center rounded-[14px] bg-accent px-3 py-3 text-sm font-bold text-accent-ink disabled:opacity-60"
      >
        {busy
          ? "Un momento…"
          : mode === "signup"
            ? "Crear cuenta verificada"
            : "Entrar"}
      </button>

      {mode === "signup" && (
        <p className="m-0 flex items-start gap-2 text-[11.5px] text-faint">
          Tu cédula nunca se guarda: solo un hash. No se comparte ni se muestra a nadie.
        </p>
      )}

      <button
        type="button"
        onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
        className="mt-1 bg-transparent text-[12px] font-semibold text-accent"
      >
        {mode === "signup"
          ? "¿Ya tienes cuenta? Inicia sesión"
          : "¿Sin cuenta? Regístrate"}
      </button>
    </form>
  );
}
