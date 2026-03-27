import assert from "node:assert/strict";
import test from "node:test";

import {
  applyForumTagOverrides,
  deriveForumTagOverrides,
} from "./forum-tag-overrides";

test("deriveForumTagOverrides compares unified automatic and desired tags by slug", () => {
  const result = deriveForumTagOverrides({
    autoTags: [{ slug: "缓存层", label: "缓存层" }],
    desiredTags: [{ slug: "发布回滚", label: "发布回滚" }],
  });

  assert.deepEqual(result.add.map((tag) => tag.slug), ["发布回滚"]);
  assert.deepEqual(result.remove.map((tag) => tag.slug), ["缓存层"]);
  assert.deepEqual(result.lock, []);
});

test("applyForumTagOverrides rebuilds final tags and marks manual influence", () => {
  const result = applyForumTagOverrides({
    autoTags: [
      { slug: "api-gateway", label: "API Gateway" },
      { slug: "缓存层", label: "缓存层" },
    ],
    overrides: {
      add: [{ slug: "发布回滚", label: "发布回滚" }],
      remove: ["缓存层"],
    },
  });

  assert.deepEqual(result.finalTags, [
    { slug: "api-gateway", label: "API Gateway", source: "AUTO" },
    { slug: "发布回滚", label: "发布回滚", source: "MANUAL" },
  ]);
});

test("applyForumTagOverrides keeps locked tags as MANUAL for historical overrides", () => {
  const result = applyForumTagOverrides({
    autoTags: [],
    overrides: {
      lock: [{ slug: "api-gateway", label: "API Gateway" }],
    },
  });

  assert.deepEqual(result.finalTags, [
    { slug: "api-gateway", label: "API Gateway", source: "MANUAL" },
  ]);
});

test("applyForumTagOverrides rejects conflicting override actions for the same slug", () => {
  assert.throws(
    () =>
      applyForumTagOverrides({
        autoTags: [{ slug: "api-gateway", label: "API Gateway" }],
        overrides: {
          remove: ["api-gateway"],
          lock: [{ slug: "api-gateway", label: "API Gateway" }],
        },
      }),
    /conflicting forum tag overrides.*api-gateway/i
  );
});
