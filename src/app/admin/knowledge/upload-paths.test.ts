import assert from "node:assert/strict";
import test from "node:test";

import { normalizeFolderUploadFiles } from "./upload-paths";

function createFileWithPath(relativePath: string) {
  return {
    file: new File(["# test"], relativePath.split("/").at(-1) ?? "test.md", {
      type: "text/markdown",
    }),
    relativePath,
  };
}

test("normalizeFolderUploadFiles strips the shared top-level directory", () => {
  const files = [
    createFileWithPath("tb-knowledge-base/index.md"),
    createFileWithPath("tb-knowledge-base/guides/getting-started.md"),
    createFileWithPath("tb-knowledge-base/faq/troubleshooting.md"),
  ];

  assert.deepEqual(
    normalizeFolderUploadFiles(files).map((file) => file.relativePath),
    ["index.md", "guides/getting-started.md", "faq/troubleshooting.md"]
  );
});

test("normalizeFolderUploadFiles keeps paths when there is no shared top-level directory", () => {
  const files = [
    createFileWithPath("guides/getting-started.md"),
    createFileWithPath("faq/troubleshooting.md"),
  ];

  assert.deepEqual(
    normalizeFolderUploadFiles(files).map((file) => file.relativePath),
    ["guides/getting-started.md", "faq/troubleshooting.md"]
  );
});

test("normalizeFolderUploadFiles keeps single-file imports unchanged", () => {
  const files = [createFileWithPath("index.md")];

  assert.deepEqual(
    normalizeFolderUploadFiles(files).map((file) => file.relativePath),
    ["index.md"]
  );
});
