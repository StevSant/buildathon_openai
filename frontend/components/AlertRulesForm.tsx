"use client";

import { useEffect, useState } from "react";
import { clampSeverity } from "@pulso/core";
import type { AlertRule } from "@pulso/core";
import { config, supabase } from "@/lib";

// The tighter rule that governs alerts sent to a user's WhatsApp contacts. Deliberately
// stricter than the in-app map alerts (normal alerts use the default map radius; contacts
// get only the very close and severe). Persisted to alert_rules (RLS owner-only).
// alert_rules has no unique(user_id), so we track the row id and update-or-insert.
// `center` is the user's last-known watch location — the server-side dispatcher matches
// incidents against it.
type AlertRuleDraft = Pick<AlertRule, "min_severity" | "radius_meters" | "enabled"> & {
  id?: string;
};

// Defaults come from config (NEXT_PUBLIC_ALERT_SEVERITY_MIN / NEXT_PUBLIC_ALERT_RADIUS_METERS),
// the same thresholds the notifications tiering uses.
const DEFAULT_RULE: AlertRuleDraft = {
  min_severity: clampSeverity(config.alertMinSeverity),
  radius_meters: config.alertRadiusMeters,
  enabled: true,
};

async function currentCenter(): Promise<string | undefined> {
  try {
    const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 6000,
      }),
    );
    return `SRID=4326;POINT(${pos.coords.longitude} ${pos.coords.latitude})`;
  } catch {
    return undefined;
  }
}

export default function AlertRulesForm() {
  const [rule, setRule] = useState<AlertRuleDraft>(DEFAULT_RULE);

  useEffect(() => {
    supabase
      .from("alert_rules")
      .select("id, min_severity, radius_meters, enabled")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setRule(data as AlertRuleDraft);
      });
  }, []);

  async function save(next: AlertRuleDraft) {
    setRule(next);
    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id;
    if (!userId) return;

    const center = await currentCenter();
    const payload = {
      user_id: userId,
      min_severity: next.min_severity,
      radius_meters: next.radius_meters,
      enabled: next.enabled,
      channel: "whatsapp",
      ...(center ? { center } : {}),
    };

    if (next.id) {
      await supabase.from("alert_rules").update(payload).eq("id", next.id);
    } else {
      const { data: inserted } = await supabase
        .from("alert_rules")
        .insert(payload)
        .select("id")
        .single();
      if (inserted?.id) setRule({ ...next, id: inserted.id as string });
    }
  }

  return (
    <div className="rounded-[14px] border border-line bg-panel">
      <div className="px-3.5 pb-1.5 pt-3 text-[10px] font-semibold uppercase tracking-widest text-faint">
        Alertas a contactos · más ajustado
      </div>

      <div className="flex items-center justify-between border-t border-line px-3.5 py-3 text-[13px]">
        <span>Enviar alertas por WhatsApp</span>
        <button
          type="button"
          aria-pressed={rule.enabled}
          onClick={() => save({ ...rule, enabled: !rule.enabled })}
          className={`relative h-[22px] w-[38px] flex-none rounded-full ${
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
          onChange={(e) => save({ ...rule, min_severity: clampSeverity(Number(e.target.value)) })}
          className="rounded-lg border border-line bg-panel-2 px-2 py-1 font-mono text-[12px] text-ink"
        >
          {[3, 4, 5].map((s) => (
            <option key={s} value={s}>
              {s}+ · grave
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center justify-between border-t border-line px-3.5 py-3 text-[13px]">
        <span>Radio</span>
        <select
          value={rule.radius_meters}
          onChange={(e) => save({ ...rule, radius_meters: Number(e.target.value) })}
          className="rounded-lg border border-line bg-panel-2 px-2 py-1 font-mono text-[12px] text-ink"
        >
          {[300, 500, 1000].map((m) => (
            <option key={m} value={m}>
              {m} m
            </option>
          ))}
        </select>
      </label>

      <p className="px-3.5 py-2.5 text-[10.5px] text-faint">
        Tus alertas normales usan {Math.round(config.defaultRadiusMeters / 1000)} km — a
        contactos solo lo muy cercano y grave.
      </p>
    </div>
  );
}
