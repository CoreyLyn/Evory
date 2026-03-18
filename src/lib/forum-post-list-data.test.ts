import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";

import prisma from "@/lib/prisma";
import { createAgentFixture, createForumPostTagFixture } from "@/test/factories";

import {
  getForumPostListData,
  shouldSerializeForumListQueries,
} from "./forum-post-list-data";

type ForumPostFindManyArgs = {
  where?: Record<string, unknown>;
  orderBy?: Record<string, unknown> | Record<string, unknown>[];
  skip?: number;
  take?: number;
  select?: Record<string, unknown>;
};

type ForumTagFindManyArgs = {
  where?: Record<string, unknown>;
  select?: Record<string, unknown>;
};

type AgentFindManyArgs = {
  where?: Record<string, unknown>;
  select?: Record<string, unknown>;
};

type ForumPostTagFindManyArgs = {
  where?: Record<string, unknown>;
  select?: Record<string, unknown>;
};

type PrismaForumPostListMock = {
  forumPost: {
    findMany: (args: ForumPostFindManyArgs) => Promise<unknown[]>;
    count: (args: { where?: Record<string, unknown> }) => Promise<number>;
  };
  forumTag: {
    findMany: (args: ForumTagFindManyArgs) => Promise<unknown[]>;
  };
  agent: {
    findMany: (args: AgentFindManyArgs) => Promise<unknown[]>;
  };
  forumPostTag: {
    findMany: (args: ForumPostTagFindManyArgs) => Promise<unknown[]>;
  };
};

const prismaClient = prisma as unknown as PrismaForumPostListMock;

const originalMethods = {
  forumPostFindMany: prismaClient.forumPost.findMany,
  forumPostCount: prismaClient.forumPost.count,
  forumTagFindMany: prismaClient.forumTag.findMany,
  agentFindMany: prismaClient.agent.findMany,
  forumPostTagFindMany: prismaClient.forumPostTag.findMany,
};

beforeEach(() => {
  prismaClient.forumPost.count = async () => 0;
  prismaClient.forumTag.findMany = async () => [];
  prismaClient.agent.findMany = async () => [];
  prismaClient.forumPostTag.findMany = async () => [];
});

afterEach(() => {
  prismaClient.forumPost.findMany = originalMethods.forumPostFindMany;
  prismaClient.forumPost.count = originalMethods.forumPostCount;
  prismaClient.forumTag.findMany = originalMethods.forumTagFindMany;
  prismaClient.agent.findMany = originalMethods.agentFindMany;
  prismaClient.forumPostTag.findMany = originalMethods.forumPostTagFindMany;
});

test("shouldSerializeForumListQueries returns true for single-use single-connection database URLs", () => {
  assert.equal(
    shouldSerializeForumListQueries(
      "postgresql://postgres:postgres@localhost:51214/template1?connection_limit=1&single_use_connections=true"
    ),
    true
  );
  assert.equal(
    shouldSerializeForumListQueries(
      "postgresql://postgres:postgres@localhost:5432/app?connection_limit=10"
    ),
    false
  );
});

test("getForumPostListData loads tags and agents separately when combined nested selects are unavailable", async () => {
  prismaClient.forumPost.findMany = async (args: ForumPostFindManyArgs) => {
    if (args.select?.tags && args.select?.agent) {
      const error = new Error("Server has closed the connection") as Error & {
        code?: string;
      };
      error.code = "P1017";
      throw error;
    }

    return [
      {
        id: "post-1",
        agentId: "author-1",
        title: "Post title",
        content: "A".repeat(900),
        category: "technical",
        viewCount: 42,
        likeCount: 12,
        createdAt: new Date("2026-03-18T00:00:00.000Z"),
        updatedAt: new Date("2026-03-18T03:00:00.000Z"),
        featuredOverride: null,
        _count: { replies: 6 },
      },
    ];
  };
  prismaClient.forumPost.count = async () => 1;
  prismaClient.agent.findMany = async () => {
    const { id, name, type } = createAgentFixture({
      id: "author-1",
      name: "Author",
      type: "CUSTOM",
    });

    return [{ id, name, type }];
  };
  prismaClient.forumPostTag.findMany = async () => [
    createForumPostTagFixture({
      postId: "post-1",
      source: "AUTO",
      tag: {
        slug: "api",
        label: "API",
        kind: "CORE",
      },
    }),
  ];

  const result = await getForumPostListData({ page: 1, pageSize: 20 });

  assert.equal(result.pagination.total, 1);
  assert.equal(result.data.length, 1);
  assert.deepEqual(result.data[0]?.agent, {
    id: "author-1",
    name: "Author",
    type: "CUSTOM",
  });
  assert.deepEqual(result.data[0]?.tags, [
    {
      slug: "api",
      label: "API",
      kind: "core",
      source: "auto",
    },
  ]);
  assert.equal(result.data[0]?.replyCount, 6);
});

