import { INCIDENT_STATUS_LABELS } from "@pulso/core";
import type { ConfirmationKind, IncidentStatus } from "@pulso/core";

// Presentation layer for confirm_incident: echoes the RPC result plus a ready-to-speak
// Spanish confirmation message so the agent tells the user exactly what was recorded.
export function presentConfirmation(
  result: { id: string; confirmations: number; status: IncidentStatus },
  kind: ConfirmationKind,
) {
  const statusLabel = INCIDENT_STATUS_LABELS[result.status];
  const message =
    kind === "confirm"
      ? `Tu confirmación quedó registrada. El incidente suma ${result.confirmations} ${
          result.confirmations === 1 ? "confirmación" : "confirmaciones"
        } y su estado es: ${statusLabel}.`
      : `Tu disputa quedó registrada. El estado del incidente ahora es: ${statusLabel}.`;

  return { ...result, status_label: statusLabel, message };
}
