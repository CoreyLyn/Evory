import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildKnowledgeBaseIndex } from "./indexer";
import {
  searchKnowledgeDocuments,
  searchKnowledgeDocumentPreviews,
  toKnowledgeDirectoryViewModel,
  findRelatedDocuments,
  findKnowledgeDocument,
} from "./api";

async function createSandbox() {
  const root = await mkdtemp(path.join(os.tmpdir(), "evory-knowledge-base-api-"));
  const knowledgeRoot = path.join(root, "knowledge");
  await mkdir(knowledgeRoot, { recursive: true });

  return {
    knowledgeRoot,
    cleanup: async () => {
      await rm(root, { recursive: true, force: true });
    },
  };
}

async function writeMarkdown(root: string, relativePath: string, content: string) {
  const filePath = path.join(root, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
}

test("toKnowledgeDirectoryViewModel keeps nested subtree bodies out of the serialized payload", async (t) => {
  const sandbox = await createSandbox();
  t.after(async () => sandbox.cleanup());

  await writeMarkdown(
    sandbox.knowledgeRoot,
    "README.md",
    "# Home\n\nRoot landing.\n"
  );
  await writeMarkdown(
    sandbox.knowledgeRoot,
    "guides/README.md",
    "# Guides\n\nGuides landing summary.\n"
  );
  await writeMarkdown(
    sandbox.knowledgeRoot,
    "guides/nested/deep.md",
    "# Deep Doc\n\nNested secret body.\n"
  );
  await writeMarkdown(
    sandbox.knowledgeRoot,
    "root-doc.md",
    "# Root Doc\n\nRoot preview.\n"
  );

  const index = await buildKnowledgeBaseIndex({
    rootDir: sandbox.knowledgeRoot,
  });

  const viewModel = toKnowledgeDirectoryViewModel(index.root);
  const serialized = JSON.stringify(viewModel);

  assert.equal(viewModel.path, "");
  assert.equal(viewModel.directories.length, 1);
  assert.equal(viewModel.directories[0]?.path, "guides");
  assert.equal(viewModel.directories[0]?.summary, "Guides landing summary.");
  assert.equal(viewModel.documents.length, 1);
  assert.equal(viewModel.documents[0]?.path, "root-doc");
  assert.ok(!("directories" in viewModel.directories[0]));
  assert.ok(!("body" in viewModel.documents[0]));
  assert.doesNotMatch(serialized, /Nested secret body/);
});

test("searchKnowledgeDocumentPreviews omits document bodies from result cards", async (t) => {
  const sandbox = await createSandbox();
  t.after(async () => sandbox.cleanup());

  await writeMarkdown(
    sandbox.knowledgeRoot,
    "guides/install.md",
    "# Install\n\nInstall body mentions rollout token.\n"
  );

  const index = await buildKnowledgeBaseIndex({
    rootDir: sandbox.knowledgeRoot,
  });

  const results = searchKnowledgeDocumentPreviews(index, "rollout");

  assert.equal(results.length, 1);
  assert.deepEqual(results[0], {
    path: "guides/install",
    title: "Install",
    summary: "Install body mentions rollout token.",
    snippet: "Install body mentions <<rollout>> token.",
  });
  assert.ok(!("body" in results[0]));
});

test("searchKnowledgeDocuments lazily caches normalized body text for repeated queries", async (t) => {
  const sandbox = await createSandbox();
  t.after(async () => sandbox.cleanup());

  await writeMarkdown(
    sandbox.knowledgeRoot,
    "guides/install.md",
    "# Install\n\nInstallation keyword in body only.\n"
  );

  const index = await buildKnowledgeBaseIndex({
    rootDir: sandbox.knowledgeRoot,
  });

  const entry = index.searchEntriesByPath.get("guides/install");
  assert.ok(entry);
  assert.equal(entry.normalizedBody, undefined);

  const first = searchKnowledgeDocuments(index, "installation");
  assert.equal(first[0]?.path, "guides/install");
  assert.ok(typeof entry.normalizedBody === "string");

  const cachedNormalizedBody = entry.normalizedBody;
  const second = searchKnowledgeDocuments(index, "installation");

  assert.equal(second[0]?.path, "guides/install");
  assert.equal(entry.normalizedBody, cachedNormalizedBody);
});

test("searchKnowledgeDocuments matches Chinese query via token overlap", async (t) => {
  const sandbox = await createSandbox();
  t.after(async () => sandbox.cleanup());

  await writeMarkdown(
    sandbox.knowledgeRoot,
    "guides/posting.md",
    "---\ntitle: 发帖教程\nsummary: 学习如何在论坛发帖\ntags: [论坛, 发帖]\n---\n\n# 发帖教程\n\n本文介绍如何在论坛中发布帖子。\n"
  );
  await writeMarkdown(
    sandbox.knowledgeRoot,
    "guides/other.md",
    "---\ntitle: 其他指南\nsummary: 无关内容\n---\n\n# 其他指南\n\n这是一篇无关文档。\n"
  );

  const index = await buildKnowledgeBaseIndex({
    rootDir: sandbox.knowledgeRoot,
  });

  const results = searchKnowledgeDocuments(index, "如何发帖");
  assert.ok(results.length > 0, "should find results for Chinese query");
  assert.equal(results[0]?.path, "guides/posting");
});

test("searchKnowledgeDocuments matches mixed Chinese-English query", async (t) => {
  const sandbox = await createSandbox();
  t.after(async () => sandbox.cleanup());

  await writeMarkdown(
    sandbox.knowledgeRoot,
    "guides/agent-config.md",
    "---\ntitle: Agent 配置指南\nsummary: 深入了解 Agent 的配置选项\ntags: [Agent, 配置]\n---\n\n# Agent 配置指南\n\n本文介绍 Agent 配置。\n"
  );

  const index = await buildKnowledgeBaseIndex({
    rootDir: sandbox.knowledgeRoot,
  });

  const results = searchKnowledgeDocuments(index, "Agent配置");
  assert.ok(results.length > 0, "should find results for mixed query");
  assert.equal(results[0]?.path, "guides/agent-config");
});

test("searchKnowledgeDocuments substring match still takes priority over token match", async (t) => {
  const sandbox = await createSandbox();
  t.after(async () => sandbox.cleanup());

  await writeMarkdown(
    sandbox.knowledgeRoot,
    "exact.md",
    "---\ntitle: deploy guide\n---\n\n# Deploy Guide\n\nExact match content.\n"
  );
  await writeMarkdown(
    sandbox.knowledgeRoot,
    "token.md",
    "---\ntitle: how to deploy your app\n---\n\n# Deploy App\n\nToken overlap content.\n"
  );

  const index = await buildKnowledgeBaseIndex({
    rootDir: sandbox.knowledgeRoot,
  });

  const results = searchKnowledgeDocuments(index, "deploy guide");
  assert.ok(results.length >= 1);
  assert.equal(results[0]?.path, "exact", "exact substring match should rank first");
});

test("searchKnowledgeDocumentPreviews generates snippet for token-matched Chinese query", async (t) => {
  const sandbox = await createSandbox();
  t.after(async () => sandbox.cleanup());

  await writeMarkdown(
    sandbox.knowledgeRoot,
    "guides/task.md",
    "---\ntitle: 任务系统\nsummary: 任务管理说明\n---\n\n# 任务系统\n\n用户可以认领任务并完成它们。认领后状态变为进行中。\n"
  );

  const index = await buildKnowledgeBaseIndex({
    rootDir: sandbox.knowledgeRoot,
  });

  const results = searchKnowledgeDocumentPreviews(index, "认领任务");
  assert.ok(results.length > 0, "should find token-matched results");
  assert.ok(results[0]?.snippet, "should have a snippet");
  assert.ok(results[0].snippet.length > 0, "snippet should not be empty");
});

test("findRelatedDocuments returns explicit related documents first", async (t) => {
  const sandbox = await createSandbox();
  t.after(async () => sandbox.cleanup());

  await writeMarkdown(
    sandbox.knowledgeRoot,
    "guides/intro.md",
    "---\ntitle: 入门指南\nrelated: [guides/config, faq/help]\ntags: [入门]\n---\n\n# 入门指南\n"
  );
  await writeMarkdown(
    sandbox.knowledgeRoot,
    "guides/config.md",
    "---\ntitle: 配置指南\ntags: [配置]\n---\n\n# 配置指南\n"
  );
  await writeMarkdown(
    sandbox.knowledgeRoot,
    "faq/help.md",
    "---\ntitle: 帮助\ntags: [FAQ]\n---\n\n# 帮助\n"
  );

  const index = await buildKnowledgeBaseIndex({ rootDir: sandbox.knowledgeRoot });
  const doc = findKnowledgeDocument(index, "guides/intro")!;
  const related = findRelatedDocuments(index, doc);

  assert.equal(related.length, 2);
  assert.equal(related[0]?.path, "guides/config");
  assert.equal(related[1]?.path, "faq/help");
});

test("findRelatedDocuments fills remaining slots with tag-based suggestions", async (t) => {
  const sandbox = await createSandbox();
  t.after(async () => sandbox.cleanup());

  await writeMarkdown(
    sandbox.knowledgeRoot,
    "guides/intro.md",
    "---\ntitle: 入门指南\ntags: [指南, 入门]\n---\n\n# 入门指南\n"
  );
  await writeMarkdown(
    sandbox.knowledgeRoot,
    "guides/advanced.md",
    "---\ntitle: 进阶指南\ntags: [指南, 进阶]\n---\n\n# 进阶指南\n"
  );
  await writeMarkdown(
    sandbox.knowledgeRoot,
    "unrelated.md",
    "---\ntitle: 无关文档\ntags: [其他]\n---\n\n# 无关文档\n"
  );

  const index = await buildKnowledgeBaseIndex({ rootDir: sandbox.knowledgeRoot });
  const doc = findKnowledgeDocument(index, "guides/intro")!;
  const related = findRelatedDocuments(index, doc);

  assert.equal(related.length, 1);
  assert.equal(related[0]?.path, "guides/advanced");
});

test("findRelatedDocuments excludes current document from results", async (t) => {
  const sandbox = await createSandbox();
  t.after(async () => sandbox.cleanup());

  await writeMarkdown(
    sandbox.knowledgeRoot,
    "doc.md",
    "---\ntitle: Self\nrelated: [doc]\ntags: [test]\n---\n\n# Self\n"
  );

  const index = await buildKnowledgeBaseIndex({ rootDir: sandbox.knowledgeRoot });
  const doc = findKnowledgeDocument(index, "doc")!;
  const related = findRelatedDocuments(index, doc);

  assert.equal(related.length, 0);
});

test("findRelatedDocuments skips invalid related paths gracefully", async (t) => {
  const sandbox = await createSandbox();
  t.after(async () => sandbox.cleanup());

  await writeMarkdown(
    sandbox.knowledgeRoot,
    "doc.md",
    "---\ntitle: Doc\nrelated: [nonexistent, also-missing]\ntags: [test]\n---\n\n# Doc\n"
  );

  const index = await buildKnowledgeBaseIndex({ rootDir: sandbox.knowledgeRoot });
  const doc = findKnowledgeDocument(index, "doc")!;
  const related = findRelatedDocuments(index, doc);

  assert.equal(related.length, 0);
});
