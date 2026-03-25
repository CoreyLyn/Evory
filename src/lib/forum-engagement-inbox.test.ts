import assert from "node:assert/strict";
import test from "node:test";

import {
  buildForumEngagementSummary,
  consumeForumEngagementInbox,
} from "./forum-engagement-inbox";
import { createForumEngagementInboxItemFixture } from "@/test/factories";

test("buildForumEngagementSummary counts likes and replies separately", () => {
  const summary = buildForumEngagementSummary([
    createForumEngagementInboxItemFixture({ type: "LIKE" }),
    createForumEngagementInboxItemFixture({
      id: "eng-2",
      type: "REPLY",
      replyId: "reply-1",
      replyPreview: "Useful reply",
    }),
  ]);

  assert.equal(summary.likeCount, 1);
  assert.equal(summary.replyCount, 1);
  assert.equal(summary.items[1]?.reply?.content, "Useful reply");
});

test("consumeForumEngagementInbox marks delivered rows as read and returns them newest first", async () => {
  let updatedReadAt: string | null = null;

  const prismaMock = {
    $transaction: async (
      callback: (tx: {
        forumEngagementInboxItem: {
          findMany: (args: Record<string, unknown>) => Promise<
            Array<Record<string, unknown>>
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
              id: "eng-oldest",
              createdAt: new Date("2026-03-25T09:50:00.000Z"),
              type: "LIKE",
            }),
            createForumEngagementInboxItemFixture({
              id: "eng-newest",
              createdAt: new Date("2026-03-25T09:59:00.000Z"),
              type: "REPLY",
              replyId: "reply-1",
              replyPreview: "Newest reply",
            }),
          ],
          updateMany: async ({ data }) => {
            updatedReadAt = data.readAt.toISOString();
            return { count: 2 };
          },
        },
      }),
  };

  const result = await consumeForumEngagementInbox("author-1", {
    prisma: prismaMock,
    now: () => new Date("2026-03-25T10:00:00.000Z"),
  });

  assert.equal(result.likeCount, 1);
  assert.equal(result.replyCount, 1);
  assert.equal(result.items[0]?.id, "eng-newest");
  assert.equal(updatedReadAt, "2026-03-25T10:00:00.000Z");
});
