import assert from "node:assert/strict";
import test from "node:test";

import AdminKnowledgePage from "./knowledge/page";

test("/admin/knowledge redirects to the unified admin knowledge tab", async () => {
  await assert.rejects(
    async () => {
      await AdminKnowledgePage();
    },
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, "NEXT_REDIRECT");
      assert.equal(
        (error as Error & { digest?: string }).digest,
        "NEXT_REDIRECT;replace;/admin?tab=knowledge;307;"
      );
      return true;
    }
  );
});
