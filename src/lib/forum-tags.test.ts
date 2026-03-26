import assert from "node:assert/strict";
import test from "node:test";

import * as forumTags from "./forum-tags";
import {
  CORE_FORUM_TAGS,
  buildForumPostTagPayloads,
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

test("extractForumTagCandidates matches released deployment text", () => {
  const result = extractForumTagCandidates({
    title: "Released new CLI flow",
    content: "The CLI flow is now live.",
    category: "technical",
  });

  assert.ok(result.core.some((tag) => tag.slug === "deployment"));
});

test("extractForumTagCandidates matches fixed bugfix text", () => {
  const result = extractForumTagCandidates({
    title: "Fixed flaky suite",
    content: "The failing tests now pass.",
    category: "technical",
  });

  assert.ok(result.core.some((tag) => tag.slug === "bugfix"));
});

test("extractForumTagCandidates matches permissions security text", () => {
  const result = extractForumTagCandidates({
    title: "Permissions model update",
    content: "Access control rules were revised.",
    category: "technical",
  });

  assert.ok(result.core.some((tag) => tag.slug === "security"));
});

test("extractForumTagCandidates matches tests testing text", () => {
  const result = extractForumTagCandidates({
    title: "Tests are flaky",
    content: "The suite needs attention.",
    category: "technical",
  });

  assert.ok(result.core.some((tag) => tag.slug === "testing"));
});

test("extractForumTagCandidates matches optimized performance text", () => {
  const result = extractForumTagCandidates({
    title: "Optimized query path",
    content: "The new plan is faster.",
    category: "technical",
  });

  assert.ok(result.core.some((tag) => tag.slug === "performance"));
});

test("extractForumTagCandidates does not leak freeform for HTTP API extracted text", () => {
  const result = extractForumTagCandidates({
    title: "HTTP API",
    content: "Gateway route",
    category: "technical",
  });

  assert.ok(result.core.some((tag) => tag.slug === "api"));
  assert.ok(result.freeform.every((tag) => tag.slug !== "http-api"));
});

test("extractForumTagCandidates does not leak freeform for SQL query extracted text", () => {
  const result = extractForumTagCandidates({
    title: "SQL query",
    content: "Database path",
    category: "technical",
  });

  assert.ok(result.core.some((tag) => tag.slug === "database"));
  assert.ok(result.freeform.every((tag) => tag.slug !== "sql-query"));
});

test("extractForumTagCandidates does not leak freeform for user experience extracted text", () => {
  const result = extractForumTagCandidates({
    title: "User experience",
    content: "Design notes",
    category: "discussion",
  });

  assert.ok(result.core.some((tag) => tag.slug === "ux"));
  assert.ok(result.freeform.every((tag) => tag.slug !== "user-experience"));
});

test("extractForumTagCandidates does not leak freeform for release prep extracted text", () => {
  const result = extractForumTagCandidates({
    title: "Release prep",
    content: "Ship checklist",
    category: "technical",
  });

  assert.ok(result.core.some((tag) => tag.slug === "deployment"));
  assert.ok(result.freeform.every((tag) => tag.slug !== "release-prep"));
});

test("extractForumTagCandidates does not leak freeform for CI/CD extracted text", () => {
  const result = extractForumTagCandidates({
    title: "CI/CD",
    content: "Pipeline work",
    category: "technical",
  });

  assert.ok(result.core.some((tag) => tag.slug === "deployment"));
  assert.ok(result.freeform.every((tag) => tag.slug !== "ci"));
  assert.ok(result.freeform.every((tag) => tag.slug !== "ci-cd"));
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

test("extractForumTagCandidates matches suggested user experience phrase case-insensitively", () => {
  const result = extractForumTagCandidates({
    title: "Team update",
    content: "Sharing notes",
    category: "discussion",
    suggestedTags: ["User Experience"],
  });

  assert.ok(result.core.some((tag) => tag.slug === "ux"));
  assert.ok(result.freeform.every((tag) => tag.label !== "User Experience"));
});

test("extractForumTagCandidates matches suggested HTTP API phrase case-insensitively", () => {
  const result = extractForumTagCandidates({
    title: "Team update",
    content: "Sharing notes",
    category: "discussion",
    suggestedTags: ["HTTP API"],
  });

  assert.ok(result.core.some((tag) => tag.slug === "api"));
  assert.ok(result.freeform.every((tag) => tag.label !== "HTTP API"));
});

test("extractForumTagCandidates matches suggested API gateway phrase", () => {
  const result = extractForumTagCandidates({
    title: "Team update",
    content: "Sharing notes",
    category: "discussion",
    suggestedTags: ["API gateway"],
  });

  assert.ok(result.core.some((tag) => tag.slug === "api"));
  assert.ok(result.freeform.every((tag) => tag.slug !== "api-gateway"));
});

test("extractForumTagCandidates matches suggested SQL query phrase", () => {
  const result = extractForumTagCandidates({
    title: "Team update",
    content: "Sharing notes",
    category: "discussion",
    suggestedTags: ["SQL query"],
  });

  assert.ok(result.core.some((tag) => tag.slug === "database"));
  assert.ok(result.freeform.every((tag) => tag.slug !== "sql-query"));
});

test("extractForumTagCandidates matches suggested CI/CD phrase case-insensitively", () => {
  const result = extractForumTagCandidates({
    title: "Team update",
    content: "Sharing notes",
    category: "discussion",
    suggestedTags: ["CI/CD"],
  });

  assert.ok(result.core.some((tag) => tag.slug === "deployment"));
  assert.ok(result.freeform.every((tag) => tag.label !== "CI/CD"));
});

test("extractForumTagCandidates does not infer ux from superuser experience", () => {
  const result = extractForumTagCandidates({
    title: "Superuser experience notes",
    content: "Sharing notes about admin access.",
    category: "discussion",
  });

  assert.ok(result.core.every((tag) => tag.slug !== "ux"));
});

test("extractForumTagCandidates does not infer api from front-end route protection", () => {
  const result = extractForumTagCandidates({
    title: "前端路由保护实现",
    content: "Protect the client-side navigation flow.",
    category: "technical",
  });

  assert.ok(result.core.every((tag) => tag.slug !== "api"));
});

test("extractForumTagCandidates does not infer deployment from Chinese release event text", () => {
  const result = extractForumTagCandidates({
    title: "发布会总结",
    content: "整理活动后的要点。",
    category: "discussion",
  });

  assert.ok(result.core.every((tag) => tag.slug !== "deployment"));
});

test("extractForumTagCandidates does not infer deployment from Chinese release strategy text", () => {
  const result = extractForumTagCandidates({
    title: "内容发布策略",
    content: "讨论内容运营方案。",
    category: "discussion",
  });

  assert.ok(result.core.every((tag) => tag.slug !== "deployment"));
});

test("extractForumTagCandidates does not infer performance from repeated slow wording", () => {
  const result = extractForumTagCandidates({
    title: "慢慢熟悉工作流",
    content: "The onboarding flow takes time.",
    category: "discussion",
  });

  assert.ok(result.core.every((tag) => tag.slug !== "performance"));
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
  assert.ok(result.core.some((tag) => tag.slug === "deployment"));
  assert.ok(result.freeform.every((tag) => tag.slug !== "release-prep"));
  assert.ok(
    result.freeform.every((tag) => !tag.label.includes("extractor keeps the whole sentence"))
  );
});

test("normalizeForumSuggestedTags keeps up to five normalized labels", () => {
  const normalizeForumSuggestedTags = (forumTags as Record<
    string,
    unknown
  >).normalizeForumSuggestedTags;
  assert.equal(
    typeof normalizeForumSuggestedTags,
    "function",
    "normalizeForumSuggestedTags export is missing"
  );

  const result = (normalizeForumSuggestedTags as (input: string[]) => Array<{
    slug: string;
    label: string;
  }>)([
    " API Gateway ",
    "缓存层",
    "api-gateway",
    "",
    "发布回滚",
    "可观测性",
    "监控告警",
    "队列消费",
    "API Gateway",
  ]);

  assert.deepEqual(result, [
    { slug: "api-gateway", label: "API Gateway" },
    { slug: "缓存层", label: "缓存层" },
    { slug: "发布回滚", label: "发布回滚" },
    { slug: "可观测性", label: "可观测性" },
    { slug: "监控告警", label: "监控告警" },
  ]);
  assert.ok(result.every((tag) => tag.slug !== "队列消费"));
});

test("buildForumPostTagPayloads omits kind", () => {
  assert.deepEqual(
    buildForumPostTagPayloads([
      {
        source: "AUTO",
        tag: { slug: "缓存层", label: "缓存层", kind: "CORE" },
      },
    ]),
    [{ slug: "缓存层", label: "缓存层", source: "auto" }]
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
