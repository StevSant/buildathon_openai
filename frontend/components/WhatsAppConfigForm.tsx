"use client";

import { useEffect, useState } from "react";
import Icon from "./Icon";
import { config, supabase } from "@/lib";

type WhatsAppConfig = {
  enabled: boolean;
  phone_e164: string | null;
  verified: boolean;
};

type VerificationSend =
  | { ok: true; cooldown: number }
  | { ok: false; message: string; cooldown: number };

const E164 = /^\+[1-9]\d{7,14}$/;

// A rate-limited resend returns HTTP 429 with `{ retryAfterSeconds }`. supabase-js exposes the
// raw Response on the error's `context`; read it defensively so the client can honor the
// server's cooldown. Returns 0 when no usable value is present.
async function readRetryAfterSeconds(fnError: unknown): Promise<number> {
  try {
    const context = (fnError as { context?: Response }).context;
    if (!context || typeof context.json !== "function") return 0;
    const body = (await context.json()) as { retryAfterSeconds?: number };
    return Number.isFinite(body.retryAfterSeconds) ? Number(body.retryAfterSeconds) : 0;
  } catch {
    return 0;
  }
}

// Persists the user's WhatsApp opt-in and number, and lets them (re)send the verification
// message. The number is verified via a server-side, rate-limited confirmation send; the
// client only registers a valid E.164 number under the owner's RLS-protected row.
export default function WhatsAppConfigForm() {
  const [enabled, setEnabled] = useState(false);
  const [phone, setPhone] = useState("");
  const [savedPhone, setSavedPhone] = useState("");
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    async function load(): Promise<void> {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return;

      const { data, error: loadError } = await supabase
        .from("whatsapp_config")
        .select("enabled, phone_e164, verified")
        .eq("user_id", userId)
        .maybeSingle();

      if (loadError) {
        setError("No se pudo cargar tu configuración de WhatsApp.");
        return;
      }
      if (!data) return;
      const saved = data as WhatsAppConfig;
      setEnabled(Boolean(saved.enabled));
      setPhone(saved.phone_e164 ?? "");
      setSavedPhone(saved.phone_e164 ?? "");
      setVerified(Boolean(saved.verified));
    }

    void load();
  }, []);

  // Tick the resend cooldown down to zero, one second at a time.
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setTimeout(() => {
      setCooldownSeconds((current) => Math.max(0, current - 1));
    }, 1000);
    return () => clearTimeout(timer);
  }, [cooldownSeconds]);

  // Trigger the server-side, rate-limited verification send. Shared by the opt-in toggle and
  // the explicit "Reenviar código" action so both honor the same cooldown and error handling.
  async function invokeVerificationSend(): Promise<VerificationSend> {
    const { data, error: fnError } = await supabase.functions.invoke("proximity-dispatcher", {
      body: { verifyWhatsapp: true },
    });
    if (fnError) {
      const retryAfter = await readRetryAfterSeconds(fnError);
      return {
        ok: false,
        cooldown: retryAfter,
        message:
          retryAfter > 0
            ? "Espera unos segundos antes de solicitar otro código."
            : "No pudimos enviar el código por WhatsApp. Intenta de nuevo en unos segundos.",
      };
    }
    const payload = data as { dispatched?: number; cooldownSeconds?: number } | null;
    if (payload?.dispatched !== 1) {
      return {
        ok: false,
        cooldown: config.whatsappResendCooldownSeconds,
        message: "No pudimos enviar el código por WhatsApp. Intenta de nuevo en unos segundos.",
      };
    }
    return {
      ok: true,
      cooldown: payload.cooldownSeconds ?? config.whatsappResendCooldownSeconds,
    };
  }

  async function save(
    nextEnabled: boolean,
    nextPhone: string,
    verifyWhatsapp = false,
  ): Promise<void> {
    const normalizedPhone = nextPhone.trim();
    setError(null);
    setNotice(null);
    if (normalizedPhone && !E164.test(normalizedPhone)) {
      setError("Ingresa un número válido en formato internacional (p. ej. +593991234567).");
      return;
    }
    if (nextEnabled && !normalizedPhone) {
      setError("Ingresa tu número de WhatsApp antes de activar las alertas.");
      return;
    }

    setBusy(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) {
        setError("Tu sesión expiró. Ingresa nuevamente para continuar.");
        return;
      }

      const changedPhone = normalizedPhone !== savedPhone;
      const { data: savedConfig, error: upsertError } = await supabase
        .from("whatsapp_config")
        .upsert(
          {
            user_id: userId,
            enabled: nextEnabled,
            phone_e164: normalizedPhone || null,
            ...(changedPhone ? { verified: false } : {}),
          },
          { onConflict: "user_id" },
        )
        .select("enabled, phone_e164, verified")
        .single();

      if (upsertError || !savedConfig) {
        setError("No se pudo guardar. Intenta de nuevo.");
        return;
      }

      const saved = savedConfig as WhatsAppConfig;
      setEnabled(Boolean(saved.enabled));
      setPhone(saved.phone_e164 ?? "");
      setSavedPhone(saved.phone_e164 ?? "");
      setVerified(Boolean(saved.verified));

      if (!verifyWhatsapp) return;

      const result = await invokeVerificationSend();
      if (!result.ok) {
        if (result.cooldown > 0) setCooldownSeconds(result.cooldown);
        setError(result.message);
        return;
      }
      setVerified(true);
      setNotice("Te enviamos un código de confirmación por WhatsApp.");
      setCooldownSeconds(result.cooldown);
    } finally {
      setBusy(false);
    }
  }

  // Explicit "Reenviar código": guarded against duplicate clicks and the active cooldown.
  async function resendCode(): Promise<void> {
    if (busy || resendBusy || cooldownSeconds > 0) return;
    setError(null);
    setNotice(null);
    setResendBusy(true);
    try {
      const result = await invokeVerificationSend();
      if (!result.ok) {
        if (result.cooldown > 0) setCooldownSeconds(result.cooldown);
        setError(result.message);
        return;
      }
      setVerified(true);
      setNotice("Te reenviamos el código por WhatsApp. Revisa tus mensajes.");
      setCooldownSeconds(result.cooldown);
    } finally {
      setResendBusy(false);
    }
  }

  const isVerified = verified && phone.trim() === savedPhone;
  const hasSavedPhone = Boolean(savedPhone);
  const resendDisabled = busy || resendBusy || cooldownSeconds > 0;
  const resendLabel = resendBusy
    ? "Enviando…"
    : cooldownSeconds > 0
      ? `Reenviar código (${cooldownSeconds}s)`
      : "Reenviar código";

  const statusBadge = isVerified ? (
    <span className="badge-ok">
      <Icon name="ic-check" style={{ width: 14, height: 14, strokeWidth: 2.3 }} />
      Conectado
    </span>
  ) : enabled ? (
    <span className="status st-pend">Pendiente</span>
  ) : (
    <span style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", whiteSpace: "nowrap" }}>
      {hasSavedPhone ? "Guardado" : "Desactivado"}
    </span>
  );

  return (
    <section className="group" aria-labelledby="whatsapp-title">
      <div className="gl" id="whatsapp-title">
        Integración WhatsApp · Hermes
      </div>

      <div className="crow" style={{ borderTop: 0 }}>
        <span className="wi">
          <Icon name="ic-chat" />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="cn">Tu número</div>
          <input
            className="cp"
            style={{
              background: "none",
              border: 0,
              outline: "none",
              width: "100%",
              minWidth: 0,
              padding: 0,
              color: "var(--ink)",
              fontSize: 12,
            }}
            placeholder="+593991234567"
            inputMode="tel"
            aria-label="Tu número de WhatsApp"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            onBlur={() => void save(enabled, phone)}
          />
        </div>
        {statusBadge}
      </div>

      <div className="item">
        <span className="lft">
          <Icon name="ic-bell" />
          Recibir alertas en mi WhatsApp
        </span>
        <button
          type="button"
          aria-label="Recibir alertas en mi WhatsApp"
          aria-pressed={enabled}
          disabled={busy}
          onClick={() => void save(!enabled, phone, !enabled)}
          className={enabled ? "toggle on" : "toggle"}
        />
      </div>

      {enabled && hasSavedPhone ? (
        <div className="item" style={{ gap: 10 }}>
          <span className="hint" style={{ flex: 1, minWidth: 0 }}>
            {isVerified
              ? "¿No recibiste el código? Reenvíalo a tu WhatsApp."
              : "Te enviamos un código por WhatsApp para confirmar tu número."}
          </span>
          <button
            type="button"
            onClick={() => void resendCode()}
            disabled={resendDisabled}
            aria-label="Reenviar código de verificación por WhatsApp"
            style={{
              flexShrink: 0,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 12px",
              borderRadius: 10,
              border: "1px solid var(--line, rgba(255,255,255,0.14))",
              background: "transparent",
              color: resendDisabled ? "var(--muted)" : "var(--ink)",
              fontSize: 12,
              fontWeight: 600,
              cursor: resendDisabled ? "default" : "pointer",
              opacity: resendDisabled ? 0.6 : 1,
            }}
          >
            <Icon name="ic-chat" style={{ width: 14, height: 14 }} />
            {resendLabel}
          </button>
        </div>
      ) : null}

      <div className="item" style={{ borderTop: 0, paddingTop: 2 }}>
        <span className="hint">El número se guarda al salir del campo.</span>
      </div>

      {notice ? (
        <p
          role="status"
          style={{ margin: 0, padding: "0 13px 10px", fontSize: 11, color: "var(--ok, #38b48b)" }}
        >
          {notice}
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          style={{ margin: 0, padding: "0 13px 10px", fontSize: 11, color: "var(--sev-fire)" }}
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}
