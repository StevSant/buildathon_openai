"use client";

import { useEffect, useState } from "react";
import Icon from "./Icon";
import { supabase } from "@/lib";

type WhatsAppConfig = {
  enabled: boolean;
  phone_e164: string | null;
  verified: boolean;
};

const E164 = /^\+[1-9]\d{7,14}$/;

// Persists the user's WhatsApp opt-in and number. The integrations lane verifies the number;
// the client only registers a valid E.164 number under the owner's RLS-protected row.
export default function WhatsAppConfigForm() {
  const [enabled, setEnabled] = useState(false);
  const [phone, setPhone] = useState("");
  const [savedPhone, setSavedPhone] = useState("");
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function save(nextEnabled: boolean, nextPhone: string): Promise<void> {
    const normalizedPhone = nextPhone.trim();
    setError(null);
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
    } finally {
      setBusy(false);
    }
  }

  const isVerified = verified && phone.trim() === savedPhone;
  const hasSavedPhone = Boolean(savedPhone);

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
          onClick={() => void save(!enabled, phone)}
          className={enabled ? "toggle on" : "toggle"}
        />
      </div>

      <div className="item" style={{ borderTop: 0, paddingTop: 2 }}>
        <span className="hint">El número se guarda al salir del campo.</span>
      </div>

      {error ? (
        <p style={{ margin: 0, padding: "0 13px 10px", fontSize: 11, color: "var(--sev-fire)" }}>
          {error}
        </p>
      ) : null}
    </section>
  );
}