test("getForumPostListData uses latest sort by default", async () => {
  let capturedOrderBy: ForumPostFindManyArgs["orderBy"];
  let forumPostFindManyCall = 0;

  prismaClient.forumPost.findMany = async (args: ForumPostFindManyArgs) => {
    forumPostFindManyCall += 1;
    if (forumPostFindManyCall === 1) {
      capturedOrderBy = args.orderBy;
    }
    return [];
  };

  await getForumPostListData({ page: 1, pageSize: 20, sort: "latest" });

  assert.deepEqual(capturedOrderBy, [{ createdAt: "desc" }]);
});

test("getForumPostListData supports active sort by updatedAt", async () => {
  let capturedOrderBy: ForumPostFindManyArgs["orderBy"];
  let forumPostFindManyCall = 0;

  prismaClient.forumPost.findMany = async (args: ForumPostFindManyArgs) => {
    forumPostFindManyCall += 1;
    if (forumPostFindManyCall === 1) {
      capturedOrderBy = args.orderBy;
    }
    return [];
  };

  await getForumPostListData({ page: 1, pageSize: 20, sort: "active" });

  assert.deepEqual(capturedOrderBy, [
    { updatedAt: "desc" },
    { createdAt: "desc" },
  ]);
});

test("getForumPostListData supports top sort by likes and freshness", async () => {
  let capturedOrderBy: ForumPostFindManyArgs["orderBy"];
  let forumPostFindManyCall = 0;

  prismaClient.forumPost.findMany = async (args: ForumPostFindManyArgs) => {
    forumPostFindManyCall += 1;
    if (forumPostFindManyCall === 1) {
      capturedOrderBy = args.orderBy;
    }
    return [];
  };

  await getForumPostListData({ page: 1, pageSize: 20, sort: "top" });

  assert.deepEqual(capturedOrderBy, [
    { likeCount: "desc" },
    { updatedAt: "desc" },
    { createdAt: "desc" },
  ]);
});

test("getForumPostListData computes featured state from a broader candidate pool than the current page", async () => {
  let forumPostFindManyCall = 0;

  prismaClient.forumPost.findMany = async (args: ForumPostFindManyArgs) => {
    forumPostFindManyCall += 1;

    if (forumPostFindManyCall === 1) {
      return [
        {
          id: "post-page",
          agentId: "author-1",
          title: "Paged post",
          content: "short",
          category: "general",
          viewCount: 5,
          likeCount: 1,
          createdAt: new Date("2026-03-18T00:00:00.000Z"),
          updatedAt: new Date("2026-03-18T00:00:00.000Z"),
          featuredOverride: null,
          _count: { replies: 1 },
        },
      ];
    }

    assert.equal(args.take, 100);

    return [
      {
        id: "post-page",
        agentId: "author-1",
        title: "Paged post",
        content: "short",
        category: "general",
        viewCount: 5,
        likeCount: 1,
        createdAt: new Date("2026-03-18T00:00:00.000Z"),
        updatedAt: new Date("2026-03-18T00:00:00.000Z"),
        featuredOverride: null,
        _count: { replies: 1 },
      },
      {
        id: "post-featured",
        agentId: "author-2",
        title: "Featured candidate",
        content: "B".repeat(900),
        category: "technical",
        viewCount: 50,
        likeCount: 10,
        createdAt: new Date("2026-03-18T01:00:00.000Z"),
        updatedAt: new Date("2026-03-18T01:00:00.000Z"),
        featuredOverride: true,
        _count: { replies: 4 },
      },
    ];
  };
  prismaClient.forumPost.count = async () => 1;
  prismaClient.agent.findMany = async ({ where }: AgentFindManyArgs) => {
    const ids = ((where?.id as { in?: string[] } | undefined)?.in ?? []);

    return ids.map((id) => {
      const { name, type } = createAgentFixture({ id });
      return { id, name, type };
    });
  };
  prismaClient.forumPostTag.findMany = async ({ where }: ForumPostTagFindManyArgs) => {
    const postIds = ((where?.postId as { in?: string[] } | undefined)?.in ?? []);

    return postIds.map((postId, index) =>
      createForumPostTagFixture({
        postId,
        source: "AUTO",
        tag: {
          id: `tag-${index + 1}`,
          slug: "api",
          label: "API",
          kind: "CORE",
        },
      })
    );
  };

  const result = await getForumPostListData({
    page: 1,
    pageSize: 20,
    sort: "latest",
  });

  assert.equal(forumPostFindManyCall, 2);
  assert.equal(result.data[0]?.id, "post-page");
  assert.equal(result.data[0]?.featured, false);
});
