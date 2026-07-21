"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { VerificationMethod } from "@pulso/core";
import { config, supabase } from "@/lib";

type Mode = "signup" | "signin" | "verify";

type VerifyIdentityResponse = {
  verified: boolean;
  method: VerificationMethod;
  reason?: string;
};

// Registration, email confirmation, and identity verification are separate steps. The raw
// cédula only exists in this form's state and the authenticated verification request body.
export default function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [cedula, setCedula] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });
    if (signUpError) throw signUpError;

    // A project with email confirmation disabled returns a session here. Registration should
    // still finish as a separate step, so clear only this browser's session before sign-in.
    if (data.session) {
      const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
      if (signOutError) throw signOutError;
    }

    setMode("signin");
    setNotice(
      "Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión.",
    );
  }

  async function handleSignIn(): Promise<boolean> {
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) throw signInError;

    const userId = data.user?.id;
    if (!userId) throw new Error("No se pudo iniciar sesión");

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("verified")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) throw profileError;

    if (profile?.verified) return true;

    setMode("verify");
    setNotice("Completa la verificación de tu cédula para continuar.");
    return false;
  }

  async function handleVerification(): Promise<void> {
    if (!/^\d{10}$/.test(cedula)) {
      throw new Error("La cédula debe tener 10 dígitos");
    }

    const { data } = await supabase.auth.getSession();
    const session = data.session;
    const userId = session?.user.id;
    if (!session || !userId) {
      throw new Error("Tu sesión expiró. Inicia sesión de nuevo.");
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

  async function onSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "signup") {
        await handleSignUp();
        return;
      }

      if (mode === "signin") {
        const isVerified = await handleSignIn();
        if (isVerified) router.replace("/");
        return;
      }

      await handleVerification();
      router.replace("/");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Algo salió mal");
    } finally {
      setBusy(false);
    }
  }

  const isVerifying = mode === "verify";
  const title =
    mode === "signup"
      ? "Crea tu cuenta"
      : isVerifying
        ? "Verifica tu identidad"
        : "Inicia sesión";

  return (
    <form onSubmit={onSubmit} className="flex flex-1 flex-col gap-3 px-5 py-5">
      <h2 className="mt-1 text-[22px] font-extrabold tracking-tight">{title}</h2>
      <p className="m-0 text-[13px] text-muted">
        {isVerifying
          ? "Necesitamos validar tu identidad antes de habilitar los reportes."
          : "Cada reporte lleva una identidad real. Sin cuentas falsas."}
      </p>

      {isVerifying && (
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

      {!isVerifying && (
        <>
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
        </>
      )}

      {isVerifying && (
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
      {notice && <p className="m-0 text-[12px] text-ok">{notice}</p>}

      <button
        type="submit"
        disabled={busy}
        className="mt-1 flex w-full items-center justify-center rounded-[14px] bg-accent px-3 py-3 text-sm font-bold text-accent-ink disabled:opacity-60"
      >
        {busy
          ? "Un momento..."
          : mode === "signup"
            ? "Crear cuenta"
            : isVerifying
              ? "Verificar identidad"
              : "Entrar"}
      </button>

      {isVerifying && (
        <p className="m-0 flex items-start gap-2 text-[11.5px] text-faint">
          Tu cédula nunca se guarda: solo un hash. No se comparte ni se muestra a nadie.
        </p>
      )}

      {!isVerifying && (
        <button
          type="button"
          onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
          className="mt-1 bg-transparent text-[12px] font-semibold text-accent"
        >
          {mode === "signup"
            ? "¿Ya tienes cuenta? Inicia sesión"
            : "¿Sin cuenta? Regístrate"}
        </button>
      )}
    </form>
  );
}
