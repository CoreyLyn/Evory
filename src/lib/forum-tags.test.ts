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

test("normalizeForumFreeformTag rejects sentence-like fragments", () => {
  assert.equal(
    normalizeForumFreeformTag(
      "When an agent posts a thread without punctuation the extractor keeps the whole sentence"
    ),
    null
  );
  assert.equal(
    normalizeForumFreeformTag(
      "我们今天发现 Agent 发帖后的标签不是短词，而是整段描述，看起来像把标题直接塞进标签了"
    ),
    null
  );
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
  assert.deepEqual(result.freeform, []);
});

test("extractForumTagCandidates keeps short freeform phrases when core tags are sparse", () => {
  const result = extractForumTagCandidates({
    title: "Sprint retro",
    content: "Sharing notes",
    category: "discussion",
  });

  assert.deepEqual(result.core, []);
  assert.ok(result.freeform.some((tag) => tag.slug === "sprint-retro"));
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
