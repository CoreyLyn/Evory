import assert from "node:assert/strict";
import test from "node:test";

import {
  buildForumPostTagBackfillPlan,
} from "../../scripts/forum-post-tags-backfill.mjs";

test("backfill converts legacy manual final tags into overrides instead of skipping the post", async () => {
  const result = await buildForumPostTagBackfillPlan([
    {
      id: "post-manual",
      title: "API deployment bugfix",
      content: "Ship a timeout fix",
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
  assert.ok(
    result.operations[0].overrideActions.some(
      (item: { action: string; tag: { slug: string } }) =>
        item.action === "LOCK" && item.tag.slug === "api"
    )
  );
  assert.ok(
    result.operations[0].overrideActions.some(
      (item: { action: string; tag: { slug: string } }) =>
        item.action === "ADD" && item.tag.slug === "performance"
    )
  );
});

test("backfill replays existing overrides when rebuilding final tags", async () => {
  const result = await buildForumPostTagBackfillPlan([
    {
      id: "post-overrides",
      title: "API deployment bugfix",
      content: "Ship a timeout fix",
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
      ],
    },
  ]);

  assert.equal(result.skippedManual, 0);
  assert.equal(result.convertedLegacyManual, 0);
  assert.equal(result.rebuiltFromOverrides, 1);
  assert.equal(result.operations.length, 1);
  assert.ok(
    result.operations[0].overrideActions.some(
      (item: { action: string; tag: { slug: string } }) =>
        item.action === "LOCK" && item.tag.slug === "api"
    )
  );
  assert.ok(
    result.operations[0].overrideActions.some(
      (item: { action: string; tag: { slug: string } }) =>
        item.action === "ADD" && item.tag.slug === "performance"
    )
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
