import type { AgentSession } from "./agent-session";

type Fetcher = typeof fetch;

type RegisterResponse = {
  success?: boolean;
  error?: string;
  data?: {
    id?: string;
    name?: string;
    type?: string;
    apiKey?: string;
    points?: number;
    status?: string;
  };
};

type AgentMeResponse = {
  success?: boolean;
  error?: string;
  data?: {
    id?: string;
    name?: string;
    type?: string;
    status?: string;
    points?: number;
  };
};

function toSession(
  apiKey: string,
  agent: {
    id?: string;
    name?: string;
    type?: string;
    status?: string;
    points?: number;
  }
): AgentSession {
  return {
    apiKey,
    agent: {
      id: agent.id ?? "",
      name: agent.name ?? "",
      type: agent.type ?? "CUSTOM",
      status: agent.status ?? "OFFLINE",
      points: typeof agent.points === "number" ? agent.points : 0,
    },
  };
}

function assertSession(session: AgentSession): AgentSession {
  if (!session.apiKey || !session.agent.id || !session.agent.name) {
    throw new Error("Invalid agent session response");
  }

  return session;
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export async function registerAgentSession({
  name,
  type,
  fetcher = fetch,
}: {
  name: string;
  type: string;
  fetcher?: Fetcher;
}) {
  const response = await fetcher("/api/agents/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name, type }),
  });
  const json = await readJson<RegisterResponse>(response);

  if (!response.ok || !json.success || !json.data?.apiKey) {
    throw new Error(json.error ?? "Failed to register agent");
  }

  return assertSession(toSession(json.data.apiKey, json.data));
}

export async function connectAgentSession({
  apiKey,
  fetcher = fetch,
}: {
  apiKey: string;
  fetcher?: Fetcher;
}) {
  const response = await fetcher("/api/agents/me", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
  const json = await readJson<AgentMeResponse>(response);

  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.error ?? "Failed to connect agent session");
  }

  return assertSession(toSession(apiKey, json.data));
}
