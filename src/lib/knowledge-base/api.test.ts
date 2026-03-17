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
