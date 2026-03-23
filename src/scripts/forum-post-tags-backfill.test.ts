import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  buildForumPostTagBackfillPlan,
  runForumPostTagBackfill,
} from "../../scripts/forum-post-tags-backfill.mjs";

const execFileAsync = promisify(execFile);
const backfillScriptPath = fileURLToPath(
  new URL("../../scripts/forum-post-tags-backfill.mjs", import.meta.url)
);

test("backfill script module can be imported under node --import tsx", async () => {
  await execFileAsync(process.execPath, [
    "--import",
    "tsx",
    "-e",
    `import(${JSON.stringify(backfillScriptPath)})`,
  ]);
});

test("backfill converts legacy manual final tags into overrides instead of skipping the post", async () => {
  const result = await buildForumPostTagBackfillPlan([
    {
      id: "post-manual",
      title: "API deployment",
      content: "Rollout plan",
      category: "technical",
      tags: [
        {
          id: "post-tag-1",
          source: "MANUAL",
          tag: { slug: "api", label: "API", kind: "CORE" },
        },
        {
          id: "post-tag-2",
          source: "MANUAL",
          tag: { slug: "performance", label: "Performance", kind: "CORE" },
        },
      ],
      overrides: [],
    },
  ]);

  assert.equal(result.skippedManual, 0);
  assert.equal(result.convertedLegacyManual, 1);
  assert.equal(result.rebuiltFromOverrides, 0);
  assert.equal(result.operations.length, 1);
  assert.deepEqual(
    result.operations[0].overrideActions.map(
      (item: { action: string; tag: { slug: string } }) => [item.action, item.tag.slug]
    ),
    [
      ["ADD", "performance"],
      ["REMOVE", "deployment"],
      ["LOCK", "api"],
    ]
  );
  assert.deepEqual(
    result.operations[0].tags.map((tag: { slug: string }) => tag.slug),
    ["api", "performance"]
  );
});

test("backfill replays existing overrides when rebuilding final tags", async () => {
  const result = await buildForumPostTagBackfillPlan([
    {
      id: "post-overrides",
      title: "API deployment",
      content: "Rollout plan",
      category: "technical",
      tags: [
        {
          id: "post-tag-3",
          source: "AUTO",
          tag: { slug: "frontend", label: "Frontend", kind: "CORE" },
        },
      ],
      overrides: [
        {
          action: "LOCK",
          tag: { slug: "api", label: "API", kind: "CORE" },
        },
        {
          action: "ADD",
          tag: { slug: "performance", label: "Performance", kind: "CORE" },
        },
        {
          action: "REMOVE",
          tag: { slug: "deployment", label: "Deployment", kind: "CORE" },
        },
      ],
    },
  ]);

  assert.equal(result.skippedManual, 0);
  assert.equal(result.convertedLegacyManual, 0);
  assert.equal(result.rebuiltFromOverrides, 1);
  assert.equal(result.operations.length, 1);
  assert.deepEqual(
    result.operations[0].overrideActions.map(
      (item: { action: string; tag: { slug: string } }) => [item.action, item.tag.slug]
    ),
    [
      ["LOCK", "api"],
      ["ADD", "performance"],
      ["REMOVE", "deployment"],
    ]
  );
  assert.deepEqual(
    result.operations[0].tags.map((tag: { slug: string }) => tag.slug),
    ["api", "performance"]
  );
});

test("backfill builds operations for untagged posts", async () => {
  const result = await buildForumPostTagBackfillPlan([
    {
      id: "post-auto",
      title: "API deployment bugfix",
      content: "Ship a timeout fix",
      category: "technical",
      tags: [],
      overrides: [],
    },
  ]);

  assert.equal(result.operations.length, 1);
  assert.ok(
    result.operations[0].tags.some((tag: { slug: string }) => tag.slug === "api")
  );
  assert.ok(
    result.operations[0].tags.some((tag: { slug: string }) => tag.slug === "deployment")
  );
});

