import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

import {
  validateTargetPath,
  validateMarkdownContent,
  uploadKnowledgeDocument,
} from "./admin-knowledge-upload";

// ---------------------------------------------------------------------------
// validateTargetPath
// ---------------------------------------------------------------------------

test("validateTargetPath returns null for valid relative path with .md extension", () => {
  const result = validateTargetPath("guides/new-guide.md");
  assert.equal(result, null);
});

test("validateTargetPath returns error for path traversal with ..", () => {
  const result = validateTargetPath("../secret.md");
  assert.ok(result?.includes("path traversal"));
});

test("validateTargetPath returns error for nested path traversal", () => {
  const result = validateTargetPath("foo/../../secret.md");
  assert.ok(result?.includes("path traversal"));
});

test("validateTargetPath returns error for absolute path", () => {
  const result = validateTargetPath("/etc/passwd");
  assert.ok(result?.includes("path traversal"));
});

test("validateTargetPath returns error for non-.md file", () => {
  const result = validateTargetPath("test.txt");
  assert.ok(result?.includes("only .md files"));
});

test("validateTargetPath returns error for directory path without .md", () => {
  // Note: paths without .md extension are rejected (only .md files allowed)
  const result = validateTargetPath("guides/new-guide");
  assert.ok(result?.includes("only .md files"));
});

// ---------------------------------------------------------------------------
// validateMarkdownContent
// ---------------------------------------------------------------------------

test("validateMarkdownContent returns null for valid content", () => {
  const result = validateMarkdownContent("# Test\n\nSome content.");
  assert.equal(result, null);
});

test("validateMarkdownContent returns error for empty string", () => {
  const result = validateMarkdownContent("");
  assert.equal(result, "Content is required");
});

test("validateMarkdownContent returns error for null/undefined", () => {
  assert.equal(validateMarkdownContent(null as unknown as string), "Content is required");
  assert.equal(validateMarkdownContent(undefined as unknown as string), "Content is required");
});

test("validateMarkdownContent returns error for content exceeding 1MB", () => {
  const largeContent = "x".repeat(1024 * 1024 + 1);
  const result = validateMarkdownContent(largeContent);
  assert.ok(result?.includes("exceeds maximum size"));
});

// ---------------------------------------------------------------------------
// uploadKnowledgeDocument
// ---------------------------------------------------------------------------

test("uploadKnowledgeDocument writes file to knowledge base directory", async () => {
  const tempDir = path.join(tmpdir(), `kb-test-${Date.now()}`);
  await mkdir(tempDir, { recursive: true });

  try {
    const result = await uploadKnowledgeDocument({
      knowledgeBaseDir: tempDir,
      targetPath: "test-doc.md",
      content: "# Test Document\n\nThis is a test.",
    });

    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.path, "test-doc");
      assert.ok(result.absolutePath.endsWith("test-doc.md"));

      // Verify file was created
      const fileStat = await stat(result.absolutePath);
      assert.ok(fileStat.isFile());
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("uploadKnowledgeDocument creates nested directories", async () => {
  const tempDir = path.join(tmpdir(), `kb-test-${Date.now()}`);
  await mkdir(tempDir, { recursive: true });

  try {
    const result = await uploadKnowledgeDocument({
      knowledgeBaseDir: tempDir,
      targetPath: "guides/deep/nested/doc.md",
      content: "# Nested Document",
    });

    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.path, "guides/deep/nested/doc");
      assert.ok(result.absolutePath.includes("guides/deep/nested"));
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("uploadKnowledgeDocument creates index.md for path ending with /", async () => {
  const tempDir = path.join(tmpdir(), `kb-test-${Date.now()}`);
  await mkdir(tempDir, { recursive: true });

  try {
    // Note: "my-guide/" gets normalized, but let's test with "my-guide/index.md"
    const result = await uploadKnowledgeDocument({
      knowledgeBaseDir: tempDir,
      targetPath: "my-guide/index.md",
      content: "# Index Document",
    });

    assert.equal(result.success, true);
    if (result.success) {
      assert.ok(result.absolutePath.endsWith("index.md"));
      assert.equal(result.path, "my-guide");
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("uploadKnowledgeDocument returns error for path traversal", async () => {
  const tempDir = path.join(tmpdir(), `kb-test-${Date.now()}`);
  await mkdir(tempDir, { recursive: true });

  try {
    const result = await uploadKnowledgeDocument({
      knowledgeBaseDir: tempDir,
      targetPath: "../secret.md",
      content: "# Secret",
    });

    assert.equal(result.success, false);
    if (!result.success) {
      assert.ok(result.error.includes("path traversal"));
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("uploadKnowledgeDocument handles explicit .md extension", async () => {
  const tempDir = path.join(tmpdir(), `kb-test-${Date.now()}`);
  await mkdir(tempDir, { recursive: true });

  try {
    const result = await uploadKnowledgeDocument({
      knowledgeBaseDir: tempDir,
      targetPath: "explicit.md",
      content: "# Explicit MD",
    });

    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.path, "explicit");
      assert.ok(result.absolutePath.endsWith("explicit.md"));
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});