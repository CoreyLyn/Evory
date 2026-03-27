import assert from "node:assert/strict";
import test from "node:test";

import {
  buildForumPostTagPayloads,
  buildForumTagFilterPayloads,
  normalizeEditableForumTags,
  normalizeForumFreeformTag,
  normalizeForumSuggestedTags,
  parseForumTagFilters,
} from "./forum-tags";

test("parseForumTagFilters merges tag and tags query params", () => {
  const filters = parseForumTagFilters(
    new URLSearchParams("tag=api-gateway&tags=release-prep,api-gateway,,缓存层")
  );

  assert.deepEqual(filters, ["api-gateway", "release-prep", "缓存层"]);
});

test("normalizeForumFreeformTag rejects empty and generic values", () => {
  assert.equal(normalizeForumFreeformTag("   "), null);
  assert.equal(normalizeForumFreeformTag("general"), null);
  assert.deepEqual(normalizeForumFreeformTag("CI / CD"), {
    slug: "ci-cd",
    label: "CI / CD",
  });
});

test("normalizeForumSuggestedTags keeps up to five normalized labels", () => {
  assert.deepEqual(
    normalizeForumSuggestedTags([
      " API Gateway ",
      "缓存层",
      "api-gateway",
      "",
      "发布回滚",
      "可观测性",
      "监控告警",
      "队列消费",
      "API Gateway",
    ]),
    [
      { slug: "api-gateway", label: "API Gateway" },
      { slug: "缓存层", label: "缓存层" },
      { slug: "发布回滚", label: "发布回滚" },
      { slug: "可观测性", label: "可观测性" },
      { slug: "监控告警", label: "监控告警" },
    ]
  );
});

test("normalizeForumSuggestedTags rejects sentence-like labels", () => {
  assert.deepEqual(
    normalizeForumSuggestedTags([
      "API Gateway",
      "When an agent posts a thread without punctuation the extractor keeps the whole sentence",
    ]),
    [{ slug: "api-gateway", label: "API Gateway" }]
  );
});

test("normalizeEditableForumTags ignores legacy kind and normalizes slug-only inputs", () => {
  assert.deepEqual(
    normalizeEditableForumTags([
      { slug: "api-gateway", kind: "core" },
      { label: "缓存层", kind: "freeform" },
      { label: "发布回滚" },
      { label: "api gateway" },
    ]),
    [
      { slug: "api-gateway", label: "API Gateway" },
      { slug: "缓存层", label: "缓存层" },
      { slug: "发布回滚", label: "发布回滚" },
    ]
  );
});

test("buildForumPostTagPayloads omits kind", () => {
  assert.deepEqual(
    buildForumPostTagPayloads([
      {
        source: "AUTO",
        tag: { slug: "缓存层", label: "缓存层" },
      },
      {
        source: "MANUAL",
        tag: { slug: "发布回滚", label: "发布回滚" },
      },
    ]),
    [
      { slug: "缓存层", label: "缓存层", source: "auto" },
      { slug: "发布回滚", label: "发布回滚", source: "manual" },
    ]
  );
});

test("buildForumTagFilterPayloads includes selected tags missing from summaries", () => {
  assert.deepEqual(
    buildForumTagFilterPayloads({
      tagSummaries: [
        { slug: "缓存层", label: "缓存层", postCount: 3 },
        { slug: "api-gateway", label: "API Gateway", postCount: 2 },
      ],
      selectedTagSlugs: ["发布回滚"],
    }),
    [
      { slug: "缓存层", label: "缓存层", postCount: 3 },
      { slug: "api-gateway", label: "API Gateway", postCount: 2 },
      { slug: "发布回滚", label: "发布回滚", postCount: 0 },
    ]
  );
});
