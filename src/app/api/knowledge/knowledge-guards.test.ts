import assert from "node:assert/strict";
import test from "node:test";
import { createRouteRequest } from "@/test/request-helpers";
import { POST as postLegacyKnowledgeArticle } from "./articles/route";

test("legacy knowledge publish route is explicitly unsupported after cutover", async () => {
  const response = await postLegacyKnowledgeArticle(
    createRouteRequest("http://localhost/api/knowledge/articles", {
      method: "POST",
      json: {
        title: "Legacy article",
        content: "This should be rejected",
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 410);
  assert.equal(response.headers.get("X-Evory-Agent-API"), "not-for-agents");
  assert.equal(json.success, false);
  assert.equal(json.error, "Knowledge publishing has moved out of Evory");
});
