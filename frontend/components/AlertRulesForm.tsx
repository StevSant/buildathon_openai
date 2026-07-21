"use client";

import { useEffect, useState } from "react";
import { config, supabase } from "@/lib";

interface AlertRule {
  min_severity: number;
  radius_meters: number;
  enabled: boolean;
}

const DEFAULT_RULE: AlertRule = {
  min_severity: Math.min(5, Math.max(1, Math.trunc(config.alertMinSeverity))),
  radius_meters: config.alertRadiusMeters,
  enabled: true,
};

// Persists the tighter WhatsApp-contact rule. The schema intentionally has no unique user_id
// constraint, so saving reads an existing id before deciding whether to update or insert.
export default function AlertRulesForm() {
  const [rule, setRule] = useState<AlertRule>(DEFAULT_RULE);
  const [ruleId, setRuleId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load(): Promise<void> {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return;

      const { data, error: loadError } = await supabase
        .from("alert_rules")
        .select("id, min_severity, radius_meters, enabled")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();

      if (loadError) {
        setError("No se pudo cargar tu configuración de alertas.");
        return;
      }

      if (!data) return;
      setRuleId(data.id as string);
      setRule({
        min_severity: data.min_severity as number,
        radius_meters: data.radius_meters as number,
        enabled: data.enabled as boolean,
      });
    }

    void load();
  }, []);

  async function attachCenter(id: string): Promise<void> {
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 8000,
        }),
      );
      const { latitude, longitude } = position.coords;
      await supabase
        .from("alert_rules")
        .update({ center: `SRID=4326;POINT(${longitude} ${latitude})` })
        .eq("id", id);
    } catch {
      // A rule remains valid without a center; it simply cannot match a proximity alert yet.
    }
  }

  async function save(next: AlertRule): Promise<void> {
    if (busy) return;

    const previous = rule;
    setRule(next);
    setError(null);
    setBusy(true);

    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Missing user");

      let id = ruleId;
      if (!id) {
        const { data: existing, error: existingError } = await supabase
          .from("alert_rules")
          .select("id")
          .eq("user_id", userId)
          .limit(1)
          .maybeSingle();
        if (existingError) throw existingError;
        id = (existing?.id as string | undefined) ?? null;
      }

      const payload = {
        min_severity: next.min_severity,
        radius_meters: next.radius_meters,
        enabled: next.enabled,
        channel: "whatsapp" as const,
      };

      if (id) {
        const { error: updateError } = await supabase.from("alert_rules").update(payload).eq("id", id);
        if (updateError) throw updateError;
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from("alert_rules")
          .insert({ user_id: userId, ...payload })
          .select("id")
          .maybeSingle();
        if (insertError || !inserted?.id) throw insertError ?? new Error("Missing inserted rule");
        id = inserted.id as string;
        setRuleId(id);
      }

      void attachCenter(id);
    } catch {
      setRule(previous);
      setError("No se pudo guardar la alerta. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-[14px] border border-line bg-panel" aria-labelledby="contact-alerts-title">
      <h2
        id="contact-alerts-title"
        className="px-3.5 pb-1.5 pt-3 text-[10px] font-semibold uppercase tracking-widest text-faint"
      >
        Alertas a contactos · más ajustado
      </h2>

      <div className="flex items-center justify-between border-t border-line px-3.5 py-3 text-[13px]">
        <span>Enviar alertas por WhatsApp</span>
        <button
          type="button"
          aria-label="Activar alertas por WhatsApp"
          aria-pressed={rule.enabled}
          disabled={busy}
          onClick={() => void save({ ...rule, enabled: !rule.enabled })}
          className={`relative h-[22px] w-[38px] flex-none rounded-full disabled:opacity-60 ${
            rule.enabled ? "bg-accent" : "bg-line"
          }`}
        >
          <span
            className={`absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white transition-all ${
              rule.enabled ? "left-[18px]" : "left-0.5"
            }`}
          />
        </button>
      </div>

      <label className="flex items-center justify-between border-t border-line px-3.5 py-3 text-[13px]">
        <span>Severidad mínima</span>
        <select
          value={rule.min_severity}
          disabled={busy}
          onChange={(event) =>
            void save({ ...rule, min_severity: Math.min(5, Math.max(1, Number(event.target.value))) })
          }
          className="rounded-lg border border-line bg-panel-2 px-2 py-1 font-mono text-[12px] text-ink disabled:opacity-60"
        >
          {[3, 4, 5].map((severity) => (
            <option key={severity} value={severity}>
              {severity}+ · grave
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center justify-between border-t border-line px-3.5 py-3 text-[13px]">
        <span>Radio</span>
        <select
          value={rule.radius_meters}
          disabled={busy}
          onChange={(event) => void save({ ...rule, radius_meters: Number(event.target.value) })}
          className="rounded-lg border border-line bg-panel-2 px-2 py-1 font-mono text-[12px] text-ink disabled:opacity-60"
        >
          {[300, 500, 1000].map((radius) => (
            <option key={radius} value={radius}>
              {radius} m
            </option>
          ))}
        </select>
      </label>

      {error ? <p className="px-3.5 pt-2 text-[11px] text-sev-fire">{error}</p> : null}
      <p className="px-3.5 py-2.5 text-[10.5px] text-faint">
        Tus alertas normales usan {Math.round(config.defaultRadiusMeters / 1000)} km — a contactos
        solo lo muy cercano y grave.
      </p>
    </section>
  );
}
