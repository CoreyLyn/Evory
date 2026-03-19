import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import prisma from "@/lib/prisma";
import { createRouteRequest } from "@/test/request-helpers";
import {
  createKnowledgeApiSandbox,
  useKnowledgeBaseRoot,
  writeKnowledgeMarkdown,
} from "../test-helpers";
import { GET } from "./route";

const prismaClient = prisma as Record<string, unknown>;
const originalSiteConfig = prismaClient.siteConfig;

afterEach(() => {
  prismaClient.siteConfig = originalSiteConfig;
});

test("knowledge tree route returns the root tree payload", async (t) => {
  prismaClient.siteConfig = {
    findFirst: async () => null,
  };
  const sandbox = await createKnowledgeApiSandbox(t);
  useKnowledgeBaseRoot(t, sandbox.knowledgeRoot);
  await writeKnowledgeMarkdown(
    sandbox.knowledgeRoot,
    "README.md",
    "# Knowledge Home\n\nStart here.\n"
  );
  await writeKnowledgeMarkdown(
    sandbox.knowledgeRoot,
    "guides/README.md",
    "# Guides\n\nDirectory landing.\n"
  );
  await writeKnowledgeMarkdown(
    sandbox.knowledgeRoot,
    "guides/install.md",
    "# Install\n\nInstall guide.\n"
  );

  const response = await GET(createRouteRequest("http://localhost/api/knowledge/tree"));
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Evory-Agent-API"), "not-for-agents");
  assert.equal(json.success, true);
  assert.equal(json.data.path, "");
  assert.ok(Array.isArray(json.data.directories));
  assert.ok(Array.isArray(json.data.documents));
  assert.equal(json.data.document.path, "");
  assert.equal(json.data.directories[0].path, "guides");
  assert.equal(json.meta.totalDocuments, 3);
  assert.ok(!("directories" in json.data.directories[0]));
  assert.ok(!("documents" in json.data.directories[0]));
});

test("knowledge tree route returns a shallow subdirectory payload when path is provided", async (t) => {
  prismaClient.siteConfig = {
    findFirst: async () => null,
  };
  const sandbox = await createKnowledgeApiSandbox(t);
  useKnowledgeBaseRoot(t, sandbox.knowledgeRoot);
  await writeKnowledgeMarkdown(
    sandbox.knowledgeRoot,
    "guides/README.md",
    "# Guides\n\nDirectory landing.\n"
  );
  await writeKnowledgeMarkdown(
    sandbox.knowledgeRoot,
    "guides/install.md",
    "# Install\n\nInstall guide.\n"
  );
  await writeKnowledgeMarkdown(
    sandbox.knowledgeRoot,
    "guides/nested/deep.md",
    "# Deep\n\nDeep guide.\n"
  );

  const response = await GET(
    createRouteRequest("http://localhost/api/knowledge/tree?path=guides")
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(json.data.path, "guides");
  assert.equal(json.data.document.path, "guides");
  assert.equal(json.data.documents[0].path, "guides/install");
  assert.equal(json.data.directories[0].path, "guides/nested");
  assert.ok(!("directories" in json.data.directories[0]));
  assert.ok(!("documents" in json.data.directories[0]));
});

test("knowledge tree route returns 404 for an unknown directory path", async (t) => {
  prismaClient.siteConfig = {
    findFirst: async () => null,
  };
  const sandbox = await createKnowledgeApiSandbox(t);
  useKnowledgeBaseRoot(t, sandbox.knowledgeRoot);
  await writeKnowledgeMarkdown(
    sandbox.knowledgeRoot,
    "README.md",
    "# Knowledge Home\n\nStart here.\n"
  );

  const response = await GET(
    createRouteRequest("http://localhost/api/knowledge/tree?path=missing")
  );
  const json = await response.json();

  assert.equal(response.status, 404);
  assert.equal(json.success, false);
  assert.equal(json.error, "Directory not found");
});

test("knowledge tree route reports an explicit not-configured state", async (t) => {
  prismaClient.siteConfig = {
    findFirst: async () => null,
  };
  const sandbox = await createKnowledgeApiSandbox(t);
  useKnowledgeBaseRoot(t, sandbox.missingKnowledgeRoot);

  const response = await GET(createRouteRequest("http://localhost/api/knowledge/tree"));
  const json = await response.json();

  assert.equal(response.status, 503);
  assert.equal(json.success, false);
  assert.equal(json.error, "Knowledge base not configured");
});
