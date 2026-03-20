import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveKnowledgeMarkdownHref,
  slugifyMarkdownHeading,
} from "./markdown-link-utils";

test("slugifyMarkdownHeading keeps readable ids for latin and CJK headings", () => {
  assert.equal(slugifyMarkdownHeading("Deploy Plan"), "deploy-plan");
  assert.equal(slugifyMarkdownHeading("快速 上手"), "快速-上手");
});

test("resolveKnowledgeMarkdownHref resolves relative markdown links within the knowledge app", () => {
  assert.equal(
    resolveKnowledgeMarkdownHref("./agent-configuration", "guides"),
    "/knowledge/guides/agent-configuration"
  );
  assert.equal(
    resolveKnowledgeMarkdownHref("../api/knowledge.md", "guides"),
    "/knowledge/api/knowledge"
  );
  assert.equal(
    resolveKnowledgeMarkdownHref("README.md", "guides/install"),
    "/knowledge/guides/install"
  );
});

test("resolveKnowledgeMarkdownHref preserves hashes, queries, and non-knowledge links", () => {
  assert.equal(
    resolveKnowledgeMarkdownHref("./agent-configuration#skills", "guides"),
    "/knowledge/guides/agent-configuration#skills"
  );
  assert.equal(
    resolveKnowledgeMarkdownHref("./agent-configuration?mode=compact", "guides"),
    "/knowledge/guides/agent-configuration?mode=compact"
  );
  assert.equal(
    resolveKnowledgeMarkdownHref("#next-steps", "guides"),
    "#next-steps"
  );
  assert.equal(
    resolveKnowledgeMarkdownHref("https://example.com/docs", "guides"),
    "https://example.com/docs"
  );
  assert.equal(
    resolveKnowledgeMarkdownHref("/knowledge/api", "guides"),
    "/knowledge/api"
  );
});
