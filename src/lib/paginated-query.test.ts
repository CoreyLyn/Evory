import assert from "node:assert/strict";
import test from "node:test";

import { runSequentialPageQuery } from "./paginated-query";

test("runSequentialPageQuery starts item and total queries without waiting for items first", async () => {
  let itemsCalled = false;
  let totalCalled = false;
  let resolveItems: ((value: string[]) => void) | undefined;

  const resultPromise = runSequentialPageQuery({
    getItems: async () => {
      itemsCalled = true;
      return await new Promise<string[]>((resolve) => {
        resolveItems = resolve;
      });
    },
    getTotal: async () => {
      totalCalled = true;
      return 3;
    },
  });

  await Promise.resolve();

  assert.equal(itemsCalled, true);
  assert.equal(totalCalled, true);

  resolveItems?.(["a", "b"]);

  const result = await resultPromise;
  assert.deepEqual(result, { items: ["a", "b"], total: 3 });
});
