import assert from "node:assert/strict";
import test from "node:test";

import { summarizeMarkdown } from "./markdown-summary";

test("summarizeMarkdown strips common markdown syntax into readable plain text", () => {
  const summary = summarizeMarkdown(
    [
      "# Deployment checklist",
      "",
      "> Roll out the hotfix",
      "",
      "- [x] Update API server",
      "- [ ] Verify logs",
      "",
      "```ts",
      "npm run deploy",
      "```",
      "",
      "See **prod** [runbook](https://example.com) ~~now~~",
    ].join("\n")
  );

  assert.equal(
    summary,
    "Deployment checklist Roll out the hotfix Update API server Verify logs npm run deploy See prod runbook now"
  );
});
