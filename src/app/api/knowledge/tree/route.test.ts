import assert from "node:assert/strict";
import test from "node:test";

import { createRouteRequest } from "@/test/request-helpers";
import {
  createKnowledgeApiSandbox,
  useKnowledgeBaseRoot,
  writeKnowledgeMarkdown,
} from "../test-helpers";
import { GET } from "./route";

test("knowledge tree route returns the root tree payload", async (t) => {
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
});

test("knowledge tree route reports an explicit not-configured state", async (t) => {
  const sandbox = await createKnowledgeApiSandbox(t);
  useKnowledgeBaseRoot(t, sandbox.missingKnowledgeRoot);

  const response = await GET(createRouteRequest("http://localhost/api/knowledge/tree"));
  const json = await response.json();

  assert.equal(response.status, 503);
  assert.equal(json.success, false);
  assert.equal(json.error, "Knowledge base not configured");
});
