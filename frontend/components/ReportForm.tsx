"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CATEGORY_VALUES, clampSeverity } from "@pulso/core";
import type { Category, Severity } from "@pulso/core";
import { compressImage, config, supabase } from "@/lib";
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
  const [isCategoryConfirmed, setIsCategoryConfirmed] = useState(false);
  const [location, setLocation] = useState<ReportLocation | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const analysisRequestId = useRef(0);
  const previewUrl = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    },
    [],
  );

  async function onPickPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    const requestId = ++analysisRequestId.current;

    setError(null);
    setFields(null);
    setIsCategoryConfirmed(false);
    setLocation(null);
    setPhotoPath(null);
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = URL.createObjectURL(file);
    setPreview(previewUrl.current);
    setPhase("analyzing");

    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Sin sesión");

      // Re-encode to a bounded JPEG (handles HEIC/huge camera files) so the stored object
      // always matches its .jpg path and OpenAI vision can read it.
      const photo = await compressImage(file);

      // The bucket path is deliberately relative: <auth.uid()>/<uuid>.jpg.
      const path = `${uid}/${crypto.randomUUID()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("report-photos")
        .upload(path, photo, { contentType: "image/jpeg" });
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
      if (requestId !== analysisRequestId.current) return;
      setPhotoPath(path);
      setFields({ ...analysis, severity: clampSeverity(analysis.severity) });
      setIsCategoryConfirmed(analysis.category !== "other");
      setLocation(resolvedLocation);
      setPhase("ready");
    } catch (reason) {
      if (requestId !== analysisRequestId.current) return;
      setError(reason instanceof Error ? reason.message : "No pudimos analizar la foto");
      setPhase("idle");
    }
  }

  function chooseCategory(category: Category) {
    setFields((current) => (current ? { ...current, category } : current));
    setIsCategoryConfirmed(true);
  }

  const canPublish = Boolean(fields && photoPath && location && isCategoryConfirmed);

  async function publish() {
    if (!canPublish || !fields || !photoPath || !location) return;

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
        <p
          role="alert"
          style={{ margin: 0, textAlign: "center", fontSize: 12, color: "var(--sev-fire)" }}
        >
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
                value={isCategoryConfirmed ? fields.category : ""}
                onChange={(event) => chooseCategory(event.target.value as Category)}
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
                <option value="" disabled>
                  Elige una categoría
                </option>
                {CATEGORY_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {CATEGORY_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {fields.category === "other" && !isCategoryConfirmed && (
            <div
              role="alert"
              style={{
                margin: "0 14px 12px",
                padding: 12,
                border: "1px solid color-mix(in srgb, var(--sev-road) 55%, var(--line))",
                borderRadius: 12,
                background: "color-mix(in srgb, var(--sev-road) 8%, var(--panel-2))",
              }}
            >
              <div style={{ display: "flex", gap: 8, color: "var(--sev-road)" }}>
                <Icon name="ic-alert" />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800 }}>
                    La IA no pudo identificar el incidente con seguridad.
                  </div>
                  <div style={{ marginTop: 2, fontSize: 11, color: "var(--muted)" }}>
                    ¿Qué está pasando?
                  </div>
                </div>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 7,
                  marginTop: 10,
                }}
              >
                {CATEGORY_VALUES.map((category) => {
                  const option = CATEGORY_META[category];
                  return (
                    <button
                      key={category}
                      type="button"
                      aria-pressed={false}
                      onClick={() => chooseCategory(category)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        minWidth: 0,
                        padding: "8px 9px",
                        border: `1px solid color-mix(in srgb, ${option.color} 45%, var(--line))`,
                        borderRadius: 9,
                        background: `color-mix(in srgb, ${option.color} 12%, var(--panel))`,
                        color: "var(--ink)",
                        fontSize: 11,
                        fontWeight: 700,
                        textAlign: "left",
                      }}
                    >
                      <Icon name={option.icon} style={{ color: option.color }} />
                      <span>{CATEGORY_LABELS[category]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

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
        disabled={!canPublish || phase === "publishing"}
        onClick={publish}
      >
        {phase === "publishing"
          ? "Publicando…"
          : fields && !isCategoryConfirmed
            ? "Confirma la categoría"
            : "Publicar incidente"}
      </button>
      <p className="mb-0 mt-2 text-[11px] leading-relaxed text-faint">
        🔒 Tu reporte es anónimo: otros usuarios nunca ven tu nombre ni tus datos. Tu identidad
        verificada solo se usa para evitar reportes falsos.
      </p>
    </div>
  );
}
