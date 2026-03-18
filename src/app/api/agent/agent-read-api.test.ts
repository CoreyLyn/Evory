import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import prisma from "@/lib/prisma";
import {
  createAgentCredentialFixture,
  createAgentFixture,
  createForumPostFixture,
  createSecurityEventFixture,
  createTaskFixture,
} from "@/test/factories";
import { createRouteParams, createRouteRequest } from "@/test/request-helpers";
import { hashApiKey } from "@/lib/auth";
import { GET as getAgentForumPosts } from "./forum/posts/route";
import { GET as getAgentKnowledgeTree } from "./knowledge/tree/route";
import { GET as getAgentKnowledgeDocuments } from "./knowledge/documents/route";
import { GET as getAgentKnowledgeDocumentByPath } from "./knowledge/documents/[...slug]/route";
import { GET as getAgentKnowledgeSearch } from "./knowledge/search/route";
import { GET as getAgentTasks } from "./tasks/route";
import {
  createKnowledgeApiSandbox,
  useKnowledgeBaseRoot,
  writeKnowledgeMarkdown,
} from "../knowledge/test-helpers";

type AsyncMethod<TArgs extends unknown[] = [unknown], TResult = unknown> = (
  ...args: TArgs
) => Promise<TResult>;

type AgentReadPrismaMock = {
  agent: {
    findUnique: AsyncMethod;
    findMany: AsyncMethod;
    update: AsyncMethod;
    count?: AsyncMethod;
  };
  agentCredential?: {
    findUnique: AsyncMethod;
    update: AsyncMethod;
  };
  securityEvent?: {
    create: AsyncMethod;
  };
  task: {
    findMany: AsyncMethod;
    count: AsyncMethod;
  };
  forumPost: {
    findMany: AsyncMethod;
    count: AsyncMethod;
  };
};

const prismaClient = prisma as unknown as AgentReadPrismaMock;
const originalAgentFindUnique = prismaClient.agent.findUnique;
const originalAgentFindMany = prismaClient.agent.findMany;
const originalAgentUpdate = prismaClient.agent.update;
const originalCredentialFindUnique = prismaClient.agentCredential?.findUnique;
const originalCredentialUpdate = prismaClient.agentCredential?.update;
const originalSecurityEventCreate = prismaClient.securityEvent?.create;
const originalTaskFindMany = prismaClient.task.findMany;
const originalTaskCount = prismaClient.task.count;
const originalForumPostFindMany = prismaClient.forumPost.findMany;
const originalForumPostCount = prismaClient.forumPost.count;

beforeEach(() => {
  prismaClient.securityEvent = {
    create: async () => createSecurityEventFixture(),
  };
});

afterEach(() => {
  prismaClient.agent.findUnique = originalAgentFindUnique;
  prismaClient.agent.findMany = originalAgentFindMany;
  prismaClient.agent.update = originalAgentUpdate;
  if (prismaClient.agentCredential && originalCredentialFindUnique) {
    prismaClient.agentCredential.findUnique = originalCredentialFindUnique;
  }
  if (prismaClient.agentCredential && originalCredentialUpdate) {
    prismaClient.agentCredential.update = originalCredentialUpdate;
  }
  if (prismaClient.securityEvent && originalSecurityEventCreate) {
    prismaClient.securityEvent.create = originalSecurityEventCreate;
  }
  prismaClient.task.findMany = originalTaskFindMany;
  prismaClient.task.count = originalTaskCount;
  prismaClient.forumPost.findMany = originalForumPostFindMany;
  prismaClient.forumPost.count = originalForumPostCount;
});

function mockAgentCredential(
  apiKey: string,
  overrides: Record<string, unknown> = {}
) {
  prismaClient.agent.update = async ({ where }: { where: { id: string } }) =>
    createAgentFixture({
      id: where.id,
      apiKey,
      ...overrides,
    });
  prismaClient.agentCredential = {
    findUnique: async ({ where }: { where: { keyHash: string } }) =>
      where.keyHash === hashApiKey(apiKey)
        ? createAgentCredentialFixture({
            keyHash: where.keyHash,
            agent: createAgentFixture({
              apiKey,
              ...overrides,
            }),
          })
        : null,
    update: async () => createAgentCredentialFixture(),
  };
}

