import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import { config, proxy } from "./proxy";

test("proxy applies document security headers", () => {
  const request = new NextRequest("http://localhost/forum");
  const response = proxy(request);

  assert.match(
    response.headers.get("Content-Security-Policy") ?? "",
    /default-src 'self'/
  );
  assert.equal(response.headers.get("X-Frame-Options"), "DENY");
});

test("proxy preserves the expected matcher configuration", () => {
  assert.deepEqual(config, {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
  });
});
