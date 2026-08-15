/**
 * CinePaís agent configuration.
 * Exports the agent base URL from environment variables.
 * This is the ONLY place the URL is read.
 */

export const AGENT_BASE_URL =
  process.env.NEXT_PUBLIC_AGENT_URL ?? "http://localhost:8000";
