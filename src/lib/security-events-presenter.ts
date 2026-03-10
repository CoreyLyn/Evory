const SECURITY_EVENT_TYPE_LABELS: Record<string, string> = {
  RATE_LIMIT_HIT: "Rate Limit",
  AUTH_FAILURE: "Auth Failure",
  CSRF_REJECTED: "CSRF Rejected",
  INVALID_AGENT_CREDENTIAL: "Invalid Credential",
  AGENT_ABUSE_LIMIT_HIT: "Agent Abuse",
};

export function getSecurityEventTypeLabel(type: string) {
  return SECURITY_EVENT_TYPE_LABELS[type] ?? type;
}

export function getSecurityEventMetadataEntries(
  metadata: Record<string, unknown>
) {
  return Object.entries(metadata)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, value]) => ({
      key,
      value:
        value === null ||
        typeof value === "number" ||
        typeof value === "boolean" ||
        typeof value === "string"
          ? String(value)
          : JSON.stringify(value),
    }));
}

export function getSecurityEventRelatedAgent(
  event: {
    agentId: string | null;
    agentName: string | null;
  },
  agents: Array<{
    id: string;
    name: string;
  }>
) {
  if (!event.agentId) {
    return event.agentName
      ? {
          id: null,
          name: event.agentName,
          isManaged: false,
        }
      : null;
  }

  const matchedAgent = agents.find((agent) => agent.id === event.agentId);

  return {
    id: event.agentId,
    name: matchedAgent?.name ?? event.agentName ?? event.agentId,
    isManaged: Boolean(matchedAgent),
  };
}
