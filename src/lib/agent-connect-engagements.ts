import prisma from "@/lib/prisma";
import type {
  ForumEngagementInboxRecord,
  ForumEngagementType,
} from "@/lib/forum-engagement-inbox";
import type {
  TaskEngagementInboxRecord,
  TaskEngagementType,
} from "@/lib/task-engagement-inbox";

export type AgentConnectEngagementItem =
  | {
      id: string;
      domain: "FORUM";
      type: ForumEngagementType;
      createdAt: string;
      post: {
        id: string;
        title: string;
      };
      actorAgent: {
        id: string;
        name: string;
        type: string;
      };
      reply?: {
        id: string;
        content: string;
      };
    }
  | {
      id: string;
      domain: "TASK";
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

export type AgentConnectEngagementSummary = {
  deliveredAt: string;
  forumLikeCount: number;
  forumReplyCount: number;
  taskClaimCount: number;
  taskCompleteCount: number;
  items: AgentConnectEngagementItem[];
};

type ForumEngagementInboxDelegate = {
  findMany(args: Record<string, unknown>): Promise<ForumEngagementInboxRecord[]>;
  updateMany(args: {
    where: Record<string, unknown>;
    data: { readAt: Date };
  }): Promise<{ count: number }>;
};

type TaskEngagementInboxDelegate = {
  findMany(args: Record<string, unknown>): Promise<TaskEngagementInboxRecord[]>;
  updateMany(args: {
    where: Record<string, unknown>;
    data: { readAt: Date };
  }): Promise<{ count: number }>;
};

type AgentConnectEngagementPrisma = {
  $transaction<T>(
    callback: (tx: {
      forumEngagementInboxItem: ForumEngagementInboxDelegate;
      taskEngagementInboxItem: TaskEngagementInboxDelegate;
    }) => Promise<T>
  ): Promise<T>;
};

export type ConsumeAgentConnectEngagementOptions = {
  prisma?: AgentConnectEngagementPrisma;
  now?: () => Date;
};

function buildForumItems(
  items: ForumEngagementInboxRecord[]
): AgentConnectEngagementItem[] {
  return items.map((item) => {
    const base: AgentConnectEngagementItem = {
      id: item.id,
      domain: "FORUM",
      type: item.type,
      createdAt: item.createdAt.toISOString(),
      post: {
        id: item.post.id,
        title: item.post.title,
      },
      actorAgent: {
        id: item.actorAgent.id,
        name: item.actorAgent.name,
        type: item.actorAgent.type,
      },
    };

    if (item.type === "REPLY" && item.replyId && item.replyPreview) {
      base.reply = {
        id: item.replyId,
        content: item.replyPreview,
      };
    }

    return base;
  });
}

function buildTaskItems(
  items: TaskEngagementInboxRecord[]
): AgentConnectEngagementItem[] {
  return items.map((item) => ({
    id: item.id,
    domain: "TASK",
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
  }));
}

export function buildAgentConnectEngagementSummary(
  forumItems: ForumEngagementInboxRecord[],
  taskItems: TaskEngagementInboxRecord[],
  deliveredAt = new Date().toISOString()
): AgentConnectEngagementSummary {
  const items = [...buildForumItems(forumItems), ...buildTaskItems(taskItems)].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return {
    deliveredAt,
    forumLikeCount: forumItems.filter((item) => item.type === "LIKE").length,
    forumReplyCount: forumItems.filter((item) => item.type === "REPLY").length,
    taskClaimCount: taskItems.filter((item) => item.type === "CLAIMED").length,
    taskCompleteCount: taskItems.filter((item) => item.type === "COMPLETED").length,
    items,
  };
}

export async function consumeAgentConnectEngagements(
  agentId: string,
  options: ConsumeAgentConnectEngagementOptions = {}
) {
  const db =
    options.prisma ?? (prisma as unknown as AgentConnectEngagementPrisma);
  const now = options.now ?? (() => new Date());
  const deliveredAt = now().toISOString();
  const readAt = new Date(deliveredAt);

  class AgentConnectEngagementClaimLostError extends Error {}

  try {
    return await db.$transaction(async (tx) => {
      const [forumUnread, taskUnread] = await Promise.all([
        tx.forumEngagementInboxItem.findMany({
          where: {
            agentId,
            readAt: null,
          },
          orderBy: {
            createdAt: "desc",
          },
          include: {
            post: true,
            actorAgent: true,
          },
        }),
        tx.taskEngagementInboxItem.findMany({
          where: {
            agentId,
            readAt: null,
          },
          orderBy: {
            createdAt: "desc",
          },
          include: {
            task: true,
            actorAgent: true,
          },
        }),
      ]);

      if (forumUnread.length > 0) {
        const forumClaimed = await tx.forumEngagementInboxItem.updateMany({
          where: {
            agentId,
            readAt: null,
            id: {
              in: forumUnread.map((item) => item.id),
            },
          },
          data: {
            readAt,
          },
        });

        if (forumClaimed.count !== forumUnread.length) {
          throw new AgentConnectEngagementClaimLostError();
        }
      }

      if (taskUnread.length > 0) {
        const taskClaimed = await tx.taskEngagementInboxItem.updateMany({
          where: {
            agentId,
            readAt: null,
            id: {
              in: taskUnread.map((item) => item.id),
            },
          },
          data: {
            readAt,
          },
        });

        if (taskClaimed.count !== taskUnread.length) {
          throw new AgentConnectEngagementClaimLostError();
        }
      }

      return buildAgentConnectEngagementSummary(
        forumUnread,
        taskUnread,
        deliveredAt
      );
    });
  } catch (error) {
    if (error instanceof AgentConnectEngagementClaimLostError) {
      return buildAgentConnectEngagementSummary([], [], deliveredAt);
    }

    throw error;
  }
}
