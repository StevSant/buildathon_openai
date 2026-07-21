"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { VerificationMethod } from "@pulso/core";
import { config, supabase } from "@/lib";
import Icon from "./Icon";

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
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
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
    <form
      onSubmit={onSubmit}
      className="s-auth"
      style={{ paddingTop: "max(env(safe-area-inset-top), 20px)" }}
    >
      <span className="applogo" style={{ width: 44, height: 44 }}>
        <svg viewBox="0 0 512 512">
          <use href="#logo" />
        </svg>
      </span>

      <h2>{mode === "signup" ? "Crea tu cuenta" : "Bienvenido de nuevo"}</h2>
      <p className="sub">
        {mode === "signup"
          ? "Cada reporte lleva una identidad real. Sin cuentas falsas."
          : "Ingresa con tu correo y contraseña."}
      </p>

      {mode === "signup" && (
        <div className="field">
          <label htmlFor="auth-name">Nombre a mostrar</label>
          <div className="input">
            <input
              id="auth-name"
              autoComplete="name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="María Torres"
            />
          </div>
        </div>
      )}

      <div className="field">
        <label htmlFor="auth-email">Correo</label>
        <div className="input">
          <input
            id="auth-email"
            autoComplete="email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="maria.torres@correo.ec"
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="auth-password">Contraseña</label>
        <div className="input">
          <input
            id="auth-password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            type={isPasswordVisible ? "text" : "password"}
            required
            minLength={6}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••••"
          />
          <button
            type="button"
            aria-label={isPasswordVisible ? "Ocultar contraseña" : "Mostrar contraseña"}
            aria-pressed={isPasswordVisible}
            onClick={() => setIsPasswordVisible((visible) => !visible)}
            style={{
              display: "inline-flex",
              padding: 0,
              border: 0,
              background: "none",
              cursor: "pointer",
            }}
          >
            <Icon name="ic-eye" />
          </button>
        </div>
      </div>

      {mode === "signup" && (
        <div className="field">
          <label htmlFor="auth-cedula">Cédula</label>
          <div className={`input mono${hasValidCedulaShape ? " ok" : ""}`}>
            <input
              id="auth-cedula"
              autoComplete="off"
              inputMode="numeric"
              required
              maxLength={10}
              value={cedula}
              onChange={(event) => setCedula(event.target.value.replace(/\D/g, ""))}
              placeholder="0102030405"
            />
            {hasValidCedulaShape && (
              <span className="badge-ok">
                <Icon name="ic-check" style={{ width: 15, height: 15, strokeWidth: 2.3 }} />
              </span>
            )}
          </div>
        </div>
      )}

      {mode === "signup" && hasValidCedulaShape && (
        <div className="verify-note">
          <Icon name="ic-check" />
          Identidad verificada · método: algorítmico
        </div>
      )}

      {error && (
        <p aria-live="polite" className="m-0 text-[12px] leading-[17px] text-sev-fire">
          {error}
        </p>
      )}

      <button type="submit" className="btn primary" disabled={busy}>
        {busy ? "Un momento…" : mode === "signup" ? "Crear cuenta verificada" : "Ingresar"}
      </button>

      {mode === "signup" && (
        <p className="privacy">
          <Icon name="ic-shield" />
          Tu cédula nunca se guarda: solo un hash. No se comparte ni se muestra a nadie. Tus
          reportes son anónimos para otros usuarios; si una cuenta publica reportes falsos, se
          deshabilita y esa cédula no puede volver a registrarse.
        </p>
      )}

      <button
        type="button"
        onClick={() => {
          setMode(mode === "signup" ? "signin" : "signup");
          setIsPasswordVisible(false);
          setError(null);
        }}
        className="mt-auto pt-4 text-center text-[12px] font-semibold text-accent"
      >
        {mode === "signup" ? "¿Ya tienes cuenta? Inicia sesión" : "¿Sin cuenta? Regístrate"}
      </button>
    </form>
  );
}
