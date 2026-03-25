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

test("consumeForumEngagementInbox only returns rows for the caller that claimed them", async () => {
  const claimedRows = [
    createForumEngagementInboxItemFixture({
      id: "eng-newest",
      createdAt: new Date("2026-03-25T09:59:00.000Z"),
      type: "REPLY",
      replyId: "reply-1",
      replyPreview: "Newest reply",
    }),
    createForumEngagementInboxItemFixture({
      id: "eng-oldest",
      createdAt: new Date("2026-03-25T09:50:00.000Z"),
      type: "LIKE",
    }),
  ];

  let releaseInitialRead: (() => void) | null = null;
  const initialReadGate = new Promise<void>((resolve) => {
    releaseInitialRead = resolve;
  });
  let initialReadCount = 0;
  let updateCount = 0;
  let claimedReadAt: Date | null = null;

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
          findMany: async (args): Promise<ForumEngagementInboxRecord[]> => {
            const where = args.where as {
              readAt?: Date | null;
              id?: { in?: string[] };
            };

            if (where.readAt === null) {
              initialReadCount += 1;
              if (initialReadCount === 2) {
                releaseInitialRead?.();
              }
              await initialReadGate;
              return claimedRows;
            }

            if (where.readAt instanceof Date) {
              const ids = where.id?.in ?? [];
              return claimedRows.filter(
                (item) =>
                  ids.includes(item.id) &&
                  item.readAt instanceof Date &&
                  item.readAt.getTime() === where.readAt.getTime()
              );
            }

            return [];
          },
          updateMany: async ({ data }) => {
            updateCount += 1;
            if (updateCount === 1) {
              claimedReadAt = data.readAt;
              for (const row of claimedRows) {
                row.readAt = data.readAt;
              }
              return { count: claimedRows.length };
            }

            return { count: 0 };
          },
        },
      }),
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

  const results = [first, second];
  const nonEmpty = results.filter((result) => result.items.length > 0);
  const empty = results.filter((result) => result.items.length === 0);

  assert.equal(nonEmpty.length, 1);
  assert.equal(empty.length, 1);
  assert.equal(nonEmpty[0]?.deliveredAt, "2026-03-25T10:00:00.000Z");
  assert.equal(claimedReadAt?.toISOString(), "2026-03-25T10:00:00.000Z");
  assert.equal(nonEmpty[0]?.items[0]?.id, "eng-newest");
  assert.equal(nonEmpty[0]?.items[1]?.id, "eng-oldest");
});