test("runForumPostTagBackfill persists override rows and rebuilt final tags", async () => {
  const forumPostFindManyCalls: Array<Record<string, unknown>> = [];
  const forumTagUpserts: Array<Record<string, unknown>> = [];
  const overrideDeleteManyCalls: Array<Record<string, unknown>> = [];
  const overrideCreateManyCalls: Array<Record<string, unknown>> = [];
  const postTagDeleteManyCalls: Array<Record<string, unknown>> = [];
  const postTagCreateManyCalls: Array<Record<string, unknown>> = [];

  const prismaClient = {
    forumPost: {
      async findMany(args: Record<string, unknown>) {
        forumPostFindManyCalls.push(args);

        if (forumPostFindManyCalls.length === 1) {
          return [
            {
              id: "post-run",
              title: "API deployment",
              content: "Rollout plan",
              category: "technical",
              tags: [
                {
                  source: "MANUAL",
                  tag: { slug: "api", label: "API", kind: "CORE" },
                },
                {
                  source: "MANUAL",
                  tag: { slug: "performance", label: "Performance", kind: "CORE" },
                },
              ],
              overrides: [],
            },
          ];
        }

        return [];
      },
    },
    forumTag: {
      async upsert(args: Record<string, unknown>) {
        forumTagUpserts.push(args);
        const slug = (args.where as { slug: string }).slug;
        return {
          id: `tag-${slug}`,
          slug,
        };
      },
    },
    forumPostTagOverride: {
      async deleteMany(args: Record<string, unknown>) {
        overrideDeleteManyCalls.push(args);
        return { count: 0 };
      },
      async createMany(args: Record<string, unknown>) {
        overrideCreateManyCalls.push(args);
        return { count: (args.data as unknown[]).length };
      },
    },
    forumPostTag: {
      async deleteMany(args: Record<string, unknown>) {
        postTagDeleteManyCalls.push(args);
        return { count: 0 };
      },
      async createMany(args: Record<string, unknown>) {
        postTagCreateManyCalls.push(args);
        return { count: (args.data as unknown[]).length };
      },
    },
  };
  const logger = {
    info() {},
  };

  const summary = await runForumPostTagBackfill({
    prismaClient,
    batchSize: 1,
    logger,
  });

  assert.deepEqual(summary, {
    scanned: 1,
    updated: 1,
    convertedLegacyManual: 1,
    rebuiltFromOverrides: 0,
    emptyTagPosts: 0,
    dryRun: false,
  });
  assert.equal(forumPostFindManyCalls.length, 2);
  assert.deepEqual(overrideDeleteManyCalls, [{ where: { postId: "post-run" } }]);
  assert.deepEqual(postTagDeleteManyCalls, [{ where: { postId: "post-run" } }]);
  assert.equal(overrideCreateManyCalls.length, 1);
  assert.deepEqual(
    (overrideCreateManyCalls[0].data as Array<{
      action: string;
      postId: string;
      tagId: string;
    }>).map((row) => [row.action, row.postId, row.tagId]),
    [
      ["ADD", "post-run", "tag-performance"],
      ["REMOVE", "post-run", "tag-deployment"],
      ["LOCK", "post-run", "tag-api"],
    ]
  );
  assert.equal(postTagCreateManyCalls.length, 1);
  assert.deepEqual(
    (postTagCreateManyCalls[0].data as Array<{
      postId: string;
      source: string;
      tagId: string;
    }>).map((row) => [row.postId, row.tagId, row.source]),
    [
      ["post-run", "tag-api", "MANUAL"],
      ["post-run", "tag-performance", "MANUAL"],
    ]
  );
  assert.deepEqual(
    forumTagUpserts.map((args) => (args.where as { slug: string }).slug),
    ["api", "deployment", "performance", "api", "deployment", "performance"]
  );
});
