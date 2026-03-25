import assert from "node:assert/strict";
import test from "node:test";

import { consumeAgentConnectEngagements } from "./agent-connect-engagements";
import { createForumEngagementInboxItemFixture, createTaskEngagementInboxItemFixture } from "@/test/factories";

test("consumeAgentConnectEngagements returns mixed forum and task items with separate counts", async () => {
  const readAtWrites: Date[] = [];
  const deliveredAt = new Date("2026-03-25T10:00:00.000Z");
  const forumItems = [
    createForumEngagementInboxItemFixture({
      id: "forum-like-1",
      type: "LIKE",
      createdAt: new Date("2026-03-25T09:59:00.000Z"),
    }),
    createForumEngagementInboxItemFixture({
      id: "forum-reply-1",
      type: "REPLY",
      createdAt: new Date("2026-03-25T09:58:00.000Z"),
      replyId: "reply-1",
      replyPreview: "Useful reply",
    }),
  ];
  const taskItems = [
    createTaskEngagementInboxItemFixture({
      id: "task-complete-1",
      type: "COMPLETED",
      createdAt: new Date("2026-03-25T09:57:00.000Z"),
    }),
    createTaskEngagementInboxItemFixture({
      id: "task-claim-1",
      type: "CLAIMED",
      createdAt: new Date("2026-03-25T09:56:00.000Z"),
    }),
  ];

  const summary = await consumeAgentConnectEngagements("author-1", {
    now: () => deliveredAt,
    prisma: {
      $transaction: async (callback) =>
        callback({
          forumEngagementInboxItem: {
            findMany: async () => forumItems,
            updateMany: async ({ data }) => {
              readAtWrites.push(data.readAt);
              return { count: forumItems.length };
            },
          },
          taskEngagementInboxItem: {
            findMany: async () => taskItems,
            updateMany: async ({ data }) => {
              readAtWrites.push(data.readAt);
              return { count: taskItems.length };
            },
          },
        }),
    },
  });

  assert.equal(summary.deliveredAt, deliveredAt.toISOString());
  assert.equal(summary.forumLikeCount, 1);
  assert.equal(summary.forumReplyCount, 1);
  assert.equal(summary.taskClaimCount, 1);
  assert.equal(summary.taskCompleteCount, 1);
  assert.deepEqual(
    summary.items.map((item) => ({
      id: item.id,
      domain: item.domain,
      type: item.type,
    })),
    [
      { id: "forum-like-1", domain: "FORUM", type: "LIKE" },
      { id: "forum-reply-1", domain: "FORUM", type: "REPLY" },
      { id: "task-complete-1", domain: "TASK", type: "COMPLETED" },
      { id: "task-claim-1", domain: "TASK", type: "CLAIMED" },
    ]
  );
  assert.deepEqual(
    readAtWrites.map((value) => value.toISOString()),
    [deliveredAt.toISOString(), deliveredAt.toISOString()]
  );
  assert.equal(summary.items[1]?.domain, "FORUM");
  if (summary.items[1]?.domain === "FORUM") {
    assert.equal(summary.items[1].reply?.content, "Useful reply");
  }
  assert.equal(summary.items[2]?.domain, "TASK");
  if (summary.items[2]?.domain === "TASK") {
    assert.equal(summary.items[2].task.title, taskItems[0]?.task.title);
  }
});

test("consumeAgentConnectEngagements returns empty when either inbox cannot claim its full unread set", async () => {
  const deliveredAt = new Date("2026-03-25T10:00:00.000Z");
  const forumItems = [
    createForumEngagementInboxItemFixture({
      id: "forum-reply-1",
      type: "REPLY",
      createdAt: new Date("2026-03-25T09:58:00.000Z"),
    }),
  ];
  const taskItems = [
    createTaskEngagementInboxItemFixture({
      id: "task-claim-1",
      type: "CLAIMED",
      createdAt: new Date("2026-03-25T09:56:00.000Z"),
    }),
  ];

  const summary = await consumeAgentConnectEngagements("author-1", {
    now: () => deliveredAt,
    prisma: {
      $transaction: async (callback) =>
        callback({
          forumEngagementInboxItem: {
            findMany: async () => forumItems,
            updateMany: async () => ({ count: forumItems.length }),
          },
          taskEngagementInboxItem: {
            findMany: async () => taskItems,
            updateMany: async () => ({ count: 0 }),
          },
        }),
    },
  });

  assert.deepEqual(summary, {
    deliveredAt: deliveredAt.toISOString(),
    forumLikeCount: 0,
    forumReplyCount: 0,
    taskClaimCount: 0,
    taskCompleteCount: 0,
    items: [],
  });
});
