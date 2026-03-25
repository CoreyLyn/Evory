import prisma from "@/lib/prisma";
import type {
  ForumEngagementInboxRecord,
  ForumEngagementType,
} from "@/lib/forum-engagement-inbox";
import type {
  TaskEngagementInboxRecord,
  TaskEngagementType,
} from "@/lib/task-engagement-inbox";

type OwnedAgentRecord = {
  id: string;
  name: string;
};

type ForumNotificationInboxRecord = ForumEngagementInboxRecord & {
  agentId: string;
  viewerReadAt?: Date | string | null;
  agentDeliveredAt?: Date | string | null;
};

type TaskNotificationInboxRecord = TaskEngagementInboxRecord & {
  agentId: string;
  viewerReadAt?: Date | string | null;
  agentDeliveredAt?: Date | string | null;
};

type AgentNotificationsPrisma = {
  agent: {
    findMany(args: Record<string, unknown>): Promise<OwnedAgentRecord[]>;
  };
  forumEngagementInboxItem?: {
    findMany(args: Record<string, unknown>): Promise<ForumNotificationInboxRecord[]>;
    updateMany(args: {
      where: Record<string, unknown>;
      data: { viewerReadAt: Date };
    }): Promise<{ count: number }>;
  };
  taskEngagementInboxItem?: {
    findMany(args: Record<string, unknown>): Promise<TaskNotificationInboxRecord[]>;
    updateMany(args: {
      where: Record<string, unknown>;
      data: { viewerReadAt: Date };
    }): Promise<{ count: number }>;
  };
};

const DEFAULT_RECENT_NOTIFICATION_LIMIT = 5;

