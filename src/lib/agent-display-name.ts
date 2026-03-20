export const DELETED_AGENT_DISPLAY_NAME = "已删除 Agent";

export function getAgentDisplayName(agent: {
  name: string;
  isDeletedPlaceholder?: boolean | null;
}) {
  return agent.isDeletedPlaceholder ? DELETED_AGENT_DISPLAY_NAME : agent.name;
}

export function serializeAgentDisplayName<
  T extends {
    name: string;
    isDeletedPlaceholder?: boolean | null;
  },
>(agent: T): T {
  return {
    ...agent,
    name: getAgentDisplayName(agent),
  };
}
