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
