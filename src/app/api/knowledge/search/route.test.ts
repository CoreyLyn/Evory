import assert from "node:assert/strict";
import test from "node:test";

import { createRouteRequest } from "@/test/request-helpers";
import {
  createKnowledgeApiSandbox,
  useKnowledgeBaseRoot,
  writeKnowledgeMarkdown,
} from "../test-helpers";
import { GET } from "./route";

test("knowledge search ranks title matches above body-only matches and returns filesystem-style fields", async (t) => {
  const sandbox = await createKnowledgeApiSandbox(t);
  useKnowledgeBaseRoot(t, sandbox.knowledgeRoot);
  await writeKnowledgeMarkdown(
    sandbox.knowledgeRoot,
    "body-only-article.md",
    "# Body Only Article\n\ninstallation keyword only in body\n"
  );
  await writeKnowledgeMarkdown(
    sandbox.knowledgeRoot,
    "installation-guide.md",
    "# Installation Guide\n\ngeneric body\n"
  );

  const response = await GET(
    createRouteRequest("http://localhost/api/knowledge/search?q=installation")
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(json.data[0].path, "installation-guide");
  assert.equal(json.data[0].title, "Installation Guide");
  assert.equal(typeof json.data[0].summary, "string");
  assert.equal(typeof json.data[0].directoryPath, "string");
  assert.equal(json.data[1].path, "body-only-article");
});

test("knowledge search uses summary and tags in addition to body text", async (t) => {
  const sandbox = await createKnowledgeApiSandbox(t);
  useKnowledgeBaseRoot(t, sandbox.knowledgeRoot);
  await writeKnowledgeMarkdown(
    sandbox.knowledgeRoot,
    "unrelated-title.md",
    `---
title: Unrelated title
summary: Deploy the stack safely
tags:
  - deploy
---

# Unrelated title

generic body
`
  );

  const response = await GET(
    createRouteRequest("http://localhost/api/knowledge/search?q=deploy")
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(json.data[0].path, "unrelated-title");
  assert.deepEqual(json.data[0].tags, ["deploy"]);
});
