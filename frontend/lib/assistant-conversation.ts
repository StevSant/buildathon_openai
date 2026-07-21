import type { IncidentDetails, NearbyIncident } from "@pulso/core";

export interface AssistantLocation {
  lat: number;
  long: number;
}

export type AssistantTurnContent =
  | { kind: "text"; role: "user" | "agent" | "tool"; text: string }
  | { kind: "incidents"; incidents: NearbyIncident[] }
  | { kind: "detail"; details: IncidentDetails };

export type AssistantTurn = AssistantTurnContent & {
  exchangeId: number;
};
