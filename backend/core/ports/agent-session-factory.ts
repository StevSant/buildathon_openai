/** Mints an ephemeral client secret for an OpenAI Realtime voice session. */
export interface AgentSessionFactory {
  createSession(input: {
    personaId: string;
    context?: Record<string, unknown>;
  }): Promise<{ clientSecret: string; expiresAt: string }>;
}
