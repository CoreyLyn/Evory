import prisma from "@/lib/prisma";

export type TaskEngagementType = "CLAIMED" | "COMPLETED";

export type TaskEngagementInboxRecord = {
  id: string;
  type: TaskEngagementType;
  createdAt: Date;
  task: {
    id: string;
    title: string;
  };
  actorAgent: {
    id: string;
    name: string;
    type: string;
  };
};

export type TaskEngagementInboxSummaryItem = {
  id: string;
  type: TaskEngagementType;
  createdAt: string;
  task: {
    id: string;
    title: string;
  };
  actorAgent: {
    id: string;
    name: string;
    type: string;
  };
};

export type TaskEngagementInboxSummary = {
  deliveredAt: string;
  claimCount: number;
  completeCount: number;
  items: TaskEngagementInboxSummaryItem[];
};

type TaskEngagementInboxDelegate = {
  findMany(args: Record<string, unknown>): Promise<TaskEngagementInboxRecord[]>;
  updateMany(args: {
    where: Record<string, unknown>;
    data: { agentDeliveredAt: Date };
  }): Promise<{ count: number }>;
};

type TaskEngagementInboxPrisma = {
  $transaction<T>(
    callback: (tx: { taskEngagementInboxItem: TaskEngagementInboxDelegate }) => Promise<T>
  ): Promise<T>;
};

export type ConsumeTaskEngagementOptions = {
  prisma?: TaskEngagementInboxPrisma;
  now?: () => Date;
};

export function buildTaskEngagementSummary(
  items: TaskEngagementInboxRecord[],
  deliveredAt = new Date().toISOString()
): TaskEngagementInboxSummary {
  const deliveryItems = items
    .slice()
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map(
      (item): TaskEngagementInboxSummaryItem => ({
        id: item.id,
        type: item.type,
        createdAt: item.createdAt.toISOString(),
        task: {
          id: item.task.id,
          title: item.task.title,
        },
        actorAgent: {
          id: item.actorAgent.id,
          name: item.actorAgent.name,
          type: item.actorAgent.type,
        },
      })
    );

  return {
    deliveredAt,
    claimCount: deliveryItems.filter((item) => item.type === "CLAIMED").length,
    completeCount: deliveryItems.filter((item) => item.type === "COMPLETED").length,
    items: deliveryItems,
  };
}

export async function consumeTaskEngagementInbox(
  agentId: string,
  options: ConsumeTaskEngagementOptions = {}
) {
  const db = options.prisma ?? (prisma as unknown as TaskEngagementInboxPrisma);
  const now = options.now ?? (() => new Date());
  const deliveredAt = now().toISOString();
  const agentDeliveredAt = new Date(deliveredAt);

  class TaskEngagementInboxClaimLostError extends Error {}

  try {
    return await db.$transaction(async (tx) => {
      const unread = await tx.taskEngagementInboxItem.findMany({
        where: {
          agentId,
          agentDeliveredAt: null,
        },
        orderBy: {
          createdAt: "desc",
        },
        include: {
          task: true,
          actorAgent: true,
        },
      });

      if (unread.length === 0) {
        return buildTaskEngagementSummary([], deliveredAt);
      }

      const claimed = await tx.taskEngagementInboxItem.updateMany({
        where: {
          agentId,
          agentDeliveredAt: null,
          id: {
            in: unread.map((item) => item.id),
          },
        },
        data: {
          agentDeliveredAt,
        },
      });

      if (claimed.count !== unread.length) {
        throw new TaskEngagementInboxClaimLostError();
      }

      return buildTaskEngagementSummary(unread, deliveredAt);
    });
  } catch (error) {
    if (error instanceof TaskEngagementInboxClaimLostError) {
      return buildTaskEngagementSummary([], deliveredAt);
    }

    throw error;
  }
}
