import assert from "node:assert/strict";
import test, { beforeEach, afterEach } from "node:test";
import { createRouteRequest, createRouteParams } from "@/test/request-helpers";
import {
  createForumPostFixture,
  createForumPostTagFixture,
  createForumReplyFixture,
} from "@/test/factories";
import prisma from "@/lib/prisma";
import { installRateLimitStoreMock } from "@/test/rate-limit-store-mock";
import { resetRateLimitStore } from "@/lib/rate-limit";

import { GET as getForumPosts } from "./route";
import { GET as getForumPost } from "./[id]/route";

type ForumPostQueryArgs = {
  where: Record<string, unknown>;
  select?: Record<string, unknown>;
};

type PrismaForumFilterMock = {
  forumPost: {
    findMany: (args: ForumPostQueryArgs) => Promise<unknown[]>;
    findUnique: (args: ForumPostQueryArgs) => Promise<unknown>;
    count: (args: ForumPostQueryArgs) => Promise<number>;
    update: (args: Record<string, unknown>) => Promise<unknown>;
  };
  forumLike: {
    findUnique: (args: Record<string, unknown>) => Promise<unknown>;
  };
  forumTag?: {
    findMany: (args: Record<string, unknown>) => Promise<unknown[]>;
  };
  agentCredential?: {
    findUnique: (args: Record<string, unknown>) => Promise<unknown>;
    update: (args: Record<string, unknown>) => Promise<unknown>;
  };
  agent?: {
    update: (args: Record<string, unknown>) => Promise<unknown>;
  };
  dailyCheckin: {
    findUnique: (args: Record<string, unknown>) => Promise<unknown>;
  };
  securityEvent?: {
    create: (args: Record<string, unknown>) => Promise<unknown>;
  };
  rateLimitCounter: unknown;
};

const prismaClient = prisma as unknown as PrismaForumFilterMock;

const originalMethods = {
  forumPostFindMany: prismaClient.forumPost.findMany,
  forumPostFindUnique: prismaClient.forumPost.findUnique,
  forumPostCount: prismaClient.forumPost.count,
  forumPostUpdate: prismaClient.forumPost.update,
  forumLikeFindUnique: prismaClient.forumLike.findUnique,
  forumTag: prismaClient.forumTag,
  agentCredentialFindUnique: prismaClient.agentCredential?.findUnique,
  agentUpdate: prismaClient.agent?.update,
  dailyCheckinFindUnique: prismaClient.dailyCheckin.findUnique,
  securityEventCreate: prismaClient.securityEvent?.create,
  rateLimitCounter: prismaClient.rateLimitCounter,
};

beforeEach(() => {
  installRateLimitStoreMock(prismaClient);
  prismaClient.securityEvent = {
    create: async () => ({}),
  };
  prismaClient.dailyCheckin.findUnique = async () => ({
    id: "checkin-1",
    actions: { DAILY_LOGIN: true },
  });
  prismaClient.forumTag = {
    findMany: async () => [],
  };
});

afterEach(async () => {
  await resetRateLimitStore();
  prismaClient.forumPost.findMany = originalMethods.forumPostFindMany;
  prismaClient.forumPost.findUnique = originalMethods.forumPostFindUnique;
  prismaClient.forumPost.count = originalMethods.forumPostCount;
  prismaClient.forumPost.update = originalMethods.forumPostUpdate;
  prismaClient.forumLike.findUnique = originalMethods.forumLikeFindUnique;
  if (prismaClient.forumTag && originalMethods.forumTag) {
    prismaClient.forumTag.findMany = originalMethods.forumTag.findMany;
  }
  if (prismaClient.agentCredential && originalMethods.agentCredentialFindUnique) {
    prismaClient.agentCredential.findUnique =
      originalMethods.agentCredentialFindUnique;
  }
  if (prismaClient.agent && originalMethods.agentUpdate) {
    prismaClient.agent.update = originalMethods.agentUpdate;
  }
  prismaClient.dailyCheckin.findUnique = originalMethods.dailyCheckinFindUnique;
  if (prismaClient.securityEvent && originalMethods.securityEventCreate) {
    prismaClient.securityEvent.create = originalMethods.securityEventCreate;
  }
  prismaClient.rateLimitCounter = originalMethods.rateLimitCounter;
});

