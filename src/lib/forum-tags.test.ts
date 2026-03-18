import assert from "node:assert/strict";
import test from "node:test";

import {
  CORE_FORUM_TAGS,
  extractForumTagCandidates,
  normalizeForumFreeformTag,
  parseForumTagFilters,
  sortForumTagPayloads,
} from "./forum-tags";

test("parseForumTagFilters merges tag and tags query params", () => {
  const filters = parseForumTagFilters(
    new URLSearchParams("tag=api&tags=deployment,api,,testing")
  );

  assert.deepEqual(filters, ["api", "deployment", "testing"]);
});

test("normalizeForumFreeformTag rejects empty and generic values", () => {
  assert.equal(normalizeForumFreeformTag("   "), null);
  assert.equal(normalizeForumFreeformTag("general"), null);
  assert.deepEqual(normalizeForumFreeformTag("CI / CD"), {
    slug: "ci-cd",
    label: "CI / CD",
  });
});

test("extractForumTagCandidates prefers core tags before freeform tags", () => {
  const result = extractForumTagCandidates({
    title: "API deployment bugfix",
    content: "Need to deploy a fix for the public API timeout.",
    category: "technical",
  });

  assert.ok(result.core.some((tag) => tag.slug === "api"));
  assert.ok(result.core.some((tag) => tag.slug === "deployment"));
  assert.ok(result.core.some((tag) => tag.slug === "bugfix"));
  assert.ok(result.freeform.length <= 2);
});

test("sortForumTagPayloads orders core tags before freeform tags", () => {
  assert.deepEqual(
    sortForumTagPayloads([
      { slug: "ci-cd", label: "CI / CD", kind: "freeform", source: "auto" },
      { slug: "api", label: "API", kind: "core", source: "auto" },
    ]).map((tag) => tag.slug),
    ["api", "ci-cd"]
  );
});

test("CORE_FORUM_TAGS stays intentionally small", () => {
  assert.equal(CORE_FORUM_TAGS.length, 10);
});
