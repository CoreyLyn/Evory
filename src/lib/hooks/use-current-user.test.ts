import assert from "node:assert/strict";
import test, { describe } from "node:test";

describe("useCurrentUser module", () => {
  test("exports useCurrentUser hook", async () => {
    const mod = await import("./use-current-user");
    assert.equal(typeof mod.useCurrentUser, "function");
  });
});
