import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import prisma from "@/lib/prisma";
import {
  createAgentCredentialFixture,
  createAgentFixture,
  createForumPostFixture,
  createForumPostTagFixture,
  createSecurityEventFixture,
  createShopItemFixture,
  createTaskFixture,
  createUserFixture,
} from "@/test/factories";
import { createRouteParams, createRouteRequest } from "@/test/request-helpers";
import { hashApiKey } from "@/lib/auth";
import { GET as getAgentForumPosts } from "./forum/posts/route";
import { GET as getAgentKnowledgeTree } from "./knowledge/tree/route";
import { GET as getAgentKnowledgeDocuments } from "./knowledge/documents/route";
import { GET as getAgentKnowledgeDocumentByPath } from "./knowledge/documents/[...slug]/route";
import { GET as getAgentKnowledgeSearch } from "./knowledge/search/route";
import { GET as getAgentInventory } from "./inventory/route";
import { GET as getAgentPointsBalance } from "./points/balance/route";
import { GET as getAgentShop } from "./shop/route";
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
  siteConfig?: {
    findFirst: AsyncMethod<[], unknown>;
  };
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
  agentActivity?: {
    create: AsyncMethod;
  };
  dailyCheckin: {
    findUnique: AsyncMethod;
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
  shopItem: {
    findMany: AsyncMethod;
  };
  agentInventory: {
    findMany: AsyncMethod;
  };
  forumTag?: {
    findMany: AsyncMethod;
  };
  forumPostTag?: {
    findMany: AsyncMethod;
  };
};

const prismaClient = prisma as unknown as AgentReadPrismaMock;
const originalSiteConfig = prismaClient.siteConfig;
const originalAgentFindUnique = prismaClient.agent.findUnique;
const originalAgentFindMany = prismaClient.agent.findMany;
const originalAgentUpdate = prismaClient.agent.update;
const originalCredentialFindUnique = prismaClient.agentCredential?.findUnique;
const originalCredentialUpdate = prismaClient.agentCredential?.update;
const originalAgentActivityCreate = prismaClient.agentActivity?.create;
const originalDailyCheckinFindUnique = prismaClient.dailyCheckin.findUnique;
const originalSecurityEventCreate = prismaClient.securityEvent?.create;
const originalTaskFindMany = prismaClient.task.findMany;
const originalTaskCount = prismaClient.task.count;
const originalForumPostFindMany = prismaClient.forumPost.findMany;
const originalForumPostCount = prismaClient.forumPost.count;
const originalShopItemFindMany = prismaClient.shopItem.findMany;
const originalAgentInventoryFindMany = prismaClient.agentInventory.findMany;
const originalForumTagFindMany = prismaClient.forumTag?.findMany;
const originalForumPostTagFindMany = prismaClient.forumPostTag?.findMany;

beforeEach(() => {
  prismaClient.siteConfig = {
    findFirst: async () => null,
  };
  prismaClient.agentActivity = {
    create: async () => ({ id: "activity-1" }),
  };
  prismaClient.dailyCheckin.findUnique = async () => ({
    id: "checkin-1",
    actions: { DAILY_LOGIN: true },
  });
  prismaClient.securityEvent = {
    create: async () => createSecurityEventFixture(),
  };
  prismaClient.forumTag = {
    findMany: async () => [],
  };
  prismaClient.forumPostTag = {
    findMany: async ({ where }: { where?: { postId?: { in?: string[] } } }) =>
      (where?.postId?.in ?? []).map((postId, index) =>
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
      ),
  };
  prismaClient.agent.findMany = async ({ where }: { where?: { id?: { in?: string[] } } }) =>
    (where?.id?.in ?? []).map((id) => {
      const { name, type } = createAgentFixture({ id });
      return { id, name, type };
    });
});

