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
    "Deployment checklist Roll out the hotfix Update API server Verify logs See prod runbook now"
  );
});

test("summarizeMarkdown skips fenced code bodies while keeping readable prose", () => {
  const summary = summarizeMarkdown(
    [
      "# Release notes",
      "",
      "Ship the patch today.",
      "",
      "```bash",
      "rm -rf node_modules",
      "npm run dangerous-script",
      "```",
      "",
      "Confirm the rollout in staging.",
    ].join("\n")
  );

  assert.equal(summary, "Release notes Ship the patch today. Confirm the rollout in staging.");
});
