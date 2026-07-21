"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CATEGORY_VALUES, clampSeverity } from "@pulso/core";
import type { Category, Severity } from "@pulso/core";
import { config, supabase } from "@/lib";
import Icon from "./Icon";

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

// Color + sprite icon per category, matching the "navegación nocturna" mockup palette.
const CATEGORY_META: Record<Category, { color: string; icon: string }> = {
  road_closure: { color: "var(--sev-road)", icon: "ic-road" },
  accident: { color: "var(--sev-accident)", icon: "ic-car" },
  flood: { color: "var(--sev-flood)", icon: "ic-water" },
  fire: { color: "var(--sev-fire)", icon: "ic-fire" },
  public_event: { color: "var(--sev-event)", icon: "ic-spark" },
  other: { color: "var(--muted)", icon: "ic-alert" },
};

const SEVERITY_LEVELS = [1, 2, 3, 4, 5] as const;

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
      const code = (reason as { code?: string })?.code;
      const message = reason instanceof Error ? reason.message : "";
      setError(
        code === "42501" || /row-level security/i.test(message)
          ? "Tu cuenta está deshabilitada por reportes falsos y no puede publicar nuevos reportes."
          : message || "No pudimos publicar el reporte",
      );
      setPhase("ready");
    }
  }

  const meta = fields ? CATEGORY_META[fields.category] : null;

  return (
    <div className="s-rep">
      <div className="head">
        <button type="button" className="iconbtn" aria-label="Volver" onClick={() => router.back()}>
          <Icon name="ic-back" />
        </button>
        <span className="t">Nuevo reporte</span>
      </div>

      <label className="photo" style={{ display: "block", cursor: "pointer" }}>
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Tu foto" />
        ) : (
          <div className="grain" />
        )}
        <span className="chip tag">
          <Icon name="ic-cam" />
          Tu foto
        </span>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: "none" }}
          onChange={onPickPhoto}
        />
      </label>

      {phase === "analyzing" && (
        <div className="ai2">
          <div className="aihead">
            <Icon name="ic-spark" />
            Analizando tu foto…
          </div>
        </div>
      )}

      {error && (
        <p style={{ margin: 0, textAlign: "center", fontSize: 12, color: "var(--sev-fire)" }}>
          {error}
        </p>
      )}

      {fields && location && meta && (
        <div className="ai2">
          <div className="aihead">
            <Icon name="ic-spark" />
            La IA analizó tu foto
          </div>

          <div className="row">
            <span className="lab">Categoría</span>
            <label style={{ position: "relative", display: "inline-flex" }}>
              <span className="chip sev" style={{ background: meta.color }}>
                <Icon name={meta.icon} />
                {CATEGORY_LABELS[fields.category]}
              </span>
              <select
                aria-label="Categoría"
                value={fields.category}
                onChange={(event) =>
                  setFields({ ...fields, category: event.target.value as Category })
                }
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  border: 0,
                  opacity: 0,
                  cursor: "pointer",
                }}
              >
                {CATEGORY_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {CATEGORY_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="row">
            <span className="lab">Severidad</span>
            <span className="meter" role="group" aria-label="Severidad">
              {SEVERITY_LEVELS.map((level) => {
                const isOn = fields.severity >= level;
                return (
                  <span
                    key={level}
                    role="button"
                    tabIndex={0}
                    aria-label={`Severidad ${level}`}
                    aria-pressed={isOn}
                    className={isOn ? "on" : undefined}
                    style={isOn ? { background: meta.color, cursor: "pointer" } : { cursor: "pointer" }}
                    onClick={() => setFields({ ...fields, severity: clampSeverity(level) })}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setFields({ ...fields, severity: clampSeverity(level) });
                      }
                    }}
                  />
                );
              })}
            </span>
          </div>

          <div className="row" style={{ alignItems: "flex-start" }}>
            <span className="lab">Título</span>
            <input
              aria-label="Título"
              value={fields.title}
              onChange={(event) => setFields({ ...fields, title: event.target.value })}
              className="filled"
              style={{
                flex: 1,
                minWidth: 0,
                border: 0,
                outline: "none",
                background: "transparent",
                textAlign: "right",
                fontFamily: "inherit",
                color: "var(--ink)",
              }}
            />
          </div>

          <div className="row" style={{ alignItems: "flex-start" }}>
            <span className="lab">Descripción</span>
            <textarea
              aria-label="Descripción"
              value={fields.description}
              onChange={(event) => setFields({ ...fields, description: event.target.value })}
              rows={2}
              style={{
                flex: 1,
                minWidth: 0,
                border: 0,
                outline: "none",
                background: "transparent",
                resize: "none",
                textAlign: "right",
                fontFamily: "inherit",
                fontSize: 12,
                lineHeight: 1.35,
                color: "var(--muted)",
              }}
            />
          </div>

          {location.isFallback && (
            <div className="field" style={{ gap: 8 }}>
              <p className="editline" style={{ color: "var(--sev-road)" }}>
                <Icon name="ic-alert" />
                No pudimos obtener tu ubicación. Ajusta la ubicación aproximada antes de publicar.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <label className="field">
                  <span className="lab">Latitud</span>
                  <span className="input">
                    <input
                      type="number"
                      inputMode="decimal"
                      step="any"
                      value={location.lat}
                      onChange={(event) =>
                        setLocation({ ...location, lat: Number(event.target.value) })
                      }
                    />
                  </span>
                </label>
                <label className="field">
                  <span className="lab">Longitud</span>
                  <span className="input">
                    <input
                      type="number"
                      inputMode="decimal"
                      step="any"
                      value={location.lng}
                      onChange={(event) =>
                        setLocation({ ...location, lng: Number(event.target.value) })
                      }
                    />
                  </span>
                </label>
              </div>
            </div>
          )}

          <div className="editline">
            <Icon name="ic-chevron" />
            Puedes editar cualquier campo antes de publicar
          </div>
        </div>
      )}

      <button
        type="button"
        className="btn primary"
        style={{ marginTop: "auto" }}
        disabled={!fields || !location || phase === "publishing"}
        onClick={publish}
      >
        {phase === "publishing" ? "Publicando…" : "Publicar incidente"}
      </button>
      <p className="mb-0 mt-2 text-[11px] leading-relaxed text-faint">
        🔒 Tu reporte es anónimo: otros usuarios nunca ven tu nombre ni tus datos. Tu identidad
        verificada solo se usa para evitar reportes falsos.
      </p>
    </div>
  );
}
