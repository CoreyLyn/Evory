import prisma from "@/lib/prisma";

export type ForumEngagementType = "LIKE" | "REPLY";

export type ForumEngagementInboxDeliveryItem = {
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

type ForumEngagementInboxItemInput = {
  id: string;
  type: ForumEngagementType;
  createdAt: Date | string;
  postId: string;
  actorAgentId: string;
  replyId: string | null;
  replyPreview: string | null;
  post?: {
    id: string;
    title: string;
  } | null;
  actorAgent?: {
    id: string;
    name: string;
    type: string;
  } | null;
};

type ForumEngagementInboxDelegate = {
  findMany(args: Record<string, unknown>): Promise<ForumEngagementInboxItemInput[]>;
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

export function buildForumEngagementSummary(
  items: ForumEngagementInboxItemInput[]
) {
  const deliveryItems = items
    .slice()
    .sort((a, b) => toDate(b.createdAt).getTime() - toDate(a.createdAt).getTime())
    .map(normalizeItem);

  return {
    deliveredAt: new Date().toISOString(),
    likeCount: deliveryItems.filter((item) => item.type === "LIKE").length,
    replyCount: deliveryItems.filter((item) => item.type === "REPLY").length,
    items: deliveryItems,
  };
}

function toDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

function normalizeItem(item: ForumEngagementInboxItemInput): ForumEngagementInboxDeliveryItem {
  const post = item.post ?? { id: item.postId, title: "" };
  const actorAgent = item.actorAgent ?? {
    id: item.actorAgentId,
    name: "",
    type: "CUSTOM",
  };

  return {
    id: item.id,
    type: item.type,
    createdAt: toDate(item.createdAt).toISOString(),
    post: {
      id: post.id,
      title: post.title,
    },
    actorAgent: {
      id: actorAgent.id,
      name: actorAgent.name,
      type: actorAgent.type,
    },
    ...(item.type === "REPLY" && (item.replyId || item.replyPreview)
      ? {
          reply: {
            id: item.replyId ?? item.id,
            content: item.replyPreview ?? "",
          },
        }
      : {}),
  };
}

export type ConsumeOptions = {
  prisma?: ForumEngagementInboxPrisma;
  now?: () => Date;
};

export async function consumeForumEngagementInbox(
  agentId: string,
  options: ConsumeOptions = {}
) {
  const db = options.prisma ?? (prisma as unknown as ForumEngagementInboxPrisma);
  const now = options.now ?? (() => new Date());

  const items = await db.$transaction(async (tx) => {
    const unread = await tx.forumEngagementInboxItem.findMany({
      where: {
        agentId,
        readAt: null,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    unread.sort(
      (a, b) =>
        toDate(b.createdAt).getTime() - toDate(a.createdAt).getTime()
    );

    if (unread.length > 0) {
      await tx.forumEngagementInboxItem.updateMany({
        where: {
          agentId,
          readAt: null,
          id: {
            in: unread.map((item) => item.id),
          },
        },
        data: {
          readAt: now(),
        },
      });
    }

    return unread;
  });

  return buildForumEngagementSummary(items);
}
