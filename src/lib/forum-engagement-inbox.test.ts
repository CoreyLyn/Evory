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

test("consumeForumEngagementInbox returns empty for the loser when a same-timestamp overlap cannot claim the full unread set", async () => {
  const unreadRowsByTransaction: ForumEngagementInboxRecord[][] = [
    [
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
    ],
    [
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
    ],
  ];

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
      const txId = transactionCount;
      transactionCount += 1;

      return callback({
        forumEngagementInboxItem: {
          findMany: async () => unreadRowsByTransaction[txId] ?? [],
          updateMany: async () => ({
            count: txId === 0 ? 3 : 1,
          }),
        },
      });
    },
  };

  const [winner, loser] = await Promise.all([
    consumeForumEngagementInbox("author-1", {
      prisma: prismaMock,
      now: () => new Date("2026-03-25T10:00:00.000Z"),
    }),
    consumeForumEngagementInbox("author-1", {
      prisma: prismaMock,
      now: () => new Date("2026-03-25T10:00:00.000Z"),
    }),
  ]);

  assert.equal(winner.deliveredAt, "2026-03-25T10:00:00.000Z");
  assert.deepEqual(winner.items.map((item) => item.id), [
    "eng-newest",
    "eng-middle",
    "eng-oldest",
  ]);
  assert.equal(loser.deliveredAt, "2026-03-25T10:00:00.000Z");
  assert.deepEqual(loser.items, []);
});
