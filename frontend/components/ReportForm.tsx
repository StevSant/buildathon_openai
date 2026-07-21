"use client";

import { useState } from "react";
import type { Category, Severity } from "@pulso/core";
import { supabase, config } from "@/lib";

// Report flow: capture/upload a photo → upload to Storage → analyze-report (OpenAI vision)
// proposes structured fields → user reviews/edits → publish (INSERT into incidents).
// Supabase Realtime then broadcasts the new incident to every map.

interface AnalyzedFields {
  category: Category;
  severity: Severity;
  title: string;
  description: string;
}

const CATEGORIES: { value: Category; label: string }[] = [
  { value: "road_closure", label: "Cierre vial" },
  { value: "accident", label: "Accidente" },
  { value: "flood", label: "Inundación" },
  { value: "fire", label: "Incendio" },
  { value: "public_event", label: "Evento público" },
  { value: "other", label: "Otro" },
];

export default function ReportForm() {
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fields, setFields] = useState<AnalyzedFields | null>(null);
  const [phase, setPhase] = useState<"idle" | "analyzing" | "ready" | "publishing">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setPreview(URL.createObjectURL(file));
    setPhase("analyzing");
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Sin sesión");
      const path = `${uid}/${crypto.randomUUID()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("report-photos")
        .upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;
      setPhotoPath(path);

      const { data: sessionData } = await supabase.auth.getSession();
      const res = await fetch(`${config.functionsUrl}/analyze-report`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionData.session?.access_token}`,
        },
        body: JSON.stringify({ photo_path: path }),
      });
      if (!res.ok) throw new Error(`analyze-report falló: ${res.status}`);
      setFields((await res.json()) as AnalyzedFields);
      setPhase("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos analizar la foto");
      setPhase("idle");
    }
  }

  async function publish() {
    if (!fields || !photoPath) return;
    setPhase("publishing");
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      const position = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
        }),
      );
      // location as a PostGIS geography (EWKT, SRID 4326) — inserted under the user's own
      // reporter_id (RLS enforces reporter_id = auth.uid()).
      const point = `SRID=4326;POINT(${position.coords.longitude} ${position.coords.latitude})`;
      const { error: insErr } = await supabase.from("incidents").insert({
        reporter_id: uid,
        title: fields.title,
        description: fields.description,
        category: fields.category,
        severity: fields.severity,
        location: point,
        photo_path: photoPath,
      });
      if (insErr) throw insErr;
      // Reset for the next report.
      setFields(null);
      setPhotoPath(null);
      setPreview(null);
      setPhase("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos publicar el reporte");
      setPhase("ready");
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-3 px-4 py-4">
      <h1 className="text-base font-bold">Nuevo reporte</h1>

      <label className="relative flex h-[118px] cursor-pointer items-center justify-center overflow-hidden rounded-[14px] border border-line bg-gradient-to-br from-[#2a3340] via-[#171f2a] to-[#20303b] text-[12px] text-muted">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Tu foto" className="h-full w-full object-cover" />
        ) : (
          <span>Toca para tomar o subir una foto</span>
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
        <p className="text-[12px] text-accent">La IA está analizando tu foto…</p>
      )}
      {error && <p className="text-[12px] text-sev-fire">{error}</p>}

      {fields && (
        <div className="flex flex-col gap-2.5 rounded-[14px] border border-line bg-panel p-3.5">
          <div className="flex items-center gap-2 text-[12px] font-bold text-accent">
            La IA analizó tu foto
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-faint">
              Categoría
            </span>
            <select
              value={fields.category}
              onChange={(e) =>
                setFields({ ...fields, category: e.target.value as Category })
              }
              className="rounded-lg border border-line bg-panel-2 px-2.5 py-2 text-[13.5px] text-ink"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-faint">
              Severidad
            </span>
            <input
              type="range"
              min={1}
              max={5}
              value={fields.severity}
              onChange={(e) =>
                setFields({ ...fields, severity: Number(e.target.value) as Severity })
              }
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-faint">
              Título
            </span>
            <input
              value={fields.title}
              onChange={(e) => setFields({ ...fields, title: e.target.value })}
              className="rounded-lg border border-line bg-panel-2 px-2.5 py-2 text-[13.5px] font-semibold text-ink"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-faint">
              Descripción
            </span>
            <textarea
              value={fields.description}
              onChange={(e) => setFields({ ...fields, description: e.target.value })}
              rows={3}
              className="rounded-lg border border-line bg-panel-2 px-2.5 py-2 text-[13px] text-ink"
            />
          </label>

          <p className="text-[11px] text-faint">
            Puedes editar cualquier campo antes de publicar.
          </p>

          <button
            type="button"
            disabled={phase === "publishing"}
            onClick={publish}
            className="flex w-full items-center justify-center rounded-[14px] bg-accent px-3 py-3 text-sm font-bold text-accent-ink disabled:opacity-60"
          >
            {phase === "publishing" ? "Publicando…" : "Publicar incidente"}
          </button>
        </div>
      )}
    </div>
  );
}
