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

test("extractForumTagCandidates matches Chinese API + bugfix phrases", () => {
  const result = extractForumTagCandidates({
    title: "修复接口超时问题",
    content: "这个报错出现在 API 网关层。",
    category: "technical",
  });

  assert.ok(result.core.some((tag) => tag.slug === "api"));
  assert.ok(result.core.some((tag) => tag.slug === "bugfix"));
});

test("extractForumTagCandidates matches Chinese database + performance phrases", () => {
  const result = extractForumTagCandidates({
    title: "优化数据库查询性能",
    content: "当前 SQL 查询太慢。",
    category: "technical",
  });

  assert.ok(result.core.some((tag) => tag.slug === "database"));
  assert.ok(result.core.some((tag) => tag.slug === "performance"));
});

test("extractForumTagCandidates matches mixed-script API gateway text", () => {
  const result = extractForumTagCandidates({
    title: "修复API网关超时",
    content: "请求在网关层失败。",
    category: "technical",
  });

  assert.ok(result.core.some((tag) => tag.slug === "api"));
});

test("extractForumTagCandidates matches mixed-script SQL query text", () => {
  const result = extractForumTagCandidates({
    title: "优化SQL查询性能",
    content: "当前查询太慢。",
    category: "technical",
  });

  assert.ok(result.core.some((tag) => tag.slug === "database"));
});

test("extractForumTagCandidates does not infer frontend from user experience", () => {
  const result = extractForumTagCandidates({
    title: "Improve user experience",
    content: "Make the settings flow easier to use.",
    category: "discussion",
  });

  assert.ok(result.core.some((tag) => tag.slug === "ux"));
  assert.ok(result.core.every((tag) => tag.slug !== "frontend"));
});

test("extractForumTagCandidates does not infer bugfix from prefix", () => {
  const result = extractForumTagCandidates({
    title: "Prefix rule guidance",
    content: "Document prefix behavior for commands.",
    category: "discussion",
  });

  assert.ok(result.core.every((tag) => tag.slug !== "bugfix"));
});

test("extractForumTagCandidates does not infer bugfix from generic Chinese problem text", () => {
  const result = extractForumTagCandidates({
    title: "数据库设计问题讨论",
    content: "想讨论表结构和范式。",
    category: "discussion",
  });

  assert.ok(result.core.every((tag) => tag.slug !== "bugfix"));
});

test("extractForumTagCandidates does not infer frontend from reactive", () => {
  const result = extractForumTagCandidates({
    title: "Reactive stream notes",
    content: "Observables for state updates.",
    category: "discussion",
  });

  assert.ok(result.core.every((tag) => tag.slug !== "frontend"));
});

test("extractForumTagCandidates maps Chinese suggested tags through core aliases", () => {
  const result = extractForumTagCandidates({
    title: "Team update",
    content: "Sharing notes",
    category: "discussion",
    suggestedTags: ["接口", "修复", "数据库"],
  });

  assert.ok(result.core.some((tag) => tag.slug === "api"));
  assert.ok(result.core.some((tag) => tag.slug === "bugfix"));
  assert.ok(result.core.some((tag) => tag.slug === "database"));
  assert.ok(result.freeform.every((tag) => !["接口", "修复", "数据库"].includes(tag.label)));
});

test("normalizeForumFreeformTag preserves Chinese labels and slugs", () => {
  assert.deepEqual(normalizeForumFreeformTag("缓存层"), {
    slug: "缓存层",
    label: "缓存层",
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

test("extractForumTagCandidates merges normalized suggested tags and rejects sentence-like suggestions", () => {
  const result = extractForumTagCandidates({
    title: "Team update",
    content: "Sharing notes",
    category: "discussion",
    suggestedTags: [
      "API",
      "release prep",
      "When an agent posts a thread without punctuation the extractor keeps the whole sentence",
    ],
  });

  assert.ok(result.core.some((tag) => tag.slug === "api"));
  assert.ok(result.freeform.some((tag) => tag.slug === "release-prep"));
  assert.ok(
    result.freeform.every((tag) => !tag.label.includes("extractor keeps the whole sentence"))
  );
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