test("claimed agent can read the official task feed", async () => {
  mockAgentCredential("agent-key", {
    id: "agent-1",
    ownerUserId: "user-1",
    claimStatus: "ACTIVE",
  });
  prismaClient.task.findMany = async () => [
    createTaskFixture({
      id: "task-1",
      creatorId: "creator-1",
      assigneeId: null,
      status: "OPEN",
    }),
  ];
  prismaClient.task.count = async () => 1;
  prismaClient.agent.findMany = async () => [
    createAgentFixture({
      id: "creator-1",
      name: "Creator",
    }),
  ];

  const response = await getAgentTasks(
    createRouteRequest("http://localhost/api/agent/tasks", {
      apiKey: "agent-key",
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Evory-Agent-API"), "official");
  assert.equal(json.success, true);
  assert.equal(json.data.length, 1);
  assert.equal(json.data[0].id, "task-1");
});

test("claimed agent can read the official forum feed", async () => {
  mockAgentCredential("agent-key", {
    id: "agent-1",
    ownerUserId: "user-1",
    claimStatus: "ACTIVE",
  });
  prismaClient.forumPost.findMany = async () => [
    createForumPostFixture({
      id: "post-1",
      title: "Agent forum post",
    }),
  ];
  prismaClient.forumPost.count = async () => 1;

  const response = await getAgentForumPosts(
    createRouteRequest("http://localhost/api/agent/forum/posts", {
      apiKey: "agent-key",
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Evory-Agent-API"), "official");
  assert.equal(json.success, true);
  assert.equal(json.data.length, 1);
  assert.equal(json.data[0].id, "post-1");
});

test("claimed agent forum read supports tag-first retrieval", async () => {
  let capturedArgs: Record<string, unknown> | undefined;

  mockAgentCredential("agent-key", {
    id: "agent-1",
    ownerUserId: "user-1",
    claimStatus: "ACTIVE",
  });
  prismaClient.forumPost.findMany = async (args) => {
    capturedArgs = args as Record<string, unknown>;
    return [createForumPostFixture()];
  };
  prismaClient.forumPost.count = async () => 1;

  const response = await getAgentForumPosts(
    createRouteRequest(
      "http://localhost/api/agent/forum/posts?tags=api,testing&q=timeout",
      {
        apiKey: "agent-key",
      }
    )
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Evory-Agent-API"), "official");
  assert.equal(json.success, true);
  assert.deepEqual(capturedArgs?.where, {
    hiddenAt: null,
    tags: {
      some: {
        tag: {
          slug: { in: ["api", "testing"] },
        },
      },
    },
    OR: [
      { title: { contains: "timeout", mode: "insensitive" } },
      { content: { contains: "timeout", mode: "insensitive" } },
    ],
  });
});

test("unclaimed agents cannot use the official knowledge tree endpoint", async (t) => {
  const sandbox = await createKnowledgeApiSandbox(t);
  useKnowledgeBaseRoot(t, sandbox.knowledgeRoot);
  await writeKnowledgeMarkdown(
    sandbox.knowledgeRoot,
    "README.md",
    "# Knowledge Home\n\nRoot content.\n"
  );

  mockAgentCredential("agent-key", {
    id: "agent-1",
    ownerUserId: null,
    claimStatus: "UNCLAIMED",
    claimedAt: null,
  });

  const response = await getAgentKnowledgeTree(
    createRouteRequest("http://localhost/api/agent/knowledge/tree", {
      apiKey: "agent-key",
    })
  );
  const json = await response.json();

  assert.equal(response.status, 401);
  assert.equal(response.headers.get("X-Evory-Agent-API"), "official");
  assert.equal(json.error, "Unauthorized: Invalid or missing API key");
});

test("claimed agent can read the official knowledge tree", async (t) => {
  const sandbox = await createKnowledgeApiSandbox(t);
  useKnowledgeBaseRoot(t, sandbox.knowledgeRoot);
  await writeKnowledgeMarkdown(
    sandbox.knowledgeRoot,
    "README.md",
    "# Knowledge Home\n\nRoot content.\n"
  );
  await writeKnowledgeMarkdown(
    sandbox.knowledgeRoot,
    "guides/README.md",
    "# Guides\n\nDirectory landing.\n"
  );

  mockAgentCredential("agent-key", {
    id: "agent-1",
    ownerUserId: "user-1",
    claimStatus: "ACTIVE",
  });

  const response = await getAgentKnowledgeTree(
    createRouteRequest("http://localhost/api/agent/knowledge/tree", {
      apiKey: "agent-key",
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Evory-Agent-API"), "official");
  assert.equal(json.success, true);
  assert.equal(json.data.path, "");
  assert.equal(json.data.directories[0].path, "guides");
  assert.equal(json.meta.totalDocuments, 2);
});

test("claimed agent can read a scoped official knowledge tree path", async (t) => {
  const sandbox = await createKnowledgeApiSandbox(t);
  useKnowledgeBaseRoot(t, sandbox.knowledgeRoot);
  await writeKnowledgeMarkdown(
    sandbox.knowledgeRoot,
    "guides/README.md",
    "# Guides\n\nRoot guides.\n"
  );
  await writeKnowledgeMarkdown(
    sandbox.knowledgeRoot,
    "guides/install.md",
    "# Install\n\nInstall guide.\n"
  );

  mockAgentCredential("agent-key", {
    id: "agent-1",
    ownerUserId: "user-1",
    claimStatus: "ACTIVE",
  });

  const response = await getAgentKnowledgeTree(
    createRouteRequest("http://localhost/api/agent/knowledge/tree?path=guides", {
      apiKey: "agent-key",
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(json.data.path, "guides");
  assert.equal(json.data.documents[0].path, "guides/install");
});

test("claimed agent can read the official root knowledge document", async (t) => {
  const sandbox = await createKnowledgeApiSandbox(t);
  useKnowledgeBaseRoot(t, sandbox.knowledgeRoot);
  await writeKnowledgeMarkdown(
    sandbox.knowledgeRoot,
    "README.md",
    "# Knowledge Home\n\nRoot content.\n"
  );

  mockAgentCredential("agent-key", {
    id: "agent-1",
    ownerUserId: "user-1",
    claimStatus: "ACTIVE",
  });

  const response = await getAgentKnowledgeDocuments(
    createRouteRequest("http://localhost/api/agent/knowledge/documents", {
      apiKey: "agent-key",
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Evory-Agent-API"), "official");
  assert.equal(json.success, true);
  assert.equal(json.data.path, "");
  assert.equal(json.data.isDirectoryIndex, true);
});

test("claimed agent can read the official knowledge path document", async (t) => {
  const sandbox = await createKnowledgeApiSandbox(t);
  useKnowledgeBaseRoot(t, sandbox.knowledgeRoot);
  await writeKnowledgeMarkdown(
    sandbox.knowledgeRoot,
    "guides/install/nginx.md",
    "# Nginx Install\n\nInstall nginx.\n"
  );

  mockAgentCredential("agent-key", {
    id: "agent-1",
    ownerUserId: "user-1",
    claimStatus: "ACTIVE",
  });

  const response = await getAgentKnowledgeDocumentByPath(
    createRouteRequest("http://localhost/api/agent/knowledge/documents/guides/install/nginx", {
      apiKey: "agent-key",
    }),
    createRouteParams({ slug: "guides/install/nginx" })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Evory-Agent-API"), "official");
  assert.equal(json.success, true);
  assert.equal(json.data.kind, "document");
  assert.equal(json.data.path, "guides/install/nginx");
});

test("claimed agent can read the official knowledge search endpoint without prisma article mocks", async (t) => {
  const sandbox = await createKnowledgeApiSandbox(t);
  useKnowledgeBaseRoot(t, sandbox.knowledgeRoot);
  await writeKnowledgeMarkdown(
    sandbox.knowledgeRoot,
    "guides/install/nginx.md",
    "# Nginx Install\n\nInstall nginx.\n"
  );

  mockAgentCredential("agent-key", {
    id: "agent-1",
    ownerUserId: "user-1",
    claimStatus: "ACTIVE",
  });

  const response = await getAgentKnowledgeSearch(
    createRouteRequest("http://localhost/api/agent/knowledge/search?q=nginx", {
      apiKey: "agent-key",
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Evory-Agent-API"), "official");
  assert.equal(json.success, true);
  assert.equal(json.data[0].path, "guides/install/nginx");
});
