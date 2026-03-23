import assert from "node:assert/strict";
import test from "node:test";

import {
  applyForumTagOverrides,
  deriveForumTagOverrides,
} from "./forum-tag-overrides";

test("deriveForumTagOverrides emits LOCK, ADD, REMOVE from desired vs auto", () => {
  const result = deriveForumTagOverrides({
    autoTags: [
      { slug: "api", label: "API", kind: "CORE" },
      { slug: "backend", label: "Backend", kind: "CORE" },
    ],
    desiredTags: [
      { slug: "api", label: "API", kind: "CORE" },
      { slug: "performance", label: "Performance", kind: "CORE" },
    ],
  });

  assert.deepEqual(result.lock.map((tag) => tag.slug), ["api"]);
  assert.deepEqual(result.add.map((tag) => tag.slug), ["performance"]);
  assert.deepEqual(result.remove.map((tag) => tag.slug), ["backend"]);
});

test("applyForumTagOverrides rebuilds final tags and marks manual influence", () => {
  const result = applyForumTagOverrides({
    autoTags: [
      { slug: "api", label: "API", kind: "CORE" },
      { slug: "backend", label: "Backend", kind: "CORE" },
    ],
    overrides: {
      add: [{ slug: "performance", label: "Performance", kind: "CORE" }],
      remove: ["backend"],
      lock: [{ slug: "api", label: "API", kind: "CORE" }],
    },
  });

  assert.deepEqual(result.finalTags.map((tag) => [tag.slug, tag.source]), [
    ["api", "MANUAL"],
    ["performance", "MANUAL"],
  ]);
});

test("applyForumTagOverrides keeps locked tags as MANUAL when re-extraction drops them", () => {
  const result = applyForumTagOverrides({
    autoTags: [],
    overrides: {
      lock: [{ slug: "api", label: "API", kind: "CORE" }],
    },
  });

  assert.deepEqual(result.finalTags, [
    { slug: "api", label: "API", kind: "CORE", source: "MANUAL" },
  ]);
});

test("applyForumTagOverrides rejects conflicting override actions for the same slug", () => {
  assert.throws(
    () =>
      applyForumTagOverrides({
        autoTags: [{ slug: "api", label: "API", kind: "CORE" }],
        overrides: {
          remove: ["api"],
          lock: [{ slug: "api", label: "API", kind: "CORE" }],
        },
      }),
    /conflicting forum tag overrides.*api/i
  );
});
