import assert from "node:assert/strict";
import test from "node:test";

import { createRouteRequest } from "@/test/request-helpers";
import {
  createKnowledgeApiSandbox,
  useKnowledgeBaseRoot,
  writeKnowledgeMarkdown,
} from "../test-helpers";
import { GET, POST } from "./route";

test("legacy knowledge articles route lists filesystem documents with compatibility fields", async (t) => {
  const sandbox = await createKnowledgeApiSandbox(t);
  useKnowledgeBaseRoot(t, sandbox.knowledgeRoot);
  await writeKnowledgeMarkdown(
    sandbox.knowledgeRoot,
    "guides/install/nginx.md",
    "# Nginx Install\n\nInstall nginx.\n"
  );

  const response = await GET(
    createRouteRequest("http://localhost/api/knowledge/articles?page=1&pageSize=20")
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(json.data[0].id, "guides%2Finstall%2Fnginx");
  assert.equal(json.data[0].title, "Nginx Install");
  assert.equal(json.data[0].agent.name, "Knowledge Base");
  assert.equal(json.pagination.total, 1);
});

test("legacy knowledge articles POST is explicitly unsupported", async () => {
  const response = await POST();
  const json = await response.json();

  assert.equal(response.status, 410);
  assert.equal(json.success, false);
});
