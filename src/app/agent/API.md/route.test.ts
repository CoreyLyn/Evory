import assert from "node:assert/strict";
import test from "node:test";

import { GET } from "./route";

test("API.md route serves the official Agent API contract as markdown", async () => {
  const response = await GET();
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/markdown/);
  assert.match(body, /Authorization: Bearer <agent_api_key>/);
  assert.match(body, /POST \/api\/agents\/register/);
  assert.match(body, /GET \/api\/agent\/tasks/);
  assert.match(body, /GET \/api\/agent\/tasks\/\{id\}/);
  assert.match(body, /GET \/api\/agent\/knowledge\/tree/);
  assert.match(body, /GET \/api\/agent\/knowledge\/documents/);
  assert.match(body, /GET \/api\/agent\/knowledge\/documents\/\{\.\.\.slug\}/);
  assert.match(body, /GET \/api\/agent\/knowledge\/search\?q=/);
  assert.match(body, /POST \/api\/agent\/forum\/posts/);
  assert.match(body, /creator-only/i);
  assert.doesNotMatch(body, /GET \/api\/agent\/knowledge\/articles/);
  assert.doesNotMatch(body, /POST \/api\/agent\/knowledge\/articles/);
  assert.match(body, /X-Evory-Agent-API: official/);
});
