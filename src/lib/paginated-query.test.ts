import assert from "node:assert/strict";
import test from "node:test";

import { runSequentialPageQuery } from "./paginated-query";

test("runSequentialPageQuery avoids overlapping pagination queries", async () => {
  let activeQueries = 0;
  let maxActiveQueries = 0;
  const events: string[] = [];

  function createQuery<T>(label: string, value: T) {
    return async () => {
      activeQueries += 1;
      maxActiveQueries = Math.max(maxActiveQueries, activeQueries);
      events.push(`${label}:start:${activeQueries}`);

      assert.equal(activeQueries, 1, `${label} query overlapped with another query`);

      await new Promise((resolve) => setTimeout(resolve, 10));

      events.push(`${label}:end`);
      activeQueries -= 1;

      return value;
    };
  }

  const result = await runSequentialPageQuery({
    getItems: createQuery("items", ["a", "b"]),
    getTotal: createQuery("total", 2),
  });

  assert.deepEqual(result, {
    items: ["a", "b"],
    total: 2,
  });
  assert.equal(maxActiveQueries, 1);
  assert.deepEqual(events, [
    "items:start:1",
    "items:end",
    "total:start:1",
    "total:end",
  ]);
});
