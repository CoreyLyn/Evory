import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applySecurityHeaders,
  buildSecurityHeaders,
} from "./security-headers";

test("buildSecurityHeaders includes CSP for document responses", () => {
  const headers = buildSecurityHeaders({
    kind: "document",
    isDevelopment: false,
  });

  assert.match(headers.get("Content-Security-Policy") ?? "", /default-src 'self'/);
  assert.equal(headers.get("X-Frame-Options"), "DENY");
  assert.equal(headers.get("Referrer-Policy"), "strict-origin-when-cross-origin");
  assert.equal(headers.get("X-Content-Type-Options"), "nosniff");
  assert.match(headers.get("Permissions-Policy") ?? "", /camera=\(\)/);
});

test("buildSecurityHeaders keeps API responses free of document CSP", () => {
  const headers = buildSecurityHeaders({
    kind: "api",
    isDevelopment: false,
  });

  assert.equal(headers.has("Content-Security-Policy"), false);
  assert.equal(headers.get("X-Frame-Options"), "DENY");
});

test("applySecurityHeaders preserves API content type", async () => {
  const response = applySecurityHeaders(
    Response.json({ success: true }),
    {
      kind: "api",
      isDevelopment: false,
    }
  );
  const json = await response.json();

  assert.equal(response.headers.get("content-type"), "application/json");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(json.success, true);
});
