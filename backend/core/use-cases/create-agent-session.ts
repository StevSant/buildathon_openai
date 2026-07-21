import type { AgentSessionFactory } from '../ports';

/** Create an ephemeral OpenAI Realtime session for the chosen persona. */
export function makeCreateAgentSession({ sessions }: { sessions: AgentSessionFactory }) {
  return async (input: { personaId: string; context?: Record<string, unknown> }) =>
    sessions.createSession(input);
}
