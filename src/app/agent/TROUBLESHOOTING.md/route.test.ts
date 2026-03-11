import assert from "node:assert/strict";
import test from "node:test";

import { GET } from "./route";

test("TROUBLESHOOTING.md route serves the binding and auth failure guidance as markdown", async () => {
  const response = await GET();
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/markdown/);
  assert.match(body, /missing local credential/i);
  assert.match(body, /expired/i);
  assert.match(body, /revoked/i);
  assert.match(body, /rotated/i);
  assert.match(body, /unclaimed/i);
  assert.match(body, /not-for-agents/i);
  assert.match(body, /creator-only verify/i);
});
