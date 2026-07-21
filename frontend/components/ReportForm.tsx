"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CATEGORY_VALUES, clampSeverity } from "@pulso/core";
import type { Category, Severity } from "@pulso/core";
import { config, supabase } from "@/lib";

// Report flow: capture/upload a photo, request structured suggestions from analyze-report,
// let the reporter review every value, then insert the incident under their JWT identity.

interface AnalyzedFields {
  category: Category;
  severity: Severity;
  title: string;
  description: string;
}

interface ReportLocation {
  lat: number;
  lng: number;
  isFallback: boolean;
}

const CATEGORY_LABELS: Record<Category, string> = {
  road_closure: "Cierre vial",
  accident: "Accidente",
  flood: "Inundación",
  fire: "Incendio",
  public_event: "Evento público",
  other: "Otro",
};

type Phase = "idle" | "analyzing" | "ready" | "publishing";

export default function ReportForm() {
  const router = useRouter();
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fields, setFields] = useState<AnalyzedFields | null>(null);
  const [location, setLocation] = useState<ReportLocation | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  async function onPickPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setFields(null);
    setLocation(null);
    setPhotoPath(null);
    setPreview(URL.createObjectURL(file));
    setPhase("analyzing");

    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Sin sesión");

      // The bucket path is deliberately relative: <auth.uid()>/<uuid>.jpg.
      const path = `${uid}/${crypto.randomUUID()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("report-photos")
        .upload(path, file, { contentType: file.type });
      if (uploadError) throw uploadError;

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Sin sesión");

      const locate = async (): Promise<ReportLocation> => {
        if (typeof navigator === "undefined" || !navigator.geolocation) {
          return { lat: config.defaultLat, lng: config.defaultLng, isFallback: true };
        }

        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 10_000,
            }),
          );
          return {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            isFallback: false,
          };
        } catch {
          return { lat: config.defaultLat, lng: config.defaultLng, isFallback: true };
        }
      };

      const [analysisResponse, resolvedLocation] = await Promise.all([
        fetch(`${config.functionsUrl}/analyze-report`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ photo_path: path }),
        }),
        locate(),
      ]);

      if (!analysisResponse.ok) {
        const body = (await analysisResponse.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? `No se pudo analizar la foto (${analysisResponse.status})`);
      }

      const analysis = (await analysisResponse.json()) as AnalyzedFields;
      setPhotoPath(path);
      setFields({ ...analysis, severity: clampSeverity(analysis.severity) });
      setLocation(resolvedLocation);
      setPhase("ready");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No pudimos analizar la foto");
      setPhase("idle");
    }
  }

  async function publish() {
    if (!fields || !photoPath || !location) return;

    setError(null);
    setPhase("publishing");

    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Sin sesión");

      // Geography points use longitude first and an explicit SRID per the frozen contract.
      const { error: insertError } = await supabase.from("incidents").insert({
        reporter_id: uid,
        title: fields.title,
        description: fields.description,
        category: fields.category,
        severity: fields.severity,
        location: `SRID=4326;POINT(${location.lng} ${location.lat})`,
        photo_path: photoPath,
      });
      if (insertError) throw insertError;

      router.push("/");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No pudimos publicar el reporte");
      setPhase("ready");
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-4">
      <header className="mb-3 flex items-center gap-3">
        <button
          type="button"
          aria-label="Volver"
          onClick={() => router.back()}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-panel-2 text-xl leading-none text-muted"
        >
          ‹
        </button>
        <h1 className="text-[17px] font-extrabold tracking-[-0.02em] text-ink">Nuevo reporte</h1>
      </header>

      <label className="relative flex h-[124px] cursor-pointer items-center justify-center overflow-hidden rounded-[14px] border border-line bg-[repeating-linear-gradient(-45deg,#17212d_0,#17212d_3px,#141c27_3px,#141c27_7px)] text-[12px] font-semibold text-ink">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Tu foto" className="h-full w-full object-cover" />
        ) : (
          <span className="rounded-md bg-[#17202bbb] px-2 py-1.5">▣&nbsp; Tu foto</span>
        )}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={onPickPhoto}
        />
      </label>

      {phase === "analyzing" && (
        <p className="mt-3 text-center text-[12px] font-semibold text-accent">
          La IA está analizando tu foto…
        </p>
      )}
      {error && <p className="mt-3 text-center text-[12px] text-sev-fire">{error}</p>}

      {fields && location && (
        <section className="mt-3 rounded-[14px] border border-line bg-panel px-3.5 py-3">
          <p className="mb-3 text-[12px] font-bold text-accent">✧&nbsp; La IA analizó tu foto</p>

          <label className="grid grid-cols-[84px_1fr] items-center gap-2 border-b border-line py-2">
            <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-faint">
              Categoría
            </span>
            <select
              value={fields.category}
              onChange={(event) =>
                setFields({ ...fields, category: event.target.value as Category })
              }
              className="justify-self-end rounded-full border-0 bg-[#ffad4d] px-3 py-1 text-[11px] font-bold text-[#251305] outline-none"
            >
              {CATEGORY_VALUES.map((value) => (
                <option key={value} value={value}>
                  {CATEGORY_LABELS[value]}
                </option>
              ))}
            </select>
          </label>

          <label className="grid grid-cols-[84px_1fr] items-center gap-2 border-b border-line py-2">
            <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-faint">
              Severidad
            </span>
            <div className="justify-self-end">
              <input
                aria-label="Severidad"
                type="range"
                min={1}
                max={5}
                value={fields.severity}
                onChange={(event) =>
                  setFields({ ...fields, severity: clampSeverity(Number(event.target.value)) })
                }
                className="h-2 w-[112px] cursor-pointer accent-[#ff9f45]"
              />
            </div>
          </label>

          <label className="grid grid-cols-[84px_1fr] items-start gap-2 border-b border-line py-2">
            <span className="pt-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-faint">
              Título
            </span>
            <input
              value={fields.title}
              onChange={(event) => setFields({ ...fields, title: event.target.value })}
              className="min-w-0 border-0 bg-transparent p-0 text-right text-[13px] font-bold leading-4 text-ink outline-none"
            />
          </label>

          <label className="grid grid-cols-[84px_1fr] items-start gap-2 border-b border-line py-2">
            <span className="pt-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-faint">
              Descripción
            </span>
            <textarea
              value={fields.description}
              onChange={(event) => setFields({ ...fields, description: event.target.value })}
              rows={2}
              className="min-w-0 resize-none border-0 bg-transparent p-0 text-right text-[12px] leading-4 text-muted outline-none"
            />
          </label>

          {location.isFallback && (
            <div className="mt-3 rounded-lg border border-[#f4c54255] bg-panel-2 p-2.5">
              <p className="text-[11px] leading-4 text-sev-road">
                No pudimos obtener tu ubicación. Ajusta la ubicación aproximada antes de publicar.
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="text-[9px] font-semibold uppercase tracking-[0.08em] text-faint">
                  Latitud
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    value={location.lat}
                    onChange={(event) =>
                      setLocation({ ...location, lat: Number(event.target.value) })
                    }
                    className="mt-1 w-full rounded-md border border-line bg-panel px-2 py-1.5 text-[12px] text-ink outline-none"
                  />
                </label>
                <label className="text-[9px] font-semibold uppercase tracking-[0.08em] text-faint">
                  Longitud
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    value={location.lng}
                    onChange={(event) =>
                      setLocation({ ...location, lng: Number(event.target.value) })
                    }
                    className="mt-1 w-full rounded-md border border-line bg-panel px-2 py-1.5 text-[12px] text-ink outline-none"
                  />
                </label>
              </div>
            </div>
          )}

          <p className="mt-3 border-l border-line pl-2 text-[10.5px] leading-4 text-faint">
            Puedes editar cualquier campo antes de publicar.
          </p>
        </section>
      )}

      <button
        type="button"
        disabled={!fields || !location || phase === "publishing"}
        onClick={publish}
        className="mt-auto rounded-[14px] bg-accent px-3 py-3 text-[14px] font-extrabold text-accent-ink shadow-[0_12px_28px_-12px_var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
      >
        {phase === "publishing" ? "Publicando…" : "Publicar incidente"}
      </button>
    </div>
  );
}
