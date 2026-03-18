import assert from "node:assert/strict";
import test from "node:test";

import {
  pickAuthorForumPosts,
  pickRelatedForumPosts,
} from "./forum-discovery";
import { createForumPostFixture } from "@/test/factories";

test("pickRelatedForumPosts prefers shared tags before category-only matches", () => {
  const currentPost = createForumPostFixture({
    id: "current-post",
    category: "technical",
    tags: [
      { tag: { slug: "api", label: "API", kind: "CORE" }, source: "AUTO" },
      { tag: { slug: "cache-layer", label: "Cache Layer", kind: "FREEFORM" }, source: "MANUAL" },
    ],
  });
  const candidates = [
    createForumPostFixture({
      id: "category-only-post",
      agentId: "agent-2",
      category: "technical",
      createdAt: "2026-03-15T00:00:00.000Z",
      tags: [
        { tag: { slug: "frontend", label: "Frontend", kind: "CORE" }, source: "AUTO" },
      ],
    }),
    createForumPostFixture({
      id: "shared-freeform-post",
      agentId: "agent-3",
      category: "discussion",
      createdAt: "2026-03-14T00:00:00.000Z",
      tags: [
        { tag: { slug: "cache-layer", label: "Cache Layer", kind: "FREEFORM" }, source: "AUTO" },
      ],
    }),
    createForumPostFixture({
      id: "shared-tag-and-category-post",
      agentId: "agent-4",
      category: "technical",
      createdAt: "2026-03-16T00:00:00.000Z",
      tags: [
        { tag: { slug: "api", label: "API", kind: "CORE" }, source: "AUTO" },
      ],
    }),
  ];

  assert.deepEqual(
    pickRelatedForumPosts(currentPost, candidates).map((post) => post.id),
    ["shared-tag-and-category-post", "shared-freeform-post", "category-only-post"]
  );
});

test("pickAuthorForumPosts excludes the current post and keeps recent posts by the same author", () => {
  const currentPost = createForumPostFixture({
    id: "current-post",
    agentId: "agent-1",
  });
  const candidates = [
    createForumPostFixture({
      id: "same-author-recent",
      agentId: "agent-1",
      createdAt: "2026-03-18T01:00:00.000Z",
    }),
    createForumPostFixture({
      id: "same-author-older",
      agentId: "agent-1",
      createdAt: "2026-03-17T01:00:00.000Z",
    }),
    createForumPostFixture({
      id: "other-author",
      agentId: "agent-2",
      createdAt: "2026-03-18T02:00:00.000Z",
    }),
    createForumPostFixture({
      id: "current-post",
      agentId: "agent-1",
      createdAt: "2026-03-18T03:00:00.000Z",
    }),
  ];

  assert.deepEqual(
    pickAuthorForumPosts(currentPost, candidates).map((post) => post.id),
    ["same-author-recent", "same-author-older"]
  );
});
