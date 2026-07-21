// Speech-ready decoration for the voice agent's tool results. The persona instructs
// Cerca to read summary/*_label/message fields verbatim (never ids or English field
// names), so the bridge stamps them here — deterministically, in Spanish — before the
// result goes back to the model. Raw fields are kept for the UI cards.

const CATEGORY_SPEECH: Record<string, string> = {
  road_closure: "cierre vial",
  accident: "accidente",
  flood: "inundación",
  fire: "incendio",
  public_event: "evento público",
  other: "incidente",
};

const STATUS_SPEECH: Record<string, string> = {
  provisional: "aún sin confirmar por la comunidad",
  confirmed: "confirmado por la comunidad",
  disputed: "en duda por la comunidad",
  resolved: "resuelto",
};

function reportedLabel(minutesAgo: number): string {
  if (minutesAgo < 1) return "reportado ahora mismo";
  if (minutesAgo < 60) {
    return `reportado hace ${minutesAgo} ${minutesAgo === 1 ? "minuto" : "minutos"}`;
  }
  const hours = Math.floor(minutesAgo / 60);
  if (hours < 24) return `reportado hace ${hours} ${hours === 1 ? "hora" : "horas"}`;
  const days = Math.floor(hours / 24);
  return `reportado hace ${days} ${days === 1 ? "día" : "días"}`;
}

function distanceLabel(meters: number): string {
  return meters >= 1000
    ? `a ${(meters / 1000).toFixed(1)} kilómetros`
    : `a ${Math.round(meters)} metros`;
}

function confirmationsLabel(confirmations: number): string {
  if (confirmations === 0) return "sin confirmaciones todavía";
  return `confirmado por ${confirmations} ${confirmations === 1 ? "vecino" : "vecinos"}`;
}

function decorateIncident(row: unknown): unknown {
  if (typeof row !== "object" || row === null) return row;
  const record = row as Record<string, unknown>;

  const decorated: Record<string, unknown> = { ...record };

  if (typeof record.created_at === "string") {
    const reportedAt = new Date(record.created_at).getTime();
    if (Number.isFinite(reportedAt)) {
      const minutesAgo = Math.max(0, Math.round((Date.now() - reportedAt) / 60_000));
      decorated.reported_minutes_ago = minutesAgo;
      decorated.reported_label = reportedLabel(minutesAgo);
    }
  }
  if (typeof record.distance_meters === "number") {
    decorated.distance_label = distanceLabel(record.distance_meters);
  }
  if (typeof record.category === "string" && CATEGORY_SPEECH[record.category]) {
    decorated.category_label = CATEGORY_SPEECH[record.category];
  }
  if (typeof record.severity === "number") {
    decorated.severity_label = `severidad ${record.severity} de 5`;
  }
  if (typeof record.status === "string" && STATUS_SPEECH[record.status]) {
    decorated.status_label = STATUS_SPEECH[record.status];
  }

  const parts = [
    typeof decorated.category_label === "string" && typeof record.title === "string"
      ? `${decorated.category_label}: ${record.title}`
      : typeof record.title === "string"
        ? record.title
        : null,
    typeof decorated.distance_label === "string" ? decorated.distance_label : null,
    typeof decorated.reported_label === "string" ? decorated.reported_label : null,
    typeof record.confirmations === "number"
      ? confirmationsLabel(record.confirmations)
      : null,
    typeof record.disputes === "number" && record.disputes > 0
      ? `${record.disputes} ${record.disputes === 1 ? "persona lo disputa" : "personas lo disputan"}`
      : null,
    record.reporter_verified === true ? "reporte con identidad verificada" : null,
    typeof decorated.status_label === "string" ? decorated.status_label : null,
  ].filter(Boolean);
  if (parts.length > 0) decorated.summary = `${parts.join(", ")}.`;

  return decorated;
}

/**
 * Decorate one agent tool result with Spanish speech-ready labels. `args` are the
 * model-sent tool arguments (used to phrase confirm_incident's message).
 */
export function decorateAgentToolResult(
  toolName: string,
  args: Record<string, unknown>,
  output: unknown,
): unknown {
  if (toolName === "get_nearby_incidents") {
    return Array.isArray(output) ? output.map(decorateIncident) : output;
  }
  if (toolName === "get_incident_details") {
    return decorateIncident(output);
  }
  if (toolName === "confirm_incident") {
    if (typeof output !== "object" || output === null) return output;
    const record = output as Record<string, unknown>;
    const action = args.kind === "dispute" ? "disputa" : "confirmación";
    const statusLabel =
      typeof record.status === "string" && STATUS_SPEECH[record.status]
        ? STATUS_SPEECH[record.status]
        : null;
    const tally =
      typeof record.confirmations === "number"
        ? `; el incidente queda ${confirmationsLabel(record.confirmations)}`
        : "";
    const state = statusLabel ? ` y ${statusLabel}` : "";
    return { ...record, message: `Listo, registré tu ${action}${tally}${state}.` };
  }
  return output;
}
