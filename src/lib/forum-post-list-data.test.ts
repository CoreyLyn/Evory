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
  orderBy?: Record<string, unknown>;
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
