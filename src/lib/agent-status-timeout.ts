import prisma from "./prisma";
import { publishEvent } from "./live-events";
import { recordAgentActivity } from "./agent-activity";

export const STATUS_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
export const SCAN_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

type ExpiredAgent = {
  id: string;
  name: string;
  type: string;
  status: string;
  points: number;
  avatarConfig: unknown;
  bio: string;
  createdAt: Date;
  updatedAt: Date;
};

type AgentStatusTimeoutPrismaClient = {
  agent: {
    findMany: (args: {
      where: Record<string, unknown>;
      select: Record<string, boolean>;
    }) => Promise<ExpiredAgent[]>;
    updateMany: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<{ count: number }>;
  };
};

const timeoutPrisma = prisma as unknown as AgentStatusTimeoutPrismaClient;

export async function scanExpiredAgentStatuses(): Promise<number> {
  const now = new Date();

  const whereExpired = {
    status: { not: "OFFLINE" as const },
    statusExpiresAt: { lt: now },
  };

  const expiredAgents = await timeoutPrisma.agent.findMany({
    where: whereExpired,
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

  if (expiredAgents.length === 0) return 0;

  const result = await timeoutPrisma.agent.updateMany({
    where: whereExpired,
    data: { status: "OFFLINE", statusExpiresAt: null },
  });

  for (const agent of expiredAgents) {
    publishEvent({
      type: "agent.status.updated",
      payload: {
        previousStatus: agent.status,
        agent: {
          id: agent.id,
          name: agent.name,
          type: agent.type,
          status: "OFFLINE",
          points: agent.points,
          avatarConfig:
            agent.avatarConfig &&
            typeof agent.avatarConfig === "object" &&
            !Array.isArray(agent.avatarConfig)
              ? (agent.avatarConfig as Record<string, unknown>)
              : undefined,
          bio: agent.bio,
          createdAt: agent.createdAt.toISOString(),
          updatedAt: agent.updatedAt.toISOString(),
        },
      },
    });

    await recordAgentActivity({
      agentId: agent.id,
      type: "STATUS_CHANGED",
      summary: "activity.status.timeout",
      metadata: {
        previousStatus: agent.status,
        newStatus: "OFFLINE",
        source: "timeout",
      },
    });
  }

  return result.count;
}

// ── Global timer (globalThis pattern, same as live-events.ts) ──

declare global {
  var __agentStatusTimeoutTimer: ReturnType<typeof setInterval> | undefined;
}

export function startStatusTimeoutScanner(): void {
  if (globalThis.__agentStatusTimeoutTimer) return;

  globalThis.__agentStatusTimeoutTimer = setInterval(async () => {
    try {
      const count = await scanExpiredAgentStatuses();
      if (count > 0) {
        console.log(`[agent-status-timeout] Timed out ${count} agent(s)`);
      }
    } catch (error) {
      console.error("[agent-status-timeout]", error);
    }
  }, SCAN_INTERVAL_MS);
}

export function stopStatusTimeoutScanner(): void {
  if (globalThis.__agentStatusTimeoutTimer) {
    clearInterval(globalThis.__agentStatusTimeoutTimer);
    globalThis.__agentStatusTimeoutTimer = undefined;
  }
}

export function resetAgentStatusTimeoutForTest(): void {
  stopStatusTimeoutScanner();
}

// Auto-start on module load (skip in test environment)
// Node.js test runner sets NODE_TEST_CONTEXT; some setups use NODE_ENV=test
if (!process.env.NODE_TEST_CONTEXT && process.env.NODE_ENV !== "test") {
  startStatusTimeoutScanner();
}
