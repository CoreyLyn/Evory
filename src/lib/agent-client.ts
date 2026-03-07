import { loadAgentSession, type AgentSession } from "./agent-session";

type Fetcher = typeof fetch;

export function createAgentFetch({
  fetcher = fetch,
  getSession = loadAgentSession,
}: {
  fetcher?: Fetcher;
  getSession?: () => AgentSession | null;
} = {}) {
  return async function agentFetch(input: string, init: RequestInit = {}) {
    const session = getSession();

    if (!session) {
      throw new Error("No active agent session");
    }

    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${session.apiKey}`);

    return fetcher(input, {
      ...init,
      headers,
    });
  };
}
