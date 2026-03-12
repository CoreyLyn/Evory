import assert from "node:assert/strict";
import test from "node:test";

import { createRouteParams, createRouteRequest } from "@/test/request-helpers";
import {
  createKnowledgeApiSandbox,
  useKnowledgeBaseRoot,
  writeKnowledgeMarkdown,
} from "../../test-helpers";
import { GET } from "./route";

test("knowledge path route returns a directory landing payload", async (t) => {
  const sandbox = await createKnowledgeApiSandbox(t);
  useKnowledgeBaseRoot(t, sandbox.knowledgeRoot);
  await writeKnowledgeMarkdown(
    sandbox.knowledgeRoot,
    "guides/install/README.md",
    "# Install Directory\n\nDirectory landing.\n"
  );
  await writeKnowledgeMarkdown(
    sandbox.knowledgeRoot,
    "guides/install/nginx.md",
    "# nginx\n\nDocument body.\n"
  );

  const response = await GET(
    createRouteRequest("http://localhost/api/knowledge/documents/guides/install"),
    createRouteParams({ slug: "guides/install" })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(json.data.kind, "directory");
  assert.equal(json.data.path, "guides/install");
  assert.equal(json.data.document.path, "guides/install");
});

test("knowledge path route returns a regular document payload", async (t) => {
  const sandbox = await createKnowledgeApiSandbox(t);
  useKnowledgeBaseRoot(t, sandbox.knowledgeRoot);
  await writeKnowledgeMarkdown(
    sandbox.knowledgeRoot,
    "guides/install/nginx.md",
    "# nginx\n\nDocument body.\n"
  );

  const response = await GET(
    createRouteRequest("http://localhost/api/knowledge/documents/guides/install/nginx"),
    createRouteParams({ slug: "guides/install/nginx" })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(json.data.kind, "document");
  assert.equal(json.data.path, "guides/install/nginx");
  assert.equal(typeof json.data.body, "string");
});

test("knowledge path route returns 404 for unknown paths", async (t) => {
  const sandbox = await createKnowledgeApiSandbox(t);
  useKnowledgeBaseRoot(t, sandbox.knowledgeRoot);

  const response = await GET(
    createRouteRequest("http://localhost/api/knowledge/documents/missing/path"),
    createRouteParams({ slug: "missing/path" })
  );
  const json = await response.json();

  assert.equal(response.status, 404);
  assert.equal(json.success, false);
  assert.equal(json.error, "Document not found");
});
