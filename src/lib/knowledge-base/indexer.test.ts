import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildKnowledgeBaseIndex } from "./indexer";

async function createSandbox() {
  const root = await mkdtemp(path.join(os.tmpdir(), "evory-knowledge-base-indexer-"));
  const knowledgeRoot = path.join(root, "knowledge");
  await mkdir(knowledgeRoot, { recursive: true });

  return {
    root,
    knowledgeRoot,
    cleanup: async () => {
      await rm(root, { recursive: true, force: true });
    },
  };
}

async function writeMarkdown(
  root: string,
  relativePath: string,
  content: string
) {
  const filePath = path.join(root, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
}

test("buildKnowledgeBaseIndex maps README files to directory landing documents", async (t) => {
  const sandbox = await createSandbox();
  t.after(async () => sandbox.cleanup());

  await writeMarkdown(
    sandbox.knowledgeRoot,
    "README.md",
    `---
title: Knowledge Home
summary: Start here first
tags:
  - home
  - intro
---

# Welcome

This paragraph should not replace the frontmatter summary.
`
  );
  await writeMarkdown(
    sandbox.knowledgeRoot,
    "guides/install/README.md",
    `---
title: Installation Guide
summary: Learn the installation flow
---

# Install

Directory landing content.
`
  );
  await writeMarkdown(
    sandbox.knowledgeRoot,
    "guides/install/nginx.md",
    `# nginx

Install nginx with the packaged setup steps.

## Details

More content lives here.
`
  );

  const index = await buildKnowledgeBaseIndex({
    rootDir: sandbox.knowledgeRoot,
  });

  assert.equal(index.root.path, "");
  assert.equal(index.root.document?.path, "");
  assert.equal(index.root.document?.title, "Knowledge Home");
  assert.equal(index.root.document?.summary, "Start here first");
  assert.deepEqual(index.root.document?.tags, ["home", "intro"]);
  assert.equal(index.root.documents.length, 0);
  assert.equal(index.searchEntriesByPath.get("")?.title, "Knowledge Home");
  assert.equal(index.searchEntriesByPath.get("")?.summary, "Start here first");
  assert.deepEqual(index.searchEntriesByPath.get("")?.tags, ["home", "intro"]);
  assert.ok(!("body" in (index.searchEntriesByPath.get("") ?? {})));
  assert.ok(!("searchText" in (index.searchEntriesByPath.get("") ?? {})));

  const installDirectory = index.directoriesByPath.get("guides/install");
  assert.ok(installDirectory);
  assert.equal(installDirectory.document?.path, "guides/install");
  assert.equal(installDirectory.document?.title, "Installation Guide");
  assert.equal(installDirectory.document?.summary, "Learn the installation flow");
  assert.equal(installDirectory.documents.length, 1);
  assert.equal(installDirectory.documents[0]?.path, "guides/install/nginx");
  assert.equal(installDirectory.documents[0]?.title, "Nginx");
  assert.equal(
    installDirectory.documents[0]?.summary,
    "Install nginx with the packaged setup steps."
  );
  assert.equal(
    index.searchEntriesByPath.get("guides/install/nginx")?.title,
    "Nginx"
  );
  assert.equal(
    index.searchEntriesByPath.get("guides/install/nginx")?.summary,
    "Install nginx with the packaged setup steps."
  );
  assert.deepEqual(
    index.searchEntriesByPath.get("guides/install/nginx")?.tags,
    []
  );
  assert.ok(!("body" in (index.searchEntriesByPath.get("guides/install/nginx") ?? {})));
  assert.ok(!("searchText" in (index.searchEntriesByPath.get("guides/install/nginx") ?? {})));
});

test("buildKnowledgeBaseIndex rejects document paths that collide with directory landing paths", async (t) => {
  const sandbox = await createSandbox();
  t.after(async () => sandbox.cleanup());

  await writeMarkdown(
    sandbox.knowledgeRoot,
    "guides/deploy.md",
    "# Deploy\n\nFlat document.\n"
  );
  await writeMarkdown(
    sandbox.knowledgeRoot,
    "guides/deploy/README.md",
    "# Deploy Folder\n\nDirectory landing.\n"
  );

  await assert.rejects(
    () =>
      buildKnowledgeBaseIndex({
        rootDir: sandbox.knowledgeRoot,
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /collision|conflict/i);
      assert.match(error.message, /guides\/deploy/);
      return true;
    }
  );
});

test("buildKnowledgeBaseIndex treats malformed frontmatter as readable markdown", async (t) => {
  const sandbox = await createSandbox();
  t.after(async () => sandbox.cleanup());

  await writeMarkdown(
    sandbox.knowledgeRoot,
    "broken.md",
    `---
title: Broken
tags:
  - valid
  - [oops
---

# Broken Guide

Readable body still loads.
`
  );

  const index = await buildKnowledgeBaseIndex({
    rootDir: sandbox.knowledgeRoot,
  });

  const brokenDocument = index.documentsByPath.get("broken");
  assert.ok(brokenDocument);
  assert.equal(brokenDocument.title, "Broken Guide");
  assert.equal(brokenDocument.summary, "Readable body still loads.");
  assert.deepEqual(brokenDocument.tags, []);
  assert.doesNotMatch(brokenDocument.body, /^---/);
  assert.match(brokenDocument.body, /# Broken Guide/);
  assert.match(brokenDocument.body, /Readable body still loads\./);
  assert.equal(index.searchEntriesByPath.get("broken")?.title, "Broken Guide");
  assert.equal(
    index.searchEntriesByPath.get("broken")?.summary,
    "Readable body still loads."
  );
});

test("buildKnowledgeBaseIndex reuses unchanged documents from the previous index", async (t) => {
  const sandbox = await createSandbox();
  t.after(async () => sandbox.cleanup());

  await writeMarkdown(
    sandbox.knowledgeRoot,
    "README.md",
    "# Home\n\nRoot summary.\n"
  );
  await writeMarkdown(
    sandbox.knowledgeRoot,
    "guides/alpha.md",
    "# Alpha\n\nOriginal alpha body.\n"
  );
  await writeMarkdown(
    sandbox.knowledgeRoot,
    "guides/beta.md",
    "# Beta\n\nOriginal beta body.\n"
  );

  const reads: string[] = [];
  const first = await buildKnowledgeBaseIndex({
    rootDir: sandbox.knowledgeRoot,
    fileSystem: {
      readFile: async (absolutePath, encoding) => {
        reads.push(path.basename(absolutePath));
        return await readFile(absolutePath, encoding);
      },
    },
  });

  assert.deepEqual(reads.sort(), ["README.md", "alpha.md", "beta.md"]);

  await new Promise((resolve) => setTimeout(resolve, 10));
  await writeMarkdown(
    sandbox.knowledgeRoot,
    "guides/beta.md",
    "# Beta\n\nUpdated beta body.\n"
  );

  const refreshedReads: string[] = [];
  const refreshed = await buildKnowledgeBaseIndex({
    rootDir: sandbox.knowledgeRoot,
    previousIndex: first,
    fileSystem: {
      readFile: async (absolutePath, encoding) => {
        refreshedReads.push(path.basename(absolutePath));
        return await readFile(absolutePath, encoding);
      },
    },
  });

  assert.deepEqual(refreshedReads, ["beta.md"]);
  assert.equal(
    refreshed.documentsByPath.get("guides/alpha")?.body,
    "# Alpha\n\nOriginal alpha body."
  );
  assert.equal(
    refreshed.documentsByPath.get("guides/beta")?.body,
    "# Beta\n\nUpdated beta body."
  );
  assert.equal(refreshed.root.document?.summary, "Root summary.");
});
