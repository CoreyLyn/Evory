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

test("knowledge documents root route returns the root README document", async (t) => {
  prismaClient.siteConfig = {
    findFirst: async () => null,
  };
  const sandbox = await createKnowledgeApiSandbox(t);
  useKnowledgeBaseRoot(t, sandbox.knowledgeRoot);
  await writeKnowledgeMarkdown(
    sandbox.knowledgeRoot,
    "README.md",
    "# Knowledge Home\n\nRoot content.\n"
  );

  const response = await GET(
    createRouteRequest("http://localhost/api/knowledge/documents")
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(json.data.path, "");
  assert.equal(json.data.isDirectoryIndex, true);
  assert.equal(typeof json.data.body, "string");
});

test("knowledge documents root route returns not found when the root README is absent", async (t) => {
  prismaClient.siteConfig = {
    findFirst: async () => null,
  };
  const sandbox = await createKnowledgeApiSandbox(t);
  useKnowledgeBaseRoot(t, sandbox.knowledgeRoot);

  const response = await GET(
    createRouteRequest("http://localhost/api/knowledge/documents")
  );
  const json = await response.json();

  assert.equal(response.status, 404);
  assert.equal(json.success, false);
  assert.equal(json.error, "Document not found");
});
