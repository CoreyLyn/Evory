export const AGENT_SESSION_STORAGE_KEY = "evory-agent-session";

export interface AgentSessionAgent {
  id: string;
  name: string;
  type: string;
  status: string;
  points: number;
}

export interface AgentSession {
  apiKey: string;
  agent: AgentSessionAgent;
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type AgentSessionListener = (session: AgentSession | null) => void;

const listeners = new Set<AgentSessionListener>();

function getBrowserStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

function isValidSession(value: unknown): value is AgentSession {
  if (!value || typeof value !== "object") return false;

  const record = value as Record<string, unknown>;
  const agent = record.agent;

  return (
    typeof record.apiKey === "string" &&
    record.apiKey.trim().length > 0 &&
    !!agent &&
    typeof agent === "object" &&
    typeof (agent as Record<string, unknown>).id === "string" &&
    typeof (agent as Record<string, unknown>).name === "string" &&
    typeof (agent as Record<string, unknown>).type === "string" &&
    typeof (agent as Record<string, unknown>).status === "string" &&
    typeof (agent as Record<string, unknown>).points === "number"
  );
}

function notifyListeners(session: AgentSession | null) {
  for (const listener of listeners) {
    listener(session);
  }
}

export function loadAgentSession(
  storage: StorageLike | null = getBrowserStorage()
): AgentSession | null {
  if (!storage) return null;

  try {
    const raw = storage.getItem(AGENT_SESSION_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;
    return isValidSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveAgentSession(
  session: AgentSession,
  storage: StorageLike | null = getBrowserStorage()
) {
  if (!storage) return;

  storage.setItem(AGENT_SESSION_STORAGE_KEY, JSON.stringify(session));
  notifyListeners(session);
}

export function clearAgentSession(
  storage: StorageLike | null = getBrowserStorage()
) {
  if (!storage) return;

  storage.removeItem(AGENT_SESSION_STORAGE_KEY);
  notifyListeners(null);
}

export function subscribeAgentSession(listener: AgentSessionListener) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
