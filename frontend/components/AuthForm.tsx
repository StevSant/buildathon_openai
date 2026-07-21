"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { VerificationMethod } from "@pulso/core";
import { config, supabase } from "@/lib";

type Mode = "signup" | "signin";

// verify-identity response (CONTRACT §4). The server derives the user from the JWT and
// returns whether the cédula is verified plus which method was used.
type VerifyIdentityResponse = {
  verified: boolean;
  method: VerificationMethod;
  reason?: string;
};

// Sign-up / sign-in with email + password + cédula. On sign-up we create the auth user,
// call verify-identity (JWT + cédula), block if it is not verified, then persist the public
// profile. The raw cédula only ever lives in this form's state and the request body —
// never stored raw, never in localStorage (FR-4).
export default function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [cedula, setCedula] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasValidCedulaShape = /^\d{10}$/.test(cedula);

  // POST verify-identity with only the cédula (CONTRACT §4: body is { cedula }).
  async function verifyIdentity(accessToken: string): Promise<VerifyIdentityResponse> {
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

    // Non-2xx responses use the frozen { error } envelope. This is where an already-used
    // cédula is surfaced without disclosing any account details.
    if (
      !response.ok ||
      body.verified !== true ||
      (body.method !== "registry" && body.method !== "algorithmic")
    ) {
      throw new Error(
        body.error ?? body.reason ?? "No pudimos verificar tu cédula",
      );
    }

    return {
      verified: true,
      method: body.method,
      reason: body.reason,
    };
  }

  async function handleSignUp(): Promise<void> {
    // This is only a shape check. The authoritative cédula validation remains server-side.
    if (!hasValidCedulaShape) {
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

    // verify-identity owns the cédula hash. This upsert only completes the public profile.
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

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
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
    <form onSubmit={onSubmit} className="flex flex-1 flex-col px-5 pb-5 pt-4">
      <h1 className="m-0 text-[25px] font-extrabold leading-tight tracking-[-0.03em] text-ink">
        {mode === "signup" ? "Crea tu cuenta" : "Inicia sesión"}
      </h1>
      <p className="mb-5 mt-2 max-w-[285px] text-[13px] leading-5 text-muted">
        Cada reporte lleva una identidad real. Sin cuentas falsas.
      </p>

      <div className="flex flex-col gap-3">
        {mode === "signup" && (
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-faint">
              Nombre a mostrar
            </span>
            <input
              autoComplete="name"
              className="h-[52px] rounded-xl border border-line bg-panel px-3.5 text-[15px] text-ink outline-none transition-colors placeholder:text-faint focus:border-accent"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="María Torres"
            />
          </label>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-faint">
            Correo
          </span>
          <input
            autoComplete="email"
            type="email"
            required
            className="h-[52px] rounded-xl border border-line bg-panel px-3.5 text-[15px] text-ink outline-none transition-colors placeholder:text-faint focus:border-accent"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="maria.torres@correo.ec"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-faint">
            Contraseña
          </span>
          <input
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            type="password"
            required
            minLength={6}
            className="h-[52px] rounded-xl border border-line bg-panel px-3.5 text-[15px] text-ink outline-none transition-colors placeholder:text-faint focus:border-accent"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••••"
          />
        </label>

        {mode === "signup" && (
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-faint">
              Cédula
            </span>
            <span className="relative">
              <input
                autoComplete="off"
                inputMode="numeric"
                required
                maxLength={10}
                className={`h-[52px] w-full rounded-xl border bg-panel px-3.5 pr-11 font-mono text-[15px] tracking-[0.14em] text-ink outline-none transition-colors placeholder:tracking-normal placeholder:text-faint focus:border-accent ${
                  hasValidCedulaShape ? "border-ok" : "border-line"
                }`}
                value={cedula}
                onChange={(event) => setCedula(event.target.value.replace(/\D/g, ""))}
                placeholder="0102030405"
              />
              {hasValidCedulaShape && (
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-lg text-ok">
                  ✓
                </span>
              )}
            </span>
          </label>
        )}
      </div>

      {error && (
        <p aria-live="polite" className="mb-0 mt-3 text-[12px] leading-5 text-sev-fire">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="mt-5 flex h-[52px] w-full items-center justify-center rounded-[14px] bg-accent px-3 text-[14px] font-extrabold text-accent-ink shadow-[0_8px_24px_-8px_var(--accent)] transition-opacity disabled:cursor-wait disabled:opacity-60"
      >
        {busy ? "Un momento…" : mode === "signup" ? "Crear cuenta verificada" : "Entrar"}
      </button>

      {mode === "signup" && (
        <p className="mb-0 mt-3 flex items-start gap-2 text-[11.5px] leading-[17px] text-faint">
          <span aria-hidden="true" className="mt-px text-[13px] text-muted">
            ⊙
          </span>
          Tu cédula nunca se guarda: solo un hash. No se comparte ni se muestra a nadie.
        </p>
      )}

      <button
        type="button"
        onClick={() => {
          setMode(mode === "signup" ? "signin" : "signup");
          setError(null);
        }}
        className="mt-auto pt-5 text-center text-[12px] font-semibold text-accent"
      >
        {mode === "signup" ? "¿Ya tienes cuenta? Inicia sesión" : "¿Sin cuenta? Regístrate"}
      </button>
    </form>
  );
}
