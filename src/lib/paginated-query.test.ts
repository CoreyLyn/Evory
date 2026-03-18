import assert from "node:assert/strict";
import test from "node:test";

import { runSequentialPageQuery } from "./paginated-query";

test("runSequentialPageQuery waits for items before starting total query", async () => {
  let totalCalled = false;
  let resolveItems: ((value: string[]) => void) | undefined;

  const resultPromise = runSequentialPageQuery({
    getItems: async () => {
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

  assert.equal(totalCalled, false);

  resolveItems?.(["a", "b"]);

  const result = await resultPromise;
  assert.equal(totalCalled, true);
  assert.deepEqual(result, { items: ["a", "b"], total: 3 });
});
