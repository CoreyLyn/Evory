import assert from "node:assert/strict";
import test from "node:test";

import {
  createForumEngagementInboxItemFixture,
  createTaskEngagementInboxItemFixture,
} from "@/test/factories";

import {
  listAgentNotifications,
  markAgentNotificationRead,
} from "./agent-notifications";

test("listAgentNotifications returns unread forum and task items ordered newest first", async () => {
  const deliveredAt = new Date("2026-03-25T10:00:00.000Z");
  const forumItems = [
    createForumEngagementInboxItemFixture({
      id: "forum-eng-1",
      type: "REPLY",
      createdAt: new Date("2026-03-25T09:59:00.000Z"),
      replyId: "reply-1",
      replyPreview: "Useful reply",
      post: {
        id: "post-1",
        title: "Forum post",
      },
      actorAgent: {
        id: "actor-1",
        name: "Forum Actor",
        type: "CODEX",
      },
    }),
  ];
  const taskItems = [
    createTaskEngagementInboxItemFixture({
      id: "task-eng-1",
      type: "COMPLETED",
      createdAt: new Date("2026-03-25T09:58:00.000Z"),
      task: {
        id: "task-1",
        title: "Task title",
      },
      actorAgent: {
        id: "actor-2",
        name: "Task Actor",
        type: "CUSTOM",
      },
    }),
  ];

  const result = await listAgentNotifications("user-1", {
    prisma: {
      agent: {
        findMany: async () => [
          { id: "author-1", name: "Author Agent" },
          { id: "creator-1", name: "Creator Agent" },
        ],
      },
      forumEngagementInboxItem: {
        findMany: async () => forumItems,
        updateMany: async () => ({ count: forumItems.length }),
      },
      taskEngagementInboxItem: {
        findMany: async () => taskItems,
        updateMany: async () => ({ count: taskItems.length }),
      },
    },
    now: () => deliveredAt,
  });

  assert.equal(result.hasUnread, true);
  assert.equal(result.replyCount, 1);
  assert.equal(result.completeCount, 1);
  assert.equal(result.likeCount, 0);
  assert.equal(result.claimCount, 0);
  assert.deepEqual(
    result.items.map((item) => item.domain),
    ["FORUM", "TASK"]
  );
  assert.equal(result.items[0]?.destinationHref, "/forum/post-1");
  assert.equal(result.items[1]?.destinationHref, "/tasks/task-1");
  assert.equal(result.items[0]?.ownerAgent.name, "Author Agent");
  assert.equal(result.items[1]?.ownerAgent.name, "Creator Agent");
  assert.equal(result.items[0]?.reply?.content, "Useful reply");
});

test("listAgentNotifications respects the compact recent limit", async () => {
  const result = await listAgentNotifications("user-1", {
    prisma: {
      agent: {
        findMany: async () => [{ id: "author-1", name: "Author Agent" }],
      },
      forumEngagementInboxItem: {
        findMany: async () => [
          createForumEngagementInboxItemFixture({
            id: "forum-eng-1",
            type: "LIKE",
            createdAt: new Date("2026-03-25T10:00:00.000Z"),
          }),
          createForumEngagementInboxItemFixture({
            id: "forum-eng-2",
            type: "LIKE",
            createdAt: new Date("2026-03-25T09:59:00.000Z"),
          }),
          createForumEngagementInboxItemFixture({
            id: "forum-eng-3",
            type: "LIKE",
            createdAt: new Date("2026-03-25T09:58:00.000Z"),
          }),
        ],
        updateMany: async () => ({ count: 3 }),
      },
      taskEngagementInboxItem: {
        findMany: async () => [],
        updateMany: async () => ({ count: 0 }),
      },
    },
    limit: 2,
  });

  assert.equal(result.hasUnread, true);
  assert.equal(result.likeCount, 2);
  assert.equal(result.items.length, 2);
  assert.deepEqual(result.items.map((item) => item.id), [
    "forum-eng-1",
    "forum-eng-2",
  ]);
});

test("markAgentNotificationRead updates only viewerReadAt", async () => {
  let viewerReadAt: Date | null = null;
  let agentDeliveredAtSeen: unknown = undefined;

  const write = await markAgentNotificationRead("user-1", "forum-eng-1", {
    prisma: {
      agent: {
        findMany: async () => [{ id: "author-1", name: "Author Agent" }],
      },
      forumEngagementInboxItem: {
        findMany: async () => [
          createForumEngagementInboxItemFixture({
            id: "forum-eng-1",
            viewerReadAt: null,
            agentDeliveredAt: new Date("2026-03-24T10:00:00.000Z"),
          }),
        ],
        updateMany: async ({ data }) => {
          viewerReadAt = data.viewerReadAt;
          agentDeliveredAtSeen = Object.hasOwn(data, "agentDeliveredAt")
            ? (data as Record<string, unknown>).agentDeliveredAt
            : undefined;
          return { count: 1 };
        },
      },
      taskEngagementInboxItem: {
        findMany: async () => [],
        updateMany: async () => ({ count: 0 }),
      },
    },
    now: () => new Date("2026-03-25T10:00:00.000Z"),
  });

  assert.equal(write?.viewerReadAt, "2026-03-25T10:00:00.000Z");
  assert.equal(write?.agentDeliveredAt, "2026-03-24T10:00:00.000Z");
  assert.equal(viewerReadAt?.toISOString(), "2026-03-25T10:00:00.000Z");
  assert.equal(agentDeliveredAtSeen, undefined);
});

test("markAgentNotificationRead returns an already-read owned item instead of 404", async () => {
  const write = await markAgentNotificationRead("user-1", "forum-eng-1", {
    prisma: {
      agent: {
        findMany: async () => [{ id: "author-1", name: "Author Agent" }],
      },
      forumEngagementInboxItem: {
        findMany: async () => [
          createForumEngagementInboxItemFixture({
            id: "forum-eng-1",
            viewerReadAt: new Date("2026-03-24T09:59:00.000Z"),
            agentDeliveredAt: new Date("2026-03-24T10:00:00.000Z"),
          }),
        ],
        updateMany: async () => ({ count: 0 }),
      },
      taskEngagementInboxItem: {
        findMany: async () => [],
        updateMany: async () => ({ count: 0 }),
      },
    },
    now: () => new Date("2026-03-25T10:00:00.000Z"),
  });

  assert.deepEqual(write, {
    id: "forum-eng-1",
    viewerReadAt: "2026-03-24T09:59:00.000Z",
    agentDeliveredAt: "2026-03-24T10:00:00.000Z",
  });
});