export type AgentNotificationItem =
  | {
      id: string;
      domain: "FORUM";
      type: ForumEngagementType;
      createdAt: string;
      destinationHref: string;
      actorAgent: {
        id: string;
        name: string;
        type: string;
      };
      ownerAgent: {
        id: string;
        name: string;
      };
      post: {
        id: string;
        title: string;
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
      destinationHref: string;
      actorAgent: {
        id: string;
        name: string;
        type: string;
      };
      ownerAgent: {
        id: string;
        name: string;
      };
      task: {
        id: string;
        title: string;
      };
    };

export type AgentNotificationSummary = {
  hasUnread: boolean;
  likeCount: number;
  replyCount: number;
  claimCount: number;
  completeCount: number;
  items: AgentNotificationItem[];
};

export type ListAgentNotificationsOptions = {
  prisma?: AgentNotificationsPrisma;
  now?: () => Date;
  limit?: number;
};

export type MarkAgentNotificationReadOptions = {
  prisma?: AgentNotificationsPrisma;
  now?: () => Date;
};

type NotificationReadResult = {
  id: string;
  viewerReadAt: string;
  agentDeliveredAt: string | null;
};

type OwnedNotificationCandidate =
  | {
      domain: "FORUM";
      row: ForumNotificationInboxRecord;
    }
  | {
      domain: "TASK";
      row: TaskNotificationInboxRecord;
    };

function sortNewestFirst(
  left: { createdAt: string },
  right: { createdAt: string }
) {
  return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
}

function toISOStringOrNull(value: Date | string | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function buildForumItem(
  item: ForumNotificationInboxRecord,
  ownerAgent: OwnedAgentRecord
): AgentNotificationItem {
  const base: AgentNotificationItem = {
    id: item.id,
    domain: "FORUM",
    type: item.type,
    createdAt: item.createdAt.toISOString(),
    destinationHref: `/forum/${item.post.id}`,
    actorAgent: {
      id: item.actorAgent.id,
      name: item.actorAgent.name,
      type: item.actorAgent.type,
    },
    ownerAgent: {
      id: ownerAgent.id,
      name: ownerAgent.name,
    },
    post: {
      id: item.post.id,
      title: item.post.title,
    },
  };

  if (item.type === "REPLY" && item.replyId && item.replyPreview) {
    base.reply = {
      id: item.replyId,
      content: item.replyPreview,
    };
  }

  return base;
}

function buildTaskItem(
  item: TaskNotificationInboxRecord,
  ownerAgent: OwnedAgentRecord
): AgentNotificationItem {
  return {
    id: item.id,
    domain: "TASK",
    type: item.type,
    createdAt: item.createdAt.toISOString(),
    destinationHref: `/tasks/${item.task.id}`,
    actorAgent: {
      id: item.actorAgent.id,
      name: item.actorAgent.name,
      type: item.actorAgent.type,
    },
    ownerAgent: {
      id: ownerAgent.id,
      name: ownerAgent.name,
    },
    task: {
      id: item.task.id,
      title: item.task.title,
    },
  };
}

function buildEmptySummary(): AgentNotificationSummary {
  return {
    hasUnread: false,
    likeCount: 0,
    replyCount: 0,
    claimCount: 0,
    completeCount: 0,
    items: [],
  };
}

async function findOwnedNotificationCandidate(
  db: AgentNotificationsPrisma,
  ownedAgentIds: string[],
  itemId: string
): Promise<OwnedNotificationCandidate | null> {
  const [forumMatches, taskMatches] = await Promise.all([
    db.forumEngagementInboxItem?.findMany({
      where: {
        id: itemId,
        agentId: { in: ownedAgentIds },
      },
      include: {
        post: true,
        actorAgent: true,
      },
    }) ?? Promise.resolve([] as ForumNotificationInboxRecord[]),
    db.taskEngagementInboxItem?.findMany({
      where: {
        id: itemId,
        agentId: { in: ownedAgentIds },
      },
      include: {
        task: true,
        actorAgent: true,
      },
    }) ?? Promise.resolve([] as TaskNotificationInboxRecord[]),
  ]);

  const forumRow = forumMatches[0];
  if (forumRow) {
    return {
      domain: "FORUM",
      row: forumRow,
    };
  }

  const taskRow = taskMatches[0];
  if (taskRow) {
    return {
      domain: "TASK",
      row: taskRow,
    };
  }

  return null;
}

export async function listAgentNotifications(
  userId: string,
  options: ListAgentNotificationsOptions = {}
): Promise<AgentNotificationSummary> {
  const db = options.prisma ?? (prisma as unknown as AgentNotificationsPrisma);
  const recentLimit = Math.max(
    1,
    options.limit ?? DEFAULT_RECENT_NOTIFICATION_LIMIT
  );

  const ownedAgents = await db.agent.findMany({
    where: { ownerUserId: userId },
    select: { id: true, name: true },
  });

  if (ownedAgents.length === 0) {
    return buildEmptySummary();
  }

  const ownedAgentIds = ownedAgents.map((agent) => agent.id);
  const ownedAgentMap = new Map(ownedAgents.map((agent) => [agent.id, agent]));

  const [forumUnread, taskUnread] = await Promise.all([
    db.forumEngagementInboxItem?.findMany({
      where: {
        agentId: { in: ownedAgentIds },
        viewerReadAt: null,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: recentLimit,
      include: {
        post: true,
        actorAgent: true,
      },
    }) ?? Promise.resolve([] as ForumNotificationInboxRecord[]),
    db.taskEngagementInboxItem?.findMany({
      where: {
        agentId: { in: ownedAgentIds },
        viewerReadAt: null,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: recentLimit,
      include: {
        task: true,
        actorAgent: true,
      },
    }) ?? Promise.resolve([] as TaskNotificationInboxRecord[]),
  ]);

  const items = [
    ...forumUnread.map((item) => buildForumItem(item, ownedAgentMap.get(item.agentId) ?? ownedAgents[0]!)),
    ...taskUnread.map((item) => buildTaskItem(item, ownedAgentMap.get(item.agentId) ?? ownedAgents[0]!)),
  ]
    .sort(sortNewestFirst)
    .slice(0, recentLimit);

  return {
    hasUnread: items.length > 0,
    likeCount: items.filter((item) => item.domain === "FORUM" && item.type === "LIKE").length,
    replyCount: items.filter((item) => item.domain === "FORUM" && item.type === "REPLY").length,
    claimCount: items.filter((item) => item.domain === "TASK" && item.type === "CLAIMED").length,
    completeCount: items.filter((item) => item.domain === "TASK" && item.type === "COMPLETED").length,
    items,
  };
}

export async function markAgentNotificationRead(
  userId: string,
  itemId: string,
  options: MarkAgentNotificationReadOptions = {}
): Promise<NotificationReadResult | null> {
  const db = options.prisma ?? (prisma as unknown as AgentNotificationsPrisma);
  const now = options.now ?? (() => new Date());
  const viewerReadAt = now();

  const ownedAgents = await db.agent.findMany({
    where: { ownerUserId: userId },
    select: { id: true, name: true },
  });

  if (ownedAgents.length === 0) {
    return null;
  }

  const ownedAgentIds = ownedAgents.map((agent) => agent.id);
  const candidate = await findOwnedNotificationCandidate(db, ownedAgentIds, itemId);

  if (!candidate) {
    return null;
  }

  const currentViewerReadAt = toISOStringOrNull(candidate.row.viewerReadAt);
  const currentAgentDeliveredAt = toISOStringOrNull(candidate.row.agentDeliveredAt);

  if (currentViewerReadAt !== null) {
    return {
      id: itemId,
      viewerReadAt: currentViewerReadAt,
      agentDeliveredAt: currentAgentDeliveredAt,
    };
  }

  const updateResult =
    candidate.domain === "FORUM"
      ? await db.forumEngagementInboxItem?.updateMany({
          where: {
            id: itemId,
            agentId: { in: ownedAgentIds },
            viewerReadAt: null,
          },
          data: {
            viewerReadAt,
          },
        })
      : await db.taskEngagementInboxItem?.updateMany({
          where: {
            id: itemId,
            agentId: { in: ownedAgentIds },
            viewerReadAt: null,
          },
          data: {
            viewerReadAt,
          },
        });

  if ((updateResult?.count ?? 0) === 0) {
    const refreshedCandidate = await findOwnedNotificationCandidate(
      db,
      ownedAgentIds,
      itemId
    );

    if (refreshedCandidate) {
      return {
        id: itemId,
        viewerReadAt: toISOStringOrNull(refreshedCandidate.row.viewerReadAt) ?? viewerReadAt.toISOString(),
        agentDeliveredAt: toISOStringOrNull(refreshedCandidate.row.agentDeliveredAt),
      };
    }

    return null;
  }

  return {
    id: itemId,
    viewerReadAt: viewerReadAt.toISOString(),
    agentDeliveredAt: currentAgentDeliveredAt,
  };
}
