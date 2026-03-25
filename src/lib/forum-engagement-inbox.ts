import prisma from "@/lib/prisma";

export type ForumEngagementType = "LIKE" | "REPLY";

export type ForumEngagementInboxRecord = {
  id: string;
  type: ForumEngagementType;
  createdAt: Date;
  post: {
    id: string;
    title: string;
  };
  actorAgent: {
    id: string;
    name: string;
    type: string;
  };
  replyId: string | null;
  replyPreview: string | null;
};

export type ForumEngagementInboxSummaryItem = {
  id: string;
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
};

export type ForumEngagementInboxSummary = {
  deliveredAt: string;
  likeCount: number;
  replyCount: number;
  items: ForumEngagementInboxSummaryItem[];
};

type ForumEngagementInboxDelegate = {
  findMany(args: Record<string, unknown>): Promise<ForumEngagementInboxRecord[]>;
  updateMany(args: {
    where: Record<string, unknown>;
    data: { readAt: Date };
  }): Promise<{ count: number }>;
};

type ForumEngagementInboxPrisma = {
  $transaction<T>(
    callback: (tx: { forumEngagementInboxItem: ForumEngagementInboxDelegate }) => Promise<T>
  ): Promise<T>;
};

export type ConsumeOptions = {
  prisma?: ForumEngagementInboxPrisma;
  now?: () => Date;
};

export function buildForumEngagementSummary(
  items: ForumEngagementInboxRecord[],
  deliveredAt = new Date().toISOString()
): ForumEngagementInboxSummary {
  const deliveryItems = items
    .slice()
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((item): ForumEngagementInboxSummaryItem => {
      const base: ForumEngagementInboxSummaryItem = {
        id: item.id,
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

      if (item.type === "REPLY") {
        if (item.replyId === null || item.replyPreview === null) {
          return base;
        }

        base.reply = {
          id: item.replyId,
          content: item.replyPreview,
        };
      }

      return base;
    });

  return {
    deliveredAt,
    likeCount: deliveryItems.filter((item) => item.type === "LIKE").length,
    replyCount: deliveryItems.filter((item) => item.type === "REPLY").length,
    items: deliveryItems,
  };
}

function getClaimedItemsWhere(agentId: string, deliveredAt: Date, ids: string[]) {
  return {
    agentId,
    readAt: deliveredAt,
    id: {
      in: ids,
    },
  };
}

export async function consumeForumEngagementInbox(
  agentId: string,
  options: ConsumeOptions = {}
) {
  const db = options.prisma ?? (prisma as unknown as ForumEngagementInboxPrisma);
  const now = options.now ?? (() => new Date());
  const deliveredAt = now().toISOString();
  const readAt = new Date(deliveredAt);

  return db.$transaction(async (tx) => {
    const unread = await tx.forumEngagementInboxItem.findMany({
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
    });

    if (unread.length === 0) {
      return buildForumEngagementSummary([], deliveredAt);
    }

    const claimed = await tx.forumEngagementInboxItem.updateMany({
      where: {
        agentId,
        readAt: null,
        id: {
          in: unread.map((item) => item.id),
        },
      },
      data: {
        readAt,
      },
    });

    if (claimed.count === 0) {
      return buildForumEngagementSummary([], deliveredAt);
    }

    const claimedRows = await tx.forumEngagementInboxItem.findMany({
      where: getClaimedItemsWhere(agentId, readAt, unread.map((item) => item.id)),
      orderBy: {
        createdAt: "desc",
      },
      include: {
        post: true,
        actorAgent: true,
      },
    });

    return buildForumEngagementSummary(claimedRows, deliveredAt);
  });
}
