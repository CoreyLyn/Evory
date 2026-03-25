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
  const forumFindManyArgs: Record<string, unknown>[] = [];
  const taskFindManyArgs: Record<string, unknown>[] = [];
  const forumCountArgs: Record<string, unknown>[] = [];
  const taskCountArgs: Record<string, unknown>[] = [];

  const result = await listAgentNotifications("user-1", {
    prisma: {
      agent: {
        findMany: async () => [
          { id: "author-1", name: "Author Agent" },
          { id: "creator-1", name: "Creator Agent" },
        ],
      },
      forumEngagementInboxItem: {
        findMany: async (args: Record<string, unknown>) => {
          forumFindManyArgs.push(args);
          return forumItems;
        },
        count: async (args: { where: Record<string, unknown> }) => {
          forumCountArgs.push(args.where);
          return args.where.type === "LIKE" ? 0 : 1;
        },
        updateMany: async () => ({ count: forumItems.length }),
      },
      taskEngagementInboxItem: {
        findMany: async (args: Record<string, unknown>) => {
          taskFindManyArgs.push(args);
          return taskItems;
        },
        count: async (args: { where: Record<string, unknown> }) => {
          taskCountArgs.push(args.where);
          return args.where.type === "COMPLETED" ? 1 : 0;
        },
        updateMany: async () => ({ count: taskItems.length }),
      },
    },
    now: () => new Date("2026-03-25T10:00:00.000Z"),
  });

  assert.equal(result.hasUnread, true);
  assert.equal(result.replyCount, 1);
  assert.equal(result.completeCount, 1);
  assert.equal(result.likeCount, 0);
  assert.equal(result.claimCount, 0);
  assert.deepEqual(forumFindManyArgs, [
    {
      where: {
        agentId: { in: ["author-1", "creator-1"] },
        viewerReadAt: null,
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        post: true,
        actorAgent: true,
      },
    },
  ]);
  assert.deepEqual(taskFindManyArgs, [
    {
      where: {
        agentId: { in: ["author-1", "creator-1"] },
        viewerReadAt: null,
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        task: true,
        actorAgent: true,
      },
    },
  ]);
  assert.deepEqual(forumCountArgs, [
    {
      agentId: { in: ["author-1", "creator-1"] },
      viewerReadAt: null,
      type: "LIKE",
    },
    {
      agentId: { in: ["author-1", "creator-1"] },
      viewerReadAt: null,
      type: "REPLY",
    },
  ]);
  assert.deepEqual(taskCountArgs, [
    {
      agentId: { in: ["author-1", "creator-1"] },
      viewerReadAt: null,
      type: "CLAIMED",
    },
    {
      agentId: { in: ["author-1", "creator-1"] },
      viewerReadAt: null,
      type: "COMPLETED",
    },
  ]);
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

test("listAgentNotifications respects the compact recent limit without truncating counts", async () => {
  const findManyArgs: Record<string, unknown>[] = [];
  const countArgs: Record<string, unknown>[] = [];

  const result = await listAgentNotifications("user-1", {
    prisma: {
      agent: {
        findMany: async () => [{ id: "author-1", name: "Author Agent" }],
      },
      forumEngagementInboxItem: {
        findMany: async (args: Record<string, unknown>) => {
          findManyArgs.push(args);
          return [
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
          ];
        },
        count: async (args: { where: Record<string, unknown> }) => {
          countArgs.push(args.where);
          return args.where.type === "LIKE" ? 3 : 0;
        },
        updateMany: async () => ({ count: 3 }),
      },
      taskEngagementInboxItem: {
        findMany: async () => [],
        count: async () => 0,
        updateMany: async () => ({ count: 0 }),
      },
    },
    limit: 2,
  });

  assert.equal(result.hasUnread, true);
  assert.equal(result.likeCount, 3);
  assert.equal(result.replyCount, 0);
  assert.equal(result.items.length, 2);
  assert.deepEqual(findManyArgs, [
    {
      where: {
        agentId: { in: ["author-1"] },
        viewerReadAt: null,
      },
      orderBy: { createdAt: "desc" },
      take: 2,
      include: {
        post: true,
        actorAgent: true,
      },
    },
  ]);
  assert.deepEqual(countArgs, [
    {
      agentId: { in: ["author-1"] },
      viewerReadAt: null,
      type: "LIKE",
    },
    {
      agentId: { in: ["author-1"] },
      viewerReadAt: null,
      type: "REPLY",
    },
  ]);
  assert.deepEqual(result.items.map((item) => item.id), [
    "forum-eng-1",
    "forum-eng-2",
  ]);
});

