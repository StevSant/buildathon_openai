"use client";

import { useEffect } from "react";
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

// Discreet toast for a relevant-but-not-urgent nearby incident (the "toast" tier), styled
// as the mockup's .toast. With a category it shows the category icon in its severity color;
// without one it is a plain green success toast (ic-check). Auto-dismisses; tapping routes.
export default function NotificationToast({
  title,
  category,
  onDismiss,
  onOpen,
  durationMs = 5000,
}: {
  title: string;
  category?: Category;
  onDismiss: () => void;
  onOpen?: () => void;
  durationMs?: number;
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(t);
  }, [onDismiss, durationMs]);

  const style = category ? CATEGORY_STYLE[category] : null;

  return (
    <button
      type="button"
      onClick={onOpen ?? onDismiss}
      aria-label={`Abrir notificación: ${title}`}
      className="toast"
    >
      {style ? (
        <Icon name={style.icon} style={{ color: style.color }} />
      ) : (
        <Icon name="ic-check" />
      )}
      {title}
    </button>
  );
}
