"use client";

import type { Category } from "@pulso/core";
import Icon from "./Icon";

// Category → sprite icon + severity color, mirroring the mockup's palette mapping.
const CATEGORY_STYLE: Record<Category, { icon: string; color: string }> = {
  fire: { icon: "ic-fire", color: "var(--sev-fire)" },
  accident: { icon: "ic-car", color: "var(--sev-accident)" },
  flood: { icon: "ic-water", color: "var(--sev-flood)" },
  road_closure: { icon: "ic-road", color: "var(--sev-road)" },
  public_event: { icon: "ic-spark", color: "var(--sev-event)" },
  other: { icon: "ic-alert", color: "var(--sev-event)" },
};

// inDrive-style proximity alert. Raised when a new nearby incident is both severe and
// close (the "sheet" tier). Shows severity + distance + actions. Fed by Supabase Realtime.
// `.alert` is position:absolute (bottom:14px in the mockup's own screen); inside the app
// shell it is offset up to clear the persistent TabBar.
export default function NotificationBottomSheet({
  title,
  category,
  distanceMeters,
  ageLabel,
  verified,
  onViewOnMap,
  onDismiss,
}: {
  title: string;
  category: Category;
  distanceMeters: number;
  ageLabel: string;
  verified: boolean;
  onViewOnMap: () => void;
  onDismiss: () => void;
}) {
  const { icon, color } = CATEGORY_STYLE[category];

  return (
    <section
      className="alert"
      aria-label="Alerta cerca de ti"
      aria-live="assertive"
      style={{ bottom: "calc(84px + env(safe-area-inset-bottom))" }}
    >
      <div className="grab dark" />
      <div className="top">
        <div className="ai" style={{ background: color }}>
          <Icon name={icon} />
        </div>
        <div className="hd">
          <div className="kh">
            <b />
            Alerta cerca de ti
          </div>
          <div className="ti">{title}</div>
          <div className="mt">
            <span className="mono">a {Math.round(distanceMeters)} m</span>
            <span className="mono">{ageLabel}</span>
            {verified && (
              <span className="badge-ok">
                <Icon name="ic-check" style={{ width: 12, height: 12, strokeWidth: 2.4 }} />
                verificado
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="acts">
        <button type="button" className="btn primary sm" onClick={onViewOnMap}>
          Ver en el mapa
        </button>
        <button
          type="button"
          className="btn ghost sm"
          style={{ width: "auto", paddingLeft: 16, paddingRight: 16 }}
          onClick={onDismiss}
        >
          Descartar
        </button>
      </div>
    </section>
  );
}
