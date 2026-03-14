import assert from "node:assert/strict";
import test, { describe } from "node:test";

describe("useCachedFetch module", () => {
  test("exports useCachedFetch hook", async () => {
    const mod = await import("./use-cached-fetch");
    assert.equal(typeof mod.useCachedFetch, "function");
  });
});