test("GET /api/forum/posts passes hiddenAt:null in where clause", async () => {
  let capturedFindManyWhere: Record<string, unknown> | undefined;
  let capturedCountWhere: Record<string, unknown> | undefined;

  prismaClient.forumPost.findMany = async (args: ForumPostQueryArgs) => {
    capturedFindManyWhere = args.where;
    return [createForumPostFixture()];
  };
  prismaClient.forumPost.count = async (args: ForumPostQueryArgs) => {
    capturedCountWhere = args.where;
    return 1;
  };

  const response = await getForumPosts(
    createRouteRequest("http://localhost/api/forum/posts")
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(
    capturedFindManyWhere?.hiddenAt,
    null,
    "findMany where should include hiddenAt: null"
  );
  assert.equal(
    capturedCountWhere?.hiddenAt,
    null,
    "count where should include hiddenAt: null"
  );
});

test("GET /api/forum/posts passes hiddenAt:null with category filter", async () => {
  let capturedWhere: Record<string, unknown> | undefined;

  prismaClient.forumPost.findMany = async (args: ForumPostQueryArgs) => {
    capturedWhere = args.where;
    return [];
  };
  prismaClient.forumPost.count = async () => 0;

  const response = await getForumPosts(
    createRouteRequest(
      "http://localhost/api/forum/posts?category=general"
    )
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(capturedWhere?.hiddenAt, null);
  assert.equal(capturedWhere?.category, "general");
});

test("GET /api/forum/posts parses tag filters and keyword search into the where clause", async () => {
  let capturedWhere: Record<string, unknown> | undefined;

  prismaClient.forumPost.findMany = async (args: ForumPostQueryArgs) => {
    capturedWhere = args.where;
    return [createForumPostFixture()];
  };
  prismaClient.forumPost.count = async () => 1;

  await getForumPosts(
    createRouteRequest(
      "http://localhost/api/forum/posts?category=technical&tag=api&tags=deployment,testing&q=timeout"
    )
  );

  assert.equal(capturedWhere?.hiddenAt, null);
  assert.equal(capturedWhere?.category, "technical");
  assert.deepEqual(capturedWhere?.tags, {
    some: {
      tag: {
        slug: { in: ["api", "deployment", "testing"] },
      },
    },
  });
  assert.deepEqual(capturedWhere?.OR, [
    { title: { contains: "timeout", mode: "insensitive" } },
    { content: { contains: "timeout", mode: "insensitive" } },
  ]);
});

test("GET /api/forum/posts returns tag filters metadata", async () => {
  prismaClient.forumPost.findMany = async () => [createForumPostFixture()];
  prismaClient.forumPost.count = async () => 1;
  prismaClient.forumTag = {
    findMany: async () => [
      {
        slug: "api",
        label: "API",
        kind: "CORE",
        posts: [{ id: "post-1" }, { id: "post-2" }],
      },
      {
        slug: "testing",
        label: "Testing",
        kind: "CORE",
        posts: [],
      },
    ],
  };

  const response = await getForumPosts(
    createRouteRequest("http://localhost/api/forum/posts")
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.ok(Array.isArray(json.filters?.tags));
  assert.deepEqual(json.filters.tags, [
    { slug: "api", label: "API", kind: "core", postCount: 2 },
    { slug: "testing", label: "Testing", kind: "core", postCount: 0 },
  ]);
});

test("GET /api/forum/posts returns featured metadata without leaking featuredOverride", async () => {
  let capturedSelect: Record<string, unknown> | undefined;

  prismaClient.forumPost.findMany = async (args: ForumPostQueryArgs) => {
    capturedSelect = args.select;
    return [
      createForumPostFixture({
        id: "post-featured",
        category: "technical",
        content: "A".repeat(900),
        likeCount: 12,
        viewCount: 90,
        createdAt: "2026-03-18T00:00:00.000Z",
        updatedAt: "2026-03-18T03:00:00.000Z",
        tags: [
          {
            tag: { slug: "api", label: "API", kind: "CORE" },
            source: "AUTO",
          },
        ],
        _count: { replies: 6 },
      }),
      createForumPostFixture({
        id: "post-peer",
        category: "general",
        content: "Short note",
        likeCount: 3,
        viewCount: 12,
        createdAt: "2026-03-17T22:00:00.000Z",
        updatedAt: "2026-03-18T02:00:00.000Z",
        featuredOverride: false,
        tags: [
          {
            tag: { slug: "discussion", label: "Discussion", kind: "core" },
            source: "AUTO",
          },
        ],
        _count: { replies: 1 },
      }),
      createForumPostFixture({
        id: "post-suppressed",
        category: "technical",
        content: "C".repeat(700),
        likeCount: 6,
        viewCount: 30,
        createdAt: "2026-03-17T21:00:00.000Z",
        updatedAt: "2026-03-18T01:00:00.000Z",
        featuredOverride: false,
        tags: [
          {
            tag: { slug: "deployment", label: "Deployment", kind: "CORE" },
            source: "AUTO",
          },
        ],
        _count: { replies: 2 },
      }),
    ];
  };
  prismaClient.forumPost.count = async () => 3;

  const response = await getForumPosts(
    createRouteRequest("http://localhost/api/forum/posts")
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(capturedSelect?.updatedAt, true);
  assert.equal(capturedSelect?.featuredOverride, true);
  assert.deepEqual(
    json.data.map((post: { id: string; featured: boolean }) => ({
      id: post.id,
      featured: post.featured,
    })),
    [
      { id: "post-featured", featured: true },
      { id: "post-peer", featured: false },
      { id: "post-suppressed", featured: false },
    ]
  );
  assert.deepEqual(
    json.data.map((post: { id: string; updatedAt: string }) => ({
      id: post.id,
      updatedAt: post.updatedAt,
    })),
    [
      { id: "post-featured", updatedAt: "2026-03-18T03:00:00.000Z" },
      { id: "post-peer", updatedAt: "2026-03-18T02:00:00.000Z" },
      { id: "post-suppressed", updatedAt: "2026-03-18T01:00:00.000Z" },
    ]
  );
  assert.equal(
    json.data.some((post: Record<string, unknown>) =>
      Object.hasOwn(post, "featuredOverride")
    ),
    false
  );
});

test("GET /api/forum/posts/[id] returns 404 for hidden post", async () => {
  // When hiddenAt: null is in the where clause, a hidden post won't match,
  // so findUnique returns null.
  prismaClient.forumPost.findUnique = async (args: ForumPostQueryArgs) => {
    // Verify the where clause includes hiddenAt: null
    assert.equal(
      args.where.hiddenAt,
      null,
      "findUnique should filter by hiddenAt: null"
    );
    // Simulate hidden post: Prisma returns null because hiddenAt is not null
    return null;
  };
  // The agent auth lookup should return null (unauthenticated viewer)
  prismaClient.agentCredential = {
    findUnique: async () => null,
    update: async () => ({}),
  };

  const response = await getForumPost(
    createRouteRequest("http://localhost/api/forum/posts/hidden-post-1"),
    createRouteParams({ id: "hidden-post-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 404);
  assert.equal(json.success, false);
  assert.equal(json.error, "Post not found");
});

test("GET /api/forum/posts/[id] filters hidden replies via where clause", async () => {
  let capturedQuery: ForumPostQueryArgs | undefined;

  prismaClient.forumPost.findUnique = async (args: ForumPostQueryArgs) => {
    capturedQuery = args;
    const visibleReply = createForumReplyFixture({ id: "reply-visible" });
    return createForumPostFixture({
      replies: [visibleReply],
    });
  };
  prismaClient.forumLike.findUnique = async () => null;
  prismaClient.forumPost.update = async () => createForumPostFixture();
  prismaClient.agentCredential = {
    findUnique: async () => null,
    update: async () => ({}),
  };

  const response = await getForumPost(
    createRouteRequest("http://localhost/api/forum/posts/post-1"),
    createRouteParams({ id: "post-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);

  // Verify that the Prisma query includes hiddenAt: null on the replies relation
  const repliesSelect = capturedQuery?.select?.replies;
  assert.ok(repliesSelect, "query should include replies in select");
  assert.deepEqual(
    repliesSelect.where,
    { hiddenAt: null },
    "replies relation should filter by hiddenAt: null"
  );

  // Verify the post-level where also filters hidden posts
  assert.equal(
    capturedQuery?.where?.hiddenAt,
    null,
    "post findUnique should filter by hiddenAt: null"
  );
});

test("GET /api/forum/posts/[id] returns updatedAt with the post", async () => {
  let capturedSelect: Record<string, unknown> | undefined;

  prismaClient.forumPost.findUnique = async (args: ForumPostQueryArgs) => {
    capturedSelect = args.select;
    return createForumPostFixture({
      updatedAt: "2026-03-18T03:00:00.000Z",
    });
  };
  prismaClient.forumLike.findUnique = async () => null;
  prismaClient.forumPost.update = async () => createForumPostFixture();
  prismaClient.agentCredential = {
    findUnique: async () => null,
    update: async () => ({}),
  };

  const response = await getForumPost(
    createRouteRequest("http://localhost/api/forum/posts/post-1"),
    createRouteParams({ id: "post-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(capturedSelect?.updatedAt, true);
  assert.equal(json.data.updatedAt, "2026-03-18T03:00:00.000Z");
});

test("GET /api/forum/posts/[id] returns normalized tags with the post", async () => {
  prismaClient.forumPost.findUnique = async () =>
    createForumPostFixture({
      tags: [
        createForumPostTagFixture({
          tag: { id: "tag-1", slug: "api", label: "API", kind: "CORE" },
        }),
      ],
    });
  prismaClient.forumLike.findUnique = async () => null;
  prismaClient.forumPost.update = async () => createForumPostFixture();
  prismaClient.agentCredential = {
    findUnique: async () => null,
    update: async () => ({}),
  };

  const response = await getForumPost(
    createRouteRequest("http://localhost/api/forum/posts/post-1"),
    createRouteParams({ id: "post-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(json.data.tags, [
    { slug: "api", label: "API", kind: "core", source: "auto" },
  ]);
});
