"use client";

import { useEffect } from "react";

// Discreet toast for a relevant-but-not-urgent nearby incident (the "toast" tier).
// Auto-dismisses; tapping it can route to the map or the notification center.
export default function NotificationToast({
  title,
  onDismiss,
  onOpen,
  durationMs = 5000,
}: {
  title: string;
  onDismiss: () => void;
  onOpen?: () => void;
  durationMs?: number;
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(t);
  }, [onDismiss, durationMs]);

  return (
    <button
      type="button"
      onClick={onOpen ?? onDismiss}
      aria-label={`Abrir notificación: ${title}`}
      className="absolute inset-x-3.5 top-24 z-10 flex items-center gap-2.5 rounded-xl border px-3.5 py-3 text-left text-[13px] font-semibold text-ink shadow-[0_12px_30px_-12px_#000] transition-transform active:scale-[0.99]"
      style={{
        background: "color-mix(in srgb, var(--ok) 16%, var(--panel))",
        borderColor: "color-mix(in srgb, var(--ok) 45%, transparent)",
      }}
    >
      <svg
        width={17}
        height={17}
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--ok)"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 12.5 9 17.5 20 6.5" />
      </svg>
      <span className="min-w-0 flex-1 truncate">{title}</span>
      <span className="text-[10px] font-bold text-ok">Ver</span>
    </button>
  );
}
