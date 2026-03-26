import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTaskEngagementSummary,
  consumeTaskEngagementInbox,
  type TaskEngagementInboxRecord,
} from "./task-engagement-inbox";

test("buildTaskEngagementSummary counts claimed and completed items separately", () => {
  const summary = buildTaskEngagementSummary([
    {
      id: "task-eng-1",
      type: "CLAIMED",
      createdAt: new Date("2026-03-25T11:59:00.000Z"),
      task: {
        id: "task-1",
        title: "Task one",
      },
      actorAgent: {
        id: "actor-1",
        name: "Worker",
        type: "CODEX",
      },
    },
    {
      id: "task-eng-2",
      type: "COMPLETED",
      createdAt: new Date("2026-03-25T12:00:00.000Z"),
      task: {
        id: "task-2",
        title: "Task two",
      },
      actorAgent: {
        id: "actor-2",
        name: "Finisher",
        type: "CUSTOM",
      },
    },
  ] satisfies TaskEngagementInboxRecord[]);

  assert.equal(summary.claimCount, 1);
  assert.equal(summary.completeCount, 1);
  assert.equal(summary.items[0]?.type, "COMPLETED");
});

test("consumeTaskEngagementInbox marks delivered rows as agent delivered", async () => {
  let claimedAgentDeliveredAt: string | null = null;
  const unread: TaskEngagementInboxRecord[] = [
    {
      id: "task-eng-1",
      type: "CLAIMED",
      createdAt: new Date("2026-03-25T11:59:00.000Z"),
      task: {
        id: "task-1",
        title: "Task one",
      },
      actorAgent: {
        id: "actor-1",
        name: "Worker",
        type: "CODEX",
      },
    },
    {
      id: "task-eng-2",
      type: "COMPLETED",
      createdAt: new Date("2026-03-25T12:00:00.000Z"),
      task: {
        id: "task-2",
        title: "Task two",
      },
      actorAgent: {
        id: "actor-2",
        name: "Finisher",
        type: "CUSTOM",
      },
    },
  ];

  const result = await consumeTaskEngagementInbox("publisher-1", {
    prisma: {
      $transaction: async (callback) =>
        callback({
          taskEngagementInboxItem: {
            findMany: async () => unread,
            updateMany: async ({ data }) => {
              claimedAgentDeliveredAt = (data.agentDeliveredAt as Date).toISOString();
              return { count: unread.length };
            },
          },
        }),
    },
    now: () => new Date("2026-03-25T12:00:00.000Z"),
  });

  assert.equal(result.claimCount, 1);
  assert.equal(result.completeCount, 1);
  assert.equal(claimedAgentDeliveredAt, "2026-03-25T12:00:00.000Z");
});

test("consumeTaskEngagementInbox still consumes items that were read in the web viewer", async () => {
  const unread = [
    {
      id: "task-eng-web-read",
      type: "CLAIMED",
      createdAt: new Date("2026-03-25T11:59:00.000Z"),
      task: {
        id: "task-1",
        title: "Task one",
      },
      actorAgent: {
        id: "actor-1",
        name: "Worker",
        type: "CODEX",
      },
      viewerReadAt: new Date("2026-03-25T11:58:30.000Z"),
      agentDeliveredAt: null,
    },
  ] as unknown as TaskEngagementInboxRecord[];

  const result = await consumeTaskEngagementInbox("publisher-1", {
    prisma: {
      $transaction: async (callback) =>
        callback({
          taskEngagementInboxItem: {
            findMany: async () => unread,
            updateMany: async () => ({ count: unread.length }),
          },
        }),
    },
    now: () => new Date("2026-03-25T12:00:00.000Z"),
  });

  assert.equal(result.claimCount, 1);
  assert.equal(result.completeCount, 0);
  assert.deepEqual(result.items.map((item) => item.id), ["task-eng-web-read"]);
});
