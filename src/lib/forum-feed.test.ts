import assert from "node:assert/strict";
import test from "node:test";

import {
  pickFeaturedForumPostIds,
  scoreForumFeaturedCandidate,
} from "./forum-feed";
import { createForumPostFixture } from "@/test/factories";

test("scoreForumFeaturedCandidate favors recent technical posts with core tags", () => {
  const strong = createForumPostFixture({
    id: "post-strong",
    category: "technical",
    content: "A".repeat(900),
    likeCount: 8,
    viewCount: 40,
    createdAt: "2026-03-18T00:00:00.000Z",
    updatedAt: "2026-03-18T03:00:00.000Z",
    tags: [
      {
        tag: { slug: "api", label: "API", kind: "CORE" },
        source: "AUTO",
      },
    ],
    _count: { replies: 4 },
  });
  const weak = createForumPostFixture({
    id: "post-weak",
    category: "general",
    content: "Short note",
    likeCount: 0,
    viewCount: 2,
    createdAt: "2026-02-20T00:00:00.000Z",
    updatedAt: "2026-02-20T00:00:00.000Z",
    tags: [],
    _count: { replies: 0 },
  });

  assert.ok(
    scoreForumFeaturedCandidate(strong, new Date("2026-03-18T12:00:00.000Z")) >
      scoreForumFeaturedCandidate(weak, new Date("2026-03-18T12:00:00.000Z"))
  );
});

test("pickFeaturedForumPostIds returns at most two in-list featured ids", () => {
  const posts = [
    createForumPostFixture({
      id: "post-1",
      category: "technical",
      content: "A".repeat(800),
      tags: [
        {
          tag: { slug: "api", label: "API", kind: "CORE" },
          source: "AUTO",
        },
      ],
      _count: { replies: 3 },
    }),
    createForumPostFixture({
      id: "post-2",
      category: "discussion",
      content: "B".repeat(700),
      tags: [
        {
          tag: { slug: "deployment", label: "Deployment", kind: "CORE" },
          source: "AUTO",
        },
      ],
      _count: { replies: 2 },
    }),
    createForumPostFixture({
      id: "post-3",
      category: "general",
      content: "Short",
      tags: [],
      _count: { replies: 0 },
    }),
  ];

  assert.deepEqual(
    pickFeaturedForumPostIds(posts, {
      now: new Date("2026-03-18T12:00:00.000Z"),
      limit: 2,
    }),
    ["post-1", "post-2"]
  );
});

test("pickFeaturedForumPostIds ignores short-body posts unless manually pinned", () => {
  const shortPost = createForumPostFixture({
    id: "post-short",
    category: "technical",
    content: "too short",
    updatedAt: "2026-03-18T03:00:00.000Z",
    tags: [
      {
        tag: { slug: "api", label: "API", kind: "CORE" },
        source: "AUTO",
      },
    ],
    _count: { replies: 5 },
  });
  const pinnedPost = createForumPostFixture({
    id: "post-pinned",
    category: "general",
    content: "short pinned note",
    featuredOverride: true,
    updatedAt: "2026-03-18T03:00:00.000Z",
    tags: [],
    _count: { replies: 0 },
  });

  assert.deepEqual(
    pickFeaturedForumPostIds([shortPost, pinnedPost], {
      now: new Date("2026-03-18T12:00:00.000Z"),
      limit: 2,
    }),
    ["post-pinned"]
  );
});
