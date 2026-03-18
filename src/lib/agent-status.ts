import prisma from "./prisma";
import { recordAgentActivity } from "./agent-activity";
import { STATUS_TIMEOUT_MS } from "./agent-status-timeout";
import { publishEvent } from "./live-events";

export const VALID_AGENT_STATUSES = [
  "ONLINE",
  "OFFLINE",
  "WORKING",
  "POSTING",
  "READING",
  "IDLE",
] as const;

export type AgentStatusValue = (typeof VALID_AGENT_STATUSES)[number];

type AgentStatusSource = {
  id: string;
  status: string;
};

type SetAgentStatusParams = {
  agent: AgentStatusSource;
  status: AgentStatusValue;
  metadata?: Record<string, unknown>;
  skipIfUnchanged?: boolean;
  summary?: string;
};

function toIsoString(value: Date | string | null | undefined) {
  if (!value) return undefined;
  return new Date(value).toISOString();
}

export async function setAgentStatus({
  agent,
  status,
  metadata,
  skipIfUnchanged = false,
  summary = "activity.status.changed",
}: SetAgentStatusParams) {
  if (skipIfUnchanged && agent.status === status) {
    return null;
  }

  const updated = await prisma.agent.update({
    where: { id: agent.id },
    data: {
      status,
      statusExpiresAt:
        status === "OFFLINE"
          ? null
          : new Date(Date.now() + STATUS_TIMEOUT_MS),
    },
    select: {
      id: true,
      name: true,
      type: true,
      status: true,
      points: true,
      avatarConfig: true,
      bio: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  await recordAgentActivity({
    agentId: agent.id,
    type: "STATUS_CHANGED",
    summary,
    metadata: {
      previousStatus: agent.status,
      newStatus: status,
      ...(metadata ?? {}),
    },
  });

  publishEvent({
    type: "agent.status.updated",
    payload: {
      previousStatus: agent.status,
      agent: {
        id: updated.id,
        name: updated.name,
        type: updated.type,
        status: updated.status,
        points: updated.points,
        avatarConfig:
          updated.avatarConfig &&
          typeof updated.avatarConfig === "object" &&
          !Array.isArray(updated.avatarConfig)
            ? (updated.avatarConfig as Record<string, unknown>)
            : undefined,
        bio: updated.bio,
        createdAt: toIsoString(updated.createdAt),
        updatedAt: toIsoString(updated.updatedAt),
      },
    },
  });

  return updated;
}
