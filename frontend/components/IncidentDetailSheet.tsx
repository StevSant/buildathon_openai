"use client";

import { useEffect, useState } from "react";
import type { IncidentDetails } from "@pulso/core";
import { getIncidentDetails, confirmIncident } from "@/lib";

// Bottom sheet for one incident: reporter, description, community confirmations, and the
// confirm / dispute actions. Both map to the confirm_incident RPC (kind = confirm|dispute);
// at threshold the status flips to "confirmed" / "disputed". user_id comes from the JWT.
export default function IncidentDetailSheet({
  incidentId,
  onClose,
}: {
  incidentId: string;
  onClose: () => void;
}) {
  const [details, setDetails] = useState<IncidentDetails | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    getIncidentDetails(incidentId).then((d) => {
      if (active) setDetails(d);
    });
    return () => {
      active = false;
    };
  }, [incidentId]);

  async function vote(kind: "confirm" | "dispute") {
    setBusy(true);
    try {
      await confirmIncident(incidentId, kind);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  const d = details;

  return (
    <div className="absolute inset-x-0 bottom-0 z-30 flex max-h-[85%] flex-col rounded-t-[20px] border-t border-line bg-panel">
      <div className="mx-auto my-2.5 h-1 w-9 rounded-full bg-line" />
      <div className="flex-1 overflow-y-auto px-4 pb-2">
        <div className="text-[19px] font-extrabold tracking-tight">
          {d?.title ?? "Incidente"}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11.5px] text-muted">
          <span>Severidad {d?.severity ?? "—"}</span>
          <span>·</span>
          <span>{d?.status ?? "—"}</span>
          {d?.reporter_name ? (
            <>
              <span>·</span>
              <span>
                Reportado por {d.reporter_name}
                {d.reporter_verified ? (
                  <span className="text-accent"> ✓ verificado</span>
                ) : null}
              </span>
            </>
          ) : null}
        </div>
        <p className="mt-3 text-[12.5px] leading-relaxed text-[#c7d0da]">
          {d?.description ?? "Cargando detalle…"}
        </p>
        <div className="mt-3 rounded-xl border border-line bg-panel px-3 py-2.5 text-[12px] text-muted">
          {d?.confirmations ?? 0} confirmaron · ¿lo estás viendo? Ayuda a la comunidad a
          verificarlo.
        </div>
      </div>
      <div className="flex gap-2.5 border-t border-line bg-bg px-4 py-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => vote("confirm")}
          className="flex w-full items-center justify-center rounded-[14px] bg-ok px-3 py-3 text-sm font-bold text-[#04140b] disabled:opacity-60"
        >
          Confirmar
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => vote("dispute")}
          className="flex w-full items-center justify-center rounded-[14px] border bg-panel-2 px-3 py-3 text-sm font-bold text-sev-fire disabled:opacity-60"
          style={{ borderColor: "color-mix(in srgb, var(--sev-fire) 45%, var(--line))" }}
        >
          No es correcto
        </button>
      </div>
    </div>
  );
}
