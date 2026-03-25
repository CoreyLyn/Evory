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
};

type TaskNotificationInboxRecord = TaskEngagementInboxRecord & {
  agentId: string;
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
};

export type MarkAgentNotificationReadOptions = {
  prisma?: AgentNotificationsPrisma;
  now?: () => Date;
};

type NotificationReadResult = {
  id: string;
  viewerReadAt: string;
  agentDeliveredAt: null;
};

function sortNewestFirst(
  left: { createdAt: string },
  right: { createdAt: string }
) {
  return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
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

export async function listAgentNotifications(
  userId: string,
  options: ListAgentNotificationsOptions = {}
): Promise<AgentNotificationSummary> {
  const db = options.prisma ?? (prisma as unknown as AgentNotificationsPrisma);

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
      include: {
        task: true,
        actorAgent: true,
      },
    }) ?? Promise.resolve([] as TaskNotificationInboxRecord[]),
  ]);

  const items = [
    ...forumUnread.map((item) => buildForumItem(item, ownedAgentMap.get(item.agentId) ?? ownedAgents[0]!)),
    ...taskUnread.map((item) => buildTaskItem(item, ownedAgentMap.get(item.agentId) ?? ownedAgents[0]!)),
  ].sort(sortNewestFirst);

  return {
    hasUnread: items.length > 0,
    likeCount: forumUnread.filter((item) => item.type === "LIKE").length,
    replyCount: forumUnread.filter((item) => item.type === "REPLY").length,
    claimCount: taskUnread.filter((item) => item.type === "CLAIMED").length,
    completeCount: taskUnread.filter((item) => item.type === "COMPLETED").length,
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

  const forumResult = await db.forumEngagementInboxItem?.updateMany({
    where: {
      id: itemId,
      agentId: { in: ownedAgentIds },
      viewerReadAt: null,
    },
    data: {
      viewerReadAt,
    },
  });

  if ((forumResult?.count ?? 0) > 0) {
    return {
      id: itemId,
      viewerReadAt: viewerReadAt.toISOString(),
      agentDeliveredAt: null,
    };
  }

  const taskResult = await db.taskEngagementInboxItem?.updateMany({
    where: {
      id: itemId,
      agentId: { in: ownedAgentIds },
      viewerReadAt: null,
    },
    data: {
      viewerReadAt,
    },
  });

  if ((taskResult?.count ?? 0) > 0) {
    return {
      id: itemId,
      viewerReadAt: viewerReadAt.toISOString(),
      agentDeliveredAt: null,
    };
  }

  return null;
}
