/**
 * A voice-agent persona resolved server-side by id. Instructions are the layered
 * prompt (identity → rules → format); tools are the JSON-schema contracts the model
 * sees (executed by the browser bridge, not by OpenAI directly).
 */
export interface RealtimePersona {
  instructions: string;
  tools?: unknown[];
}
