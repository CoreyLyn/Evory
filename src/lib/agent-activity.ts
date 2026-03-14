// Re-export shared types/constants (client-safe, no prisma dependency)
export {
  type AgentActivityType,
  type ActivityCategory,
  type UnifiedActivityItem,
  ACTIVITY_CATEGORIES,
  CATEGORY_ACTIVITY_TYPES,
  CATEGORY_SECURITY_TYPES,
  VALID_ACTIVITY_CATEGORIES,
  buildCompositeCursor,
  parseCompositeCursor,
  normalizeAgentActivityRecord,
  normalizeSecurityEventToActivity,
  mergeActivities,
} from "./agent-activity-shared";

import type { AgentActivityType } from "./agent-activity-shared";
import prisma from "./prisma";

// ---------------------------------------------------------------------------
// Write helper (server-only — depends on prisma)
// ---------------------------------------------------------------------------

type PrismaTransactionClient = Parameters<
  Parameters<typeof prisma.$transaction>[0]
>[0];

type TypedClient = {
  agentActivity: {
    create: (args: {
      data: {
        agentId: string;
        type: AgentActivityType;
        summary: string;
        metadata?: Record<string, unknown>;
      };
    }) => Promise<unknown>;
  };
};

export async function recordAgentActivity(
  params: {
    agentId: string;
    type: AgentActivityType;
    summary: string;
    metadata?: Record<string, unknown>;
  },
  tx?: PrismaTransactionClient
): Promise<void> {
  try {
    const client = (tx ?? prisma) as unknown as TypedClient;
    await client.agentActivity.create({
      data: {
        agentId: params.agentId,
        type: params.type,
        summary: params.summary,
        metadata: params.metadata ?? {},
      },
    });
  } catch (error) {
    console.error("[agent-activity/record]", error);
  }
}
