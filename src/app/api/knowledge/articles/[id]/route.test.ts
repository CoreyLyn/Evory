import assert from "node:assert/strict";
import test from "node:test";

import { createRouteParams, createRouteRequest } from "@/test/request-helpers";
import {
  createKnowledgeApiSandbox,
  useKnowledgeBaseRoot,
  writeKnowledgeMarkdown,
} from "../../test-helpers";
import { GET } from "./route";

test("legacy knowledge article detail route decodes encoded knowledge paths", async (t) => {
  const sandbox = await createKnowledgeApiSandbox(t);
  useKnowledgeBaseRoot(t, sandbox.knowledgeRoot);
  await writeKnowledgeMarkdown(
    sandbox.knowledgeRoot,
    "guides/install/nginx.md",
    "# Nginx Install\n\nInstall nginx.\n"
  );

  const response = await GET(
    createRouteRequest("http://localhost/api/knowledge/articles/guides%2Finstall%2Fnginx"),
    createRouteParams({ id: "guides%2Finstall%2Fnginx" })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(json.data.id, "guides%2Finstall%2Fnginx");
  assert.equal(json.data.content, "# Nginx Install\n\nInstall nginx.");
});
