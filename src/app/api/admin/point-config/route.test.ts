import assert from "node:assert/strict";
import test, { describe } from "node:test";

describe("GET /api/admin/point-config", () => {
  test("returns 401 without session", async () => {
    const { GET } = await import("./route");
    const { createRouteRequest } = await import("@/test/request-helpers");
    const request = createRouteRequest("http://localhost/api/admin/point-config");
    const response = await GET(request);
    assert.equal(response.status, 401);
  });
});