test("markAgentNotificationRead updates task notifications through the task branch", async () => {
  const taskFindManyArgs: Record<string, unknown>[] = [];
  const taskUpdateWhereArgs: Record<string, unknown>[] = [];
  let taskUpdateData: Record<string, unknown> | null = null;

  const write = await markAgentNotificationRead("user-1", "task-eng-1", {
    prisma: {
      agent: {
        findMany: async () => [{ id: "creator-1", name: "Creator Agent" }],
      },
      forumEngagementInboxItem: {
        findMany: async () => [],
        updateMany: async () => ({ count: 0 }),
      },
      taskEngagementInboxItem: {
        findMany: async (args: Record<string, unknown>) => {
          taskFindManyArgs.push(args);
          return [
            {
            id: "task-eng-1",
            agentId: "creator-1",
            taskId: "task-1",
            type: "CLAIMED",
            actorAgentId: "actor-1",
            createdAt: new Date("2026-03-25T09:59:00.000Z"),
            viewerReadAt: null,
            agentDeliveredAt: new Date("2026-03-24T10:00:00.000Z"),
            task: {
              id: "task-1",
              title: "Task title",
            },
            actorAgent: {
              id: "actor-1",
              name: "Task Actor",
              type: "CUSTOM",
            },
          },
        ];
        },
        updateMany: async ({ where, data }) => {
          taskUpdateWhereArgs.push(where);
          taskUpdateData = data;
          return { count: 1 };
        },
      },
    },
    now: () => new Date("2026-03-25T10:00:00.000Z"),
  });

  assert.equal(write?.id, "task-eng-1");
  assert.equal(write?.viewerReadAt, "2026-03-25T10:00:00.000Z");
  assert.equal(write?.agentDeliveredAt, "2026-03-24T10:00:00.000Z");
  assert.deepEqual(taskFindManyArgs, [
    {
      where: {
        id: "task-eng-1",
        agentId: { in: ["creator-1"] },
      },
      include: {
        task: true,
        actorAgent: true,
      },
    },
  ]);
  assert.deepEqual(taskUpdateWhereArgs, [
    {
      id: "task-eng-1",
      agentId: { in: ["creator-1"] },
      viewerReadAt: null,
    },
  ]);
  assert.ok(taskUpdateData?.viewerReadAt instanceof Date);
  assert.equal(Object.hasOwn(taskUpdateData ?? {}, "agentDeliveredAt"), false);
});

test("markAgentNotificationRead updates only viewerReadAt", async () => {
  const forumFindManyArgs: Record<string, unknown>[] = [];
  const forumUpdateWhereArgs: Record<string, unknown>[] = [];
  let viewerReadAt: Date | null = null;
  let agentDeliveredAtSeen: unknown = undefined;

  const write = await markAgentNotificationRead("user-1", "forum-eng-1", {
    prisma: {
      agent: {
        findMany: async () => [{ id: "author-1", name: "Author Agent" }],
      },
      forumEngagementInboxItem: {
        findMany: async (args: Record<string, unknown>) => {
          forumFindManyArgs.push(args);
          return [
          createForumEngagementInboxItemFixture({
            id: "forum-eng-1",
            viewerReadAt: null,
            agentDeliveredAt: new Date("2026-03-24T10:00:00.000Z"),
          }),
        ];
        },
        count: async ({ where }: { where: Record<string, unknown> }) =>
          where.type === "LIKE" ? 0 : 1,
        updateMany: async ({ where, data }) => {
          forumUpdateWhereArgs.push(where);
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
  assert.deepEqual(forumFindManyArgs, [
    {
      where: {
        id: "forum-eng-1",
        agentId: { in: ["author-1"] },
      },
      include: {
        post: true,
        actorAgent: true,
      },
    },
  ]);
  assert.deepEqual(forumUpdateWhereArgs, [
    {
      id: "forum-eng-1",
      agentId: { in: ["author-1"] },
      viewerReadAt: null,
    },
  ]);
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
        count: async ({ where }: { where: Record<string, unknown> }) =>
          where.type === "LIKE" ? 0 : 1,
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
