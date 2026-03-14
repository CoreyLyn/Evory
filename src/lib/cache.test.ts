import assert from "node:assert/strict";
import test, { describe } from "node:test";

describe("MemoryCache", () => {
  test("get returns null for missing key", async () => {
    const { createCache } = await import("./cache");
    const cache = createCache();
    assert.equal(cache.get("missing"), null);
  });

  test("set and get within TTL", async () => {
    const { createCache } = await import("./cache");
    const cache = createCache();
    cache.set("key", { value: 42 }, 60_000);
    assert.deepEqual(cache.get("key"), { value: 42 });
  });

  test("returns null after TTL expires", async () => {
    const { createCache } = await import("./cache");
    const cache = createCache();
    cache.set("key", "data", 1);
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(cache.get("key"), null);
  });

  test("invalidate removes matching keys", async () => {
    const { createCache } = await import("./cache");
    const cache = createCache();
    cache.set("forum:posts:1", "a", 60_000);
    cache.set("forum:posts:2", "b", 60_000);
    cache.set("tasks:list", "c", 60_000);
    cache.invalidate("forum:posts");
    assert.equal(cache.get("forum:posts:1"), null);
    assert.equal(cache.get("forum:posts:2"), null);
    assert.deepEqual(cache.get("tasks:list"), "c");
  });
});
