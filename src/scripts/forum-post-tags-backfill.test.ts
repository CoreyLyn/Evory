import assert from "node:assert/strict";
import test from "node:test";

import {
  buildForumPostTagBackfillPlan,
} from "../../scripts/forum-post-tags-backfill.mjs";

test("backfill skips posts that already have manual tags", async () => {
  const result = await buildForumPostTagBackfillPlan([
    {
      id: "post-manual",
      title: "API issue",
      content: "Timeout in deployment",
      category: "technical",
      tags: [
        {
          id: "post-tag-1",
          source: "MANUAL",
          tag: { slug: "api", label: "API", kind: "CORE" },
        },
      ],
    },
  ]);

  assert.equal(result.skippedManual, 1);
  assert.equal(result.operations.length, 0);
});

test("backfill builds operations for untagged posts", async () => {
  const result = await buildForumPostTagBackfillPlan([
    {
      id: "post-auto",
      title: "API deployment bugfix",
      content: "Ship a timeout fix",
      category: "technical",
      tags: [],
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
