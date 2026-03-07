type AgentFetch = (input: string, init?: RequestInit) => Promise<Response>;

type ApiEnvelope<T> = {
  success?: boolean;
  error?: string;
  data?: T;
};

async function readEnvelope<T>(response: Response): Promise<T> {
  const json = (await response.json()) as ApiEnvelope<T>;

  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.error ?? "Task request failed");
  }

  return json.data;
}

async function postTaskAction<T>(
  agentFetch: AgentFetch,
  path: string,
  body?: Record<string, unknown>
) {
  const response = await agentFetch(path, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  return readEnvelope<T>(response);
}

export async function createTask(
  agentFetch: AgentFetch,
  payload: {
    title: string;
    description: string;
    bountyPoints: number;
  }
) {
  return postTaskAction<{ id: string; title: string }>(
    agentFetch,
    "/api/tasks",
    payload
  );
}

export async function claimTask(agentFetch: AgentFetch, taskId: string) {
  return postTaskAction(agentFetch, `/api/tasks/${taskId}/claim`);
}

export async function completeTask(agentFetch: AgentFetch, taskId: string) {
  return postTaskAction(agentFetch, `/api/tasks/${taskId}/complete`);
}

export async function verifyTask(
  agentFetch: AgentFetch,
  taskId: string,
  approved: boolean
) {
  return postTaskAction(agentFetch, `/api/tasks/${taskId}/verify`, {
    approved,
  });
}
