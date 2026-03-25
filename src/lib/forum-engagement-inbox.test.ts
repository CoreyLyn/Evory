import assert from "node:assert/strict";
import test from "node:test";

import {
  buildForumEngagementSummary,
  consumeForumEngagementInbox,
  type ForumEngagementInboxRecord,
} from "./forum-engagement-inbox";
import { createForumEngagementInboxItemFixture } from "@/test/factories";

test("buildForumEngagementSummary counts likes and replies separately", () => {
  const summary = buildForumEngagementSummary([
    createForumEngagementInboxItemFixture({
      id: "eng-1",
      type: "LIKE",
      createdAt: new Date("2026-03-25T09:50:00.000Z"),
    }),
    createForumEngagementInboxItemFixture({
      id: "eng-2",
      type: "REPLY",
      createdAt: new Date("2026-03-25T09:59:00.000Z"),
      replyId: "reply-1",
      replyPreview: "Useful reply",
    }),
  ], "2026-03-25T10:00:00.000Z");

  assert.equal(summary.likeCount, 1);
  assert.equal(summary.replyCount, 1);
  assert.equal(summary.deliveredAt, "2026-03-25T10:00:00.000Z");
  assert.equal(summary.items[0]?.reply?.content, "Useful reply");
});

test("consumeForumEngagementInbox uses one timestamp for readAt and deliveredAt", async () => {
  let updatedReadAt: string | null = null;

  const prismaMock = {
    $transaction: async (
      callback: (tx: {
        forumEngagementInboxItem: {
          findMany: (args: Record<string, unknown>) => Promise<
            ForumEngagementInboxRecord[]
          >;
          updateMany: (args: {
            where: Record<string, unknown>;
            data: { readAt: Date };
          }) => Promise<{ count: number }>;
        };
      }) => Promise<unknown>
    ) =>
      callback({
        forumEngagementInboxItem: {
          findMany: async () => [
            createForumEngagementInboxItemFixture({
              id: "eng-newest",
              createdAt: new Date("2026-03-25T09:59:00.000Z"),
              type: "LIKE",
            }),
          ],
          updateMany: async ({ data }) => {
            updatedReadAt = data.readAt.toISOString();
            return { count: 1 };
          },
        },
      }),
  };

  const result = await consumeForumEngagementInbox("author-1", {
    prisma: prismaMock,
    now: () => new Date("2026-03-25T10:00:00.000Z"),
  });

  assert.equal(result.deliveredAt, "2026-03-25T10:00:00.000Z");
  assert.equal(result.likeCount, 1);
  assert.equal(result.replyCount, 0);
  assert.equal(result.items[0]?.id, "eng-newest");
  assert.equal(updatedReadAt, "2026-03-25T10:00:00.000Z");
});

test("consumeForumEngagementInbox only returns rows this caller actually claimed during a same-timestamp overlap", async () => {
  const unreadRows: Array<ForumEngagementInboxRecord & { readAt?: Date | null }> = [
    createForumEngagementInboxItemFixture({
      id: "eng-newest",
      createdAt: new Date("2026-03-25T09:59:00.000Z"),
      type: "REPLY",
      replyId: "reply-1",
      replyPreview: "Newest reply",
    }),
    createForumEngagementInboxItemFixture({
      id: "eng-middle",
      createdAt: new Date("2026-03-25T09:55:00.000Z"),
      type: "LIKE",
    }),
    createForumEngagementInboxItemFixture({
      id: "eng-oldest",
      createdAt: new Date("2026-03-25T09:50:00.000Z"),
      type: "LIKE",
    }),
  ];

  const claimedByTransaction = new Map<number, string[]>();
  let transactionCount = 0;

  const prismaMock = {
    $transaction: async (
      callback: (tx: {
        forumEngagementInboxItem: {
          findMany: (args: Record<string, unknown>) => Promise<
            ForumEngagementInboxRecord[]
          >;
          updateMany: (args: {
            where: Record<string, unknown>;
            data: { readAt: Date };
          }) => Promise<{ count: number }>;
        };
      }) => Promise<unknown>
    ) => {
      transactionCount += 1;
      const txId = transactionCount;
      claimedByTransaction.set(txId, []);

      return callback({
        forumEngagementInboxItem: {
          findMany: async (args): Promise<ForumEngagementInboxRecord[]> => {
            const where = args.where as { readAt?: Date | null };

            if (where.readAt === null) {
              return unreadRows.map((item) => ({ ...item }));
            }

            return unreadRows.filter(
              (item) =>
                item.readAt instanceof Date &&
                where.readAt instanceof Date &&
                item.readAt.getTime() === where.readAt.getTime()
            );
          },
          updateMany: async ({ where, data }) => {
            const id = where.id as string;
            const row = unreadRows.find((entry) => entry.id === id);
            if (!row || row.readAt) {
              return { count: 0 };
            }

            if (txId === 1 && (id === "eng-newest" || id === "eng-middle")) {
              row.readAt = data.readAt;
              claimedByTransaction.get(txId)?.push(id);
              return { count: 1 };
            }

            if (txId === 2 && id === "eng-oldest") {
              row.readAt = data.readAt;
              claimedByTransaction.get(txId)?.push(id);
              return { count: 1 };
            }

            return { count: 0 };
          },
        },
      });
    },
  };

  const [first, second] = await Promise.all([
    consumeForumEngagementInbox("author-1", {
      prisma: prismaMock,
      now: () => new Date("2026-03-25T10:00:00.000Z"),
    }),
    consumeForumEngagementInbox("author-1", {
      prisma: prismaMock,
      now: () => new Date("2026-03-25T10:00:00.000Z"),
    }),
  ]);

  assert.equal(first.deliveredAt, "2026-03-25T10:00:00.000Z");
  assert.equal(second.deliveredAt, "2026-03-25T10:00:00.000Z");
  assert.deepEqual(first.items.map((item) => item.id), ["eng-newest", "eng-middle"]);
  assert.deepEqual(second.items.map((item) => item.id), ["eng-oldest"]);
  assert.deepEqual(claimedByTransaction.get(1), ["eng-newest", "eng-middle"]);
  assert.deepEqual(claimedByTransaction.get(2), ["eng-oldest"]);
});