afterEach(() => {
  prismaClient.siteConfig = originalSiteConfig;
  prismaClient.agent.findUnique = originalAgentFindUnique;
  prismaClient.agent.findMany = originalAgentFindMany;
  prismaClient.agent.update = originalAgentUpdate;
  if (prismaClient.agentCredential && originalCredentialFindUnique) {
    prismaClient.agentCredential.findUnique = originalCredentialFindUnique;
  }
  if (prismaClient.agentCredential && originalCredentialUpdate) {
    prismaClient.agentCredential.update = originalCredentialUpdate;
  }
  if (prismaClient.agentActivity && originalAgentActivityCreate) {
    prismaClient.agentActivity.create = originalAgentActivityCreate;
  }
  prismaClient.dailyCheckin.findUnique = originalDailyCheckinFindUnique;
  if (prismaClient.securityEvent && originalSecurityEventCreate) {
    prismaClient.securityEvent.create = originalSecurityEventCreate;
  }
  prismaClient.task.findMany = originalTaskFindMany;
  prismaClient.task.count = originalTaskCount;
  prismaClient.forumPost.findMany = originalForumPostFindMany;
  prismaClient.forumPost.count = originalForumPostCount;
  prismaClient.shopItem.findMany = originalShopItemFindMany;
  prismaClient.agentInventory.findMany = originalAgentInventoryFindMany;
  if (prismaClient.forumTag && originalForumTagFindMany) {
    prismaClient.forumTag.findMany = originalForumTagFindMany;
  }
  if (prismaClient.forumPostTag && originalForumPostTagFindMany) {
    prismaClient.forumPostTag.findMany = originalForumPostTagFindMany;
  }
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

test("claimed agent can read the official shop catalog", async () => {
  mockAgentCredential("agent-key", {
    id: "agent-1",
    ownerUserId: "user-1",
    claimStatus: "ACTIVE",
  });
  prismaClient.shopItem.findMany = async () => [createShopItemFixture()];

  const response = await getAgentShop(
    createRouteRequest("http://localhost/api/agent/shop", {
      apiKey: "agent-key",
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Evory-Agent-API"), "official");
  assert.equal(json.success, true);
  assert.equal(json.data[0].id, "crown");
});

test("claimed agent can read the official points balance", async () => {
  mockAgentCredential("agent-key", {
    id: "agent-1",
    ownerUserId: "user-1",
    claimStatus: "ACTIVE",
  });
  prismaClient.agent.findUnique = async () => ({ points: 25 });

  const response = await getAgentPointsBalance(
    createRouteRequest("http://localhost/api/agent/points/balance", {
      apiKey: "agent-key",
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Evory-Agent-API"), "official");
  assert.equal(json.success, true);
  assert.equal(json.data.balance, 25);
});

test("claimed agent can read the official inventory", async () => {
  mockAgentCredential("agent-key", {
    id: "agent-1",
    ownerUserId: "user-1",
    claimStatus: "ACTIVE",
  });
  prismaClient.agentInventory.findMany = async () => [
    {
      id: "inventory-1",
      agentId: "agent-1",
      itemId: "crown",
      equipped: true,
      purchasedAt: "2026-03-10T00:00:00.000Z",
      item: createShopItemFixture(),
    },
  ];

  const response = await getAgentInventory(
    createRouteRequest("http://localhost/api/agent/inventory", {
      apiKey: "agent-key",
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Evory-Agent-API"), "official");
  assert.equal(json.success, true);
  assert.equal(json.data[0].itemId, "crown");
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

test("agent task validation returns a revoked reason for revoked credentials", async () => {
  prismaClient.agentCredential = {
    findUnique: async () =>
      createAgentCredentialFixture({
        id: "credential-revoked",
        keyHash: hashApiKey("agent-key"),
        revokedAt: new Date("2026-03-10T00:00:00.000Z"),
        agent: createAgentFixture({
          id: "agent-1",
          claimStatus: "ACTIVE",
        }),
      }),
    update: async () => createAgentCredentialFixture(),
  };

  const response = await getAgentTasks(
    createRouteRequest("http://localhost/api/agent/tasks", {
      apiKey: "agent-key",
    })
  );
  const json = await response.json();

  assert.equal(response.status, 401);
  assert.equal(response.headers.get("X-Evory-Agent-API"), "official");
  assert.equal(json.error, "Unauthorized: Agent credential revoked");
  assert.equal(json.reason, "revoked");
});

test("agent task validation returns an expired reason for expired credentials", async () => {
  prismaClient.agentCredential = {
    findUnique: async () =>
      createAgentCredentialFixture({
        id: "credential-expired",
        keyHash: hashApiKey("agent-key"),
        expiresAt: new Date("2026-03-01T00:00:00.000Z"),
        agent: createAgentFixture({
          id: "agent-1",
          claimStatus: "ACTIVE",
        }),
      }),
    update: async () => createAgentCredentialFixture(),
  };

  const response = await getAgentTasks(
    createRouteRequest("http://localhost/api/agent/tasks", {
      apiKey: "agent-key",
    })
  );
  const json = await response.json();

  assert.equal(response.status, 401);
  assert.equal(response.headers.get("X-Evory-Agent-API"), "official");
  assert.equal(json.error, "Unauthorized: Agent credential expired");
  assert.equal(json.reason, "expired");
});

test("agent task validation returns an inactive-agent reason for unclaimed agents", async () => {
  mockAgentCredential("agent-key", {
    id: "agent-1",
    ownerUserId: null,
    claimStatus: "UNCLAIMED",
    claimedAt: null,
  });

  const response = await getAgentTasks(
    createRouteRequest("http://localhost/api/agent/tasks", {
      apiKey: "agent-key",
    })
  );
  const json = await response.json();

  assert.equal(response.status, 401);
  assert.equal(response.headers.get("X-Evory-Agent-API"), "official");
  assert.equal(json.error, "Unauthorized: Agent is not active");
  assert.equal(json.reason, "inactive-agent");
});

test("agent task validation returns a not-found reason for unknown credentials", async () => {
  prismaClient.agentCredential = {
    findUnique: async () => null,
    update: async () => createAgentCredentialFixture(),
  };

  const response = await getAgentTasks(
    createRouteRequest("http://localhost/api/agent/tasks", {
      apiKey: "missing-agent-key",
    })
  );
  const json = await response.json();

  assert.equal(response.status, 401);
  assert.equal(response.headers.get("X-Evory-Agent-API"), "official");
  assert.equal(json.error, "Unauthorized: Agent credential not found");
  assert.equal(json.reason, "not-found");
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

test("claimed agent knowledge reads promote an offline agent to READING", async (t) => {
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
    status: "OFFLINE",
  });

  const updateCalls: Array<Record<string, unknown>> = [];
  prismaClient.agent.update = async ({
    where,
    data,
  }: {
    where: { id: string };
    data: Record<string, unknown>;
  }) => {
    updateCalls.push(data);

    return createAgentFixture({
      id: where.id,
      apiKey: "agent-key",
      ownerUserId: "user-1",
      claimStatus: "ACTIVE",
      status:
        typeof data.status === "string" ? data.status : "OFFLINE",
    });
  };

  const response = await getAgentKnowledgeTree(
    createRouteRequest("http://localhost/api/agent/knowledge/tree", {
      apiKey: "agent-key",
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Evory-Agent-API"), "official");
  assert.equal(json.success, true);
  assert.ok(
    updateCalls.some(
      (data) =>
        data.status === "READING" && data.statusExpiresAt instanceof Date
    )
  );
});

test("claimed agent forum reads promote the agent to FORUM", async () => {
  mockAgentCredential("agent-key", {
    id: "agent-1",
    ownerUserId: "user-1",
    claimStatus: "ACTIVE",
    status: "OFFLINE",
  });

  const updateCalls: Array<Record<string, unknown>> = [];
  prismaClient.agent.update = async ({
    where,
    data,
  }: {
    where: { id: string };
    data: Record<string, unknown>;
  }) => {
    updateCalls.push(data);

    return createAgentFixture({
      id: where.id,
      apiKey: "agent-key",
      ownerUserId: "user-1",
      claimStatus: "ACTIVE",
      status: typeof data.status === "string" ? data.status : "OFFLINE",
    });
  };
  prismaClient.forumPost.findMany = async () => [createForumPostFixture()];
  prismaClient.forumPost.count = async () => 1;

  const response = await getAgentForumPosts(
    createRouteRequest("http://localhost/api/agent/forum/posts", {
      apiKey: "agent-key",
    })
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Evory-Agent-API"), "official");
  assert.ok(
    updateCalls.some(
      (data) =>
        data.status === "FORUM" && data.statusExpiresAt instanceof Date
    )
  );
});

test("claimed agent task reads promote the agent to TASKBOARD", async () => {
  mockAgentCredential("agent-key", {
    id: "agent-1",
    ownerUserId: "user-1",
    claimStatus: "ACTIVE",
    status: "OFFLINE",
  });

  const updateCalls: Array<Record<string, unknown>> = [];
  prismaClient.agent.update = async ({
    where,
    data,
  }: {
    where: { id: string };
    data: Record<string, unknown>;
  }) => {
    updateCalls.push(data);

    return createAgentFixture({
      id: where.id,
      apiKey: "agent-key",
      ownerUserId: "user-1",
      claimStatus: "ACTIVE",
      status: typeof data.status === "string" ? data.status : "OFFLINE",
    });
  };
  prismaClient.task.findMany = async () => [createTaskFixture()];
  prismaClient.task.count = async () => 1;
  prismaClient.agent.findMany = async () => [
    createAgentFixture({
      id: "creator-1",
      name: "Creator",
    }),
    createAgentFixture({
      id: "assignee-1",
      name: "Assignee",
    }),
  ];

  const response = await getAgentTasks(
    createRouteRequest("http://localhost/api/agent/tasks", {
      apiKey: "agent-key",
    })
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Evory-Agent-API"), "official");
  assert.ok(
    updateCalls.some(
      (data) =>
        data.status === "TASKBOARD" && data.statusExpiresAt instanceof Date
    )
  );
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

test("claimed agent task reads return 403 when public content is disabled", async () => {
  prismaClient.siteConfig = {
    findFirst: async () => ({
      id: "site-config-singleton",
      registrationEnabled: true,
      publicContentEnabled: false,
    }),
  };
  mockAgentCredential("agent-key", {
    id: "agent-1",
    ownerUserId: "user-1",
    claimStatus: "ACTIVE",
  });

  const response = await getAgentTasks(
    createRouteRequest("http://localhost/api/agent/tasks", {
      apiKey: "agent-key",
    })
  );
  const json = await response.json();

  assert.equal(response.status, 403);
  assert.equal(response.headers.get("X-Evory-Agent-API"), "official");
  assert.equal(json.code, "PUBLIC_CONTENT_DISABLED");
});

test("admin-owned agents can read the official task feed when public content is disabled", async () => {
  prismaClient.siteConfig = {
    findFirst: async () => ({
      id: "site-config-singleton",
      registrationEnabled: true,
      publicContentEnabled: false,
    }),
  };
  mockAgentCredential("agent-key", {
    id: "agent-1",
    ownerUserId: "admin-1",
    owner: createUserFixture({ id: "admin-1", role: "ADMIN" }),
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

test("admin-owned agents can read the official knowledge tree when public content is disabled", async (t) => {
  const sandbox = await createKnowledgeApiSandbox(t);
  useKnowledgeBaseRoot(t, sandbox.knowledgeRoot);
  await writeKnowledgeMarkdown(
    sandbox.knowledgeRoot,
    "README.md",
    "# Knowledge Home\n\nRoot content.\n"
  );

  prismaClient.siteConfig = {
    findFirst: async () => ({
      id: "site-config-singleton",
      registrationEnabled: true,
      publicContentEnabled: false,
    }),
  };
  mockAgentCredential("agent-key", {
    id: "agent-1",
    ownerUserId: "admin-1",
    owner: createUserFixture({ id: "admin-1", role: "ADMIN" }),
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
});
