"use client";

import { useEffect, useState } from "react";
import type { Category, IncidentDetails, IncidentStatus } from "@pulso/core";
import { confirmIncident, getIncidentDetails } from "@/lib";

const STATUS_LABEL: Record<IncidentStatus, string> = {
  provisional: "Provisional",
  confirmed: "Confirmado",
  disputed: "En disputa",
  resolved: "Resuelto",
};

const CATEGORY_LABEL: Record<Category, string> = {
  road_closure: "Cierre vial",
  accident: "Accidente",
  flood: "Inundación",
  fire: "Incendio",
  public_event: "Evento público",
  other: "Incidente",
};

const CATEGORY_COLOR: Record<Category, string> = {
  road_closure: "var(--sev-road)",
  accident: "var(--sev-accident)",
  flood: "var(--sev-flood)",
  fire: "var(--sev-fire)",
  public_event: "var(--sev-event)",
  other: "var(--muted)",
};

// Detail sheet for one anonymous public incident. The API intentionally exposes only the
// reporter_verified flag, never a reporter name, identity document, or contact data.
export default function IncidentDetailSheet({
  incidentId,
  onClose,
}: {
  incidentId: string;
  onClose: () => void;
}) {
  const [details, setDetails] = useState<IncidentDetails | null>(null);
  const [busy, setBusy] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setDetails(null);
    setHasError(false);

    void getIncidentDetails(incidentId)
      .then((incident) => {
        if (active) setDetails(incident);
      })
      .catch(() => {
        if (active) setHasError(true);
      });

    return () => {
      active = false;
    };
  }, [incidentId]);

  async function vote(kind: "confirm" | "dispute") {
    setBusy(true);
    setVoteError(null);
    try {
      await confirmIncident(incidentId, kind);
      onClose();
    } catch (reason) {
      const code = (reason as { code?: string })?.code;
      const message = reason instanceof Error ? reason.message : "";
      setVoteError(
        code === "42501" || /row-level security/i.test(message)
          ? "Tu cuenta está deshabilitada por reportes falsos; no puedes votar."
          : "No pudimos registrar tu voto. Intenta de nuevo.",
      );
    } finally {
      setBusy(false);
    }
  }

  const color = details ? CATEGORY_COLOR[details.category] : "var(--accent)";

  return (
    <section
      className="absolute inset-x-0 bottom-0 z-30 flex max-h-[88%] flex-col overflow-hidden rounded-t-[24px] border-t border-line bg-panel shadow-[0_-16px_48px_rgba(0,0,0,0.42)]"
      aria-label="Detalle del incidente"
    >
      <div className="flex items-center gap-3 px-4 pb-3 pt-3">
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar detalle"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-panel-2 text-ink"
        >
          <svg
            aria-hidden="true"
            width={18}
            height={18}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.25}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <span className="text-[16px] font-extrabold text-ink">Incidente</span>
        <span className="ml-auto h-1 w-9 rounded-full bg-line" aria-hidden="true" />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <div
          className="relative mb-4 flex min-h-32 items-end overflow-hidden rounded-2xl border border-line p-3"
          style={{
            background: `radial-gradient(circle at 75% 20%, color-mix(in srgb, ${color} 28%, transparent), transparent 46%), linear-gradient(135deg, var(--panel-3), var(--bg))`,
          }}
        >
          <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(135deg,transparent_0%,transparent_45%,var(--line)_45%,transparent_47%,transparent_53%,var(--line)_53%,transparent_55%,transparent_100%)] [background-size:12px_12px]" />
          {details ? (
            <div className="relative flex flex-wrap gap-2">
              <span
                className="rounded-full px-2.5 py-1 text-[10px] font-bold"
                style={{ backgroundColor: color, color: "var(--accent-ink)" }}
              >
                {CATEGORY_LABEL[details.category]}
              </span>
              <span className="rounded-full border border-line bg-[rgba(10,14,19,0.65)] px-2.5 py-1 text-[10px] font-bold text-ink">
                Severidad {details.severity}
              </span>
            </div>
          ) : null}
        </div>

        {hasError && !details ? (
          <p className="rounded-xl border border-sev-fire/40 bg-panel-2 px-3 py-3 text-[12px] text-sev-fire">
            No se pudo cargar este incidente. Intenta nuevamente.
          </p>
        ) : (
          <>
            <h1 className="text-[21px] font-extrabold leading-tight tracking-tight text-ink">
              {details?.title ?? "Cargando incidente…"}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted">
              <span>{details ? STATUS_LABEL[details.status] : ""}</span>
              {details ? (
                details.reporter_verified ? (
                  <span className="font-semibold text-accent">Reporte verificado ✓</span>
                ) : (
                  <span>Reporte ciudadano</span>
                )
              ) : null}
            </div>
            <p className="mt-4 text-[13px] leading-relaxed text-[#c7d0da]">
              {details?.description ?? "Cargando detalle…"}
            </p>
            <div className="mt-4 rounded-xl border border-line bg-panel-2 px-3 py-3 text-[12px] leading-relaxed text-muted">
              <span className="font-bold text-ink">{details?.confirmations ?? 0} confirmaron.</span>{" "}
              ¿Lo estás viendo? Tu reporte ayuda a verificar la información para toda la comunidad.
            </div>
            {voteError && (
              <p aria-live="polite" className="mt-2 text-[12px] text-sev-fire">
                {voteError}
              </p>
            )}
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2.5 border-t border-line bg-bg px-4 py-3">
        <button
          type="button"
          disabled={busy || !details}
          onClick={() => vote("confirm")}
          className="flex min-h-12 items-center justify-center gap-2 rounded-[14px] bg-ok px-3 text-sm font-extrabold text-[#04140b] disabled:opacity-60"
        >
          <svg
            aria-hidden="true"
            width={17}
            height={17}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m5 12 4 4L19 6" />
          </svg>
          Confirmar
        </button>
        <button
          type="button"
          disabled={busy || !details}
          onClick={() => vote("dispute")}
          className="min-h-12 rounded-[14px] border border-sev-fire/50 bg-panel-2 px-3 text-sm font-extrabold text-sev-fire disabled:opacity-60"
        >
          No es correcto
        </button>
      </div>
    </section>
  );
}
