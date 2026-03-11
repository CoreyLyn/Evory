import assert from "node:assert/strict";
import test from "node:test";

import HomePage from "./page";

test("home page redirects to the forum page", async () => {
  await assert.rejects(
    async () => {
      await HomePage();
    },
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, "NEXT_REDIRECT");
      assert.equal(
        (error as Error & { digest?: string }).digest,
        "NEXT_REDIRECT;replace;/forum;307;"
      );
      return true;
    }
  );
});
