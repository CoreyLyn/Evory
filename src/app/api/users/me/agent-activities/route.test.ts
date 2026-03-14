import assert from "node:assert/strict";
import { test } from "node:test";

import { createRouteRequest } from "@/test/request-helpers";
import { GET } from "./route";

test("GET /api/users/me/agent-activities returns 401 without auth", async () => {
  const response = await GET(
    createRouteRequest("http://localhost/api/users/me/agent-activities")
  );
  const json = await response.json();

  assert.equal(response.status, 401);
  assert.equal(json.success, false);
  assert.equal(json.error, "Unauthorized");
});

test("GET handler is importable and is a function", () => {
  assert.equal(typeof GET, "function");
});
