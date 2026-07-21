import { CATEGORY_VALUES } from "@pulso/core";

// Tool CONTRACTS the OpenAI Realtime session exposes to the model. These describe *what*
// the model can ask for; the *implementation* lives in the Supabase agent-tools function,
// wired together by the browser bridge in realtime-agent.ts.
//
// The user's location is NOT a model-supplied argument: the browser injects real lat/long
// (from navigator.geolocation) when it executes get_nearby_incidents, so the agent can
// never invent a position. Keep this list in sync with the server copy that
// create-realtime-session sends to OpenAI (backend/supabase/functions/create-realtime-session/tools.ts).
export const REALTIME_TOOLS = [
  {
    type: "function",
    name: "get_nearby_incidents",
    description:
      "Lista los incidentes activos cerca de la persona usuaria. Úsala cuando pregunte qué está pasando cerca, en su zona o en el mapa.",
    parameters: {
      type: "object",
      properties: {
        radius_meters: {
          type: "number",
          description: "Radio de búsqueda en metros. Por defecto 3000.",
        },
        filter_category: {
          type: ["string", "null"],
          enum: [...CATEGORY_VALUES, null],
          description: "Filtra por categoría, o null para todas.",
        },
      },
      required: [],
    },
  },
  {
    type: "function",
    name: "get_incident_details",
    description:
      "Devuelve el detalle de un incidente concreto (título, descripción, severidad, estado, confirmaciones). Úsala cuando pida más información sobre uno específico.",
    parameters: {
      type: "object",
      properties: {
        incident_id: {
          type: "string",
          description: "El id (uuid) del incidente.",
        },
      },
      required: ["incident_id"],
    },
  },
  {
    type: "function",
    name: "confirm_incident",
    description:
      "Registra la valoración de la persona usuaria sobre un incidente: 'confirm' si lo está viendo, 'dispute' si cree que no es correcto.",
    parameters: {
      type: "object",
      properties: {
        incident_id: {
          type: "string",
          description: "El id (uuid) del incidente.",
        },
        kind: {
          type: "string",
          enum: ["confirm", "dispute"],
          description: "'confirm' para confirmar, 'dispute' para disputar.",
        },
      },
      required: ["incident_id", "kind"],
    },
  },
] as const;
