"use client";

// inDrive-style proximity alert. Raised when a new nearby incident is both severe and
// close (the "sheet" tier). Shows severity + distance + actions. Fed by Supabase Realtime.
export default function NotificationBottomSheet({
  title,
  distanceMeters,
  ageLabel,
  onViewOnMap,
  onDismiss,
}: {
  title: string;
  distanceMeters: number;
  ageLabel: string;
  onViewOnMap: () => void;
  onDismiss: () => void;
}) {
  return (
    <section
      aria-label="Alerta cerca de ti"
      aria-live="assertive"
      className="absolute inset-x-3 bottom-3.5 z-20 rounded-[20px] border border-line bg-panel-2 p-4 shadow-[0_-20px_50px_-20px_#000]"
    >
      <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-line" />
      <div className="flex items-center gap-3">
        <span className="flex h-[46px] w-[46px] flex-none items-center justify-center rounded-[14px] bg-sev-fire text-[#08121a]">
          <svg
            width={24}
            height={24}
            viewBox="0 0 24 24"
            fill="none"
            stroke="#08121a"
            strokeWidth={2.1}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 3c.5 2.8 3.8 4 3.8 8.2A3.8 3.8 0 0 1 8.2 11c0-1 .4-1.9 1-2.6.4 1 1.2 1.5 2 1.5C10.5 8 12 6.2 12 3Z" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-sev-fire">
            <b className="h-1.5 w-1.5 rounded-full bg-sev-fire shadow-[0_0_8px_var(--sev-fire)]" />
            Alerta cerca de ti
          </div>
          <div className="mt-1 text-base font-extrabold">{title}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2.5 text-[12px] text-muted">
            <span>a ~{Math.round(distanceMeters)} m</span>
            <span>·</span>
            <span>{ageLabel}</span>
          </div>
        </div>
      </div>
      <div className="mt-3.5 flex gap-2.5">
        <button
          type="button"
          onClick={onViewOnMap}
          className="flex w-full items-center justify-center rounded-[14px] bg-accent px-3 py-3 text-sm font-bold text-accent-ink shadow-[0_8px_22px_-10px_var(--accent)] transition-transform active:scale-[0.98]"
        >
          Ver en el mapa
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="flex w-full items-center justify-center rounded-[14px] border border-line bg-panel-2 px-3 py-3 text-sm font-bold text-ink transition-colors hover:bg-panel-3"
        >
          Descartar
        </button>
      </div>
    </section>
  );
}
