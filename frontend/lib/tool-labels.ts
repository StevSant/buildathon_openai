// Friendly Spanish labels for agent tool calls surfaced in the assistant conversation UI
// (RealtimeAssistant). Unknown tools fall back to their raw name at the call site.
export const TOOL_CALL_LABELS: Record<string, string> = {
  get_nearby_incidents: "Consultando incidentes cercanos…",
  get_incident_details: "Consultando el detalle del incidente…",
  confirm_incident: "Registrando tu valoración…",
};
