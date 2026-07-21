"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { VerificationMethod } from "@pulso/core";
import { config, supabase } from "@/lib";

type Mode = "signup" | "signin";

type VerifyIdentityResponse = {
  verified: boolean;
  method: VerificationMethod;
  reason?: string;
};

// The raw cédula only exists in the form state and verification request body; it is
// never stored in the browser.
export default function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [cedula, setCedula] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function verifyIdentity(
    accessToken: string,
  ): Promise<VerifyIdentityResponse> {
    const response = await fetch(`${config.functionsUrl}/verify-identity`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ cedula }),
    });
    const body = (await response.json().catch(() => ({}))) as Partial<
      VerifyIdentityResponse & { error: string }
    >;

    if (!response.ok) {
      throw new Error(body.error ?? "No pudimos verificar tu cédula");
    }

    return {
      verified: Boolean(body.verified),
      method: body.method ?? "algorithmic",
      reason: body.reason,
    };
  }

  async function handleSignUp(): Promise<void> {
    if (!/^\d{10}$/.test(cedula)) {
      throw new Error("La cédula debe tener 10 dígitos");
    }

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });
    if (signUpError) throw signUpError;

    const session = data.session;
    const userId = data.user?.id;
    if (!session || !userId) {
      throw new Error("No se pudo iniciar sesión tras el registro");
    }

    const result = await verifyIdentity(session.access_token);
    if (!result.verified) {
      throw new Error(result.reason ?? "Tu cédula no pudo ser verificada");
    }

    const { error: profileError } = await supabase.from("profiles").upsert({
      id: userId,
      display_name: displayName.trim() || null,
      verified: result.verified,
      verification_method: result.method,
    });
    if (profileError) throw profileError;
  }

  async function handleSignIn(): Promise<void> {
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) throw signInError;
  }

  async function onSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "signup") {
        await handleSignUp();
      } else {
        await handleSignIn();
      }
      router.replace("/");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Algo salió mal");
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

      {mode === "signup" && (
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-faint">
            Nombre a mostrar
          </span>
          <input
            className="rounded-xl border border-line bg-panel px-3 py-3 text-sm text-ink outline-none"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="María Torres"
          />
        </label>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-faint">
          Correo
        </span>
        <input
          type="email"
          required
          className="rounded-xl border border-line bg-panel px-3 py-3 text-sm text-ink outline-none"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
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
          onChange={(event) => setPassword(event.target.value)}
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
            maxLength={10}
            className="rounded-xl border border-line bg-panel px-3 py-3 font-mono text-sm tracking-widest text-ink outline-none"
            value={cedula}
            onChange={(event) => setCedula(event.target.value)}
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
          ? "Un momento..."
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
