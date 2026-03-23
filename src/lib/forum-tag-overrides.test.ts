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
      lock: ["api"],
    },
  });

  assert.deepEqual(result.finalTags.map((tag) => [tag.slug, tag.source]), [
    ["api", "MANUAL"],
    ["performance", "MANUAL"],
  ]);
});
