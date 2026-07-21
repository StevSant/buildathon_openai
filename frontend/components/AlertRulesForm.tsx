"use client";

import { useEffect, useState } from "react";
import Icon from "./Icon";
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
    <section className="group" aria-labelledby="contact-alerts-title">
      <div className="gl" id="contact-alerts-title">
        Alertas a contactos · más ajustado
      </div>

      <div className="item">
        <span className="lft">
          <Icon name="ic-chat" />
          Avisar a mis contactos por WhatsApp
        </span>
        <button
          type="button"
          aria-label="Avisar a mis contactos por WhatsApp"
          aria-pressed={rule.enabled}
          disabled={busy}
          onClick={() => void save({ ...rule, enabled: !rule.enabled })}
          className={rule.enabled ? "toggle on" : "toggle"}
        />
      </div>

      <label className="item">
        <span className="lft">
          <Icon name="ic-fire" />
          Severidad mínima
        </span>
        <select
          className="select"
          value={rule.min_severity}
          disabled={busy}
          onChange={(event) =>
            void save({ ...rule, min_severity: Math.min(5, Math.max(1, Number(event.target.value))) })
          }
        >
          {[3, 4, 5].map((severity) => (
            <option key={severity} value={severity}>
              {severity}+ · grave
            </option>
          ))}
        </select>
      </label>

      <label className="item">
        <span className="lft">
          <Icon name="ic-target" />
          Radio
        </span>
        <select
          className="select"
          value={rule.radius_meters}
          disabled={busy}
          onChange={(event) => void save({ ...rule, radius_meters: Number(event.target.value) })}
        >
          {[300, 500, 1000].map((radius) => (
            <option key={radius} value={radius}>
              {radius} m
            </option>
          ))}
        </select>
      </label>

      {error ? (
        <p style={{ margin: 0, padding: "8px 13px 0", fontSize: 11, color: "var(--sev-fire)" }}>
          {error}
        </p>
      ) : null}

      <div className="item" style={{ borderTop: 0, paddingTop: 2 }}>
        <span className="hint">
          Tus alertas normales usan {Math.round(config.defaultRadiusMeters / 1000)} km — a contactos
          solo lo muy cercano y grave.
        </span>
      </div>
    </section>
  );
}
