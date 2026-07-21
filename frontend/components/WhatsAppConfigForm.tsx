"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib";

type WhatsAppConfig = {
  enabled: boolean;
  phone_e164: string | null;
  verified: boolean;
};

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

      const { data } = await supabase
        .from("whatsapp_config")
        .select("enabled, phone_e164, verified")
        .eq("user_id", userId)
        .maybeSingle();

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
    if (nextEnabled && !/^\+[1-9]\d{7,14}$/.test(normalizedPhone)) {
      setError("Ingresa un número válido en formato internacional (p. ej. +593991234567).");
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

      const { error: upsertError } = await supabase.from("whatsapp_config").upsert(
        {
          user_id: userId,
          enabled: nextEnabled,
          phone_e164: normalizedPhone || null,
        },
        { onConflict: "user_id" },
      );
      if (upsertError) {
        setError("No se pudo guardar. Intenta de nuevo.");
        return;
      }

      setEnabled(nextEnabled);
      setPhone(normalizedPhone);
      if (normalizedPhone !== savedPhone) setVerified(false);
      setSavedPhone(normalizedPhone);
    } finally {
      setBusy(false);
    }
  }

  const isVerified = verified && phone.trim() === savedPhone;
  const status = isVerified ? "Verificado" : enabled ? "Pendiente" : "Desactivado";
  const statusClass = isVerified ? "text-ok" : enabled ? "text-sev-road" : "text-muted";

  return (
    <section className="rounded-[14px] border border-line bg-panel" aria-labelledby="whatsapp-title">
      <h2
        id="whatsapp-title"
        className="px-3.5 pb-1.5 pt-3 text-[10px] font-semibold uppercase tracking-widest text-faint"
      >
        Integración WhatsApp · Hermes
      </h2>
      <div className="flex items-center gap-3 border-t border-line px-3.5 py-3">
        <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px] bg-[color-mix(in_srgb,#25D366_20%,var(--panel))] text-[#25D366]">
          &#128172;
        </span>
        <span className="flex-1 text-[13px] font-semibold">Activar alertas por WhatsApp</span>
        <button
          type="button"
          aria-label="Activar alertas por WhatsApp"
          aria-pressed={enabled}
          disabled={busy}
          onClick={() => void save(!enabled, phone)}
          className={`relative h-[22px] w-[38px] flex-none rounded-full disabled:opacity-60 ${
            enabled ? "bg-accent" : "bg-line"
          }`}
        >
          <span
            className={`absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white transition-all ${
              enabled ? "left-[18px]" : "left-0.5"
            }`}
          />
        </button>
      </div>
      <div className="flex items-center gap-3 border-t border-line px-3.5 py-3">
        <input
          className="min-w-0 flex-1 rounded-lg border border-line bg-panel-2 px-3 py-2 font-mono text-sm text-ink outline-none placeholder:text-faint focus:border-accent"
          placeholder="+593991234567"
          inputMode="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          onBlur={() => void save(enabled, phone)}
        />
        <span className={`rounded-md bg-panel-2 px-1.5 py-1 text-[10px] font-semibold uppercase ${statusClass}`}>
          {status}
        </span>
      </div>
      {error ? <p className="px-3.5 pb-2.5 text-[11px] text-sev-fire">{error}</p> : null}
    </section>
  );
}
