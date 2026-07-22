// A non-2xx response from the Supabase agent-tools function. The frozen contract (§4) always
// returns a `{ error: string }` envelope on failure; this preserves that server message and the
// HTTP status so the bridge can classify the failure, log it (without tokens or coordinates),
// and show one actionable Spanish state instead of retrying blindly.

export type ToolErrorKind = "validation" | "auth" | "unavailable" | "unknown";

function classifyStatus(status: number): ToolErrorKind {
  if (status === 400 || status === 422) return "validation";
  if (status === 401 || status === 403) return "auth";
  if (status === 404 || status >= 500) return "unavailable";
  return "unknown";
}

// One safe, actionable Spanish state per failure class — never a raw server message or status.
const USER_MESSAGE: Record<ToolErrorKind, string> = {
  validation: "No pude entender esa consulta. Intenta preguntar de otra forma.",
  auth: "Tu sesión expiró. Vuelve a iniciar sesión para seguir usando Cerca.",
  unavailable:
    "El servicio no está disponible ahora mismo. Intenta de nuevo en un momento.",
  unknown: "No pude completar esa consulta. Intenta de nuevo.",
};

export class ToolError extends Error {
  readonly toolName: string;
  readonly status: number;
  /** The server's `{ error }` message when present — for diagnostics only, never shown as-is. */
  readonly serverError: string | null;
  readonly kind: ToolErrorKind;
  /** The single Spanish message safe to surface to the user. */
  readonly userMessage: string;

  constructor(params: {
    toolName: string;
    status: number;
    serverError: string | null;
  }) {
    super(`agent-tools (${params.toolName}) falló: ${params.status}`);
    this.name = "ToolError";
    this.toolName = params.toolName;
    this.status = params.status;
    this.serverError = params.serverError;
    this.kind = classifyStatus(params.status);
    this.userMessage = USER_MESSAGE[this.kind];
  }
}
