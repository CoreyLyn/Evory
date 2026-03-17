import { readdir, stat, readFile } from "node:fs/promises";
import path from "node:path";

import matter from "gray-matter";

import type {
  KnowledgeDirectoryNode,
  KnowledgeDocument,
  KnowledgeIndex,
  KnowledgeSearchEntry,
} from "./types";

type BuildKnowledgeBaseIndexOptions = {
  rootDir: string;
  previousIndex?: KnowledgeIndex;
  fileSystem?: Partial<KnowledgeFileSystem>;
};

type KnowledgeFileSystem = {
  readdir: typeof readdir;
  stat: typeof stat;
  readFile: typeof readFile;
};

type Frontmatter = {
  title?: unknown;
  summary?: unknown;
  tags?: unknown;
};

function titleize(input: string) {
  return input
    .split(/[\s\-_]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function inferSummary(body: string) {
  const paragraphs = body
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !part.startsWith("#"));

  return paragraphs[0] ?? "";
}

function inferTitle(body: string, fallbackTitle: string) {
  const heading = body
    .split("\n")
    .map((line) => line.trim())
    .find((line) => /^#\s+/.test(line));

  if (!heading) return fallbackTitle;
  const normalizedHeading = heading.replace(/^#\s+/, "").trim();
  return normalizedHeading ? titleize(normalizedHeading) : fallbackTitle;
}

function toTags(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function stripLeadingFrontmatterFence(content: string) {
  if (!content.startsWith("---")) return content;

  const closingFenceIndex = content.indexOf("\n---", 3);
  if (closingFenceIndex === -1) return content;

  return content.slice(closingFenceIndex + 4).trimStart();
}

function parseMarkdown(content: string) {
  try {
    return matter(content);
  } catch {
    const strippedContent = stripLeadingFrontmatterFence(content);
    return {
      data: {},
      content: strippedContent,
      inferenceContent: strippedContent,
    };
  }
}

function toDocument({
  absolutePath,
  logicalPath,
  isDirectoryIndex,
  fileName,
  content,
  modifiedAt,
}: {
  absolutePath: string;
  logicalPath: string;
  isDirectoryIndex: boolean;
  fileName: string;
  content: string;
  modifiedAt: Date;
}): KnowledgeDocument {
  const parsed = parseMarkdown(content);
  const data = parsed.data as Frontmatter;
  const inferenceContent =
    "inferenceContent" in parsed && typeof parsed.inferenceContent === "string"
      ? parsed.inferenceContent
      : parsed.content;
  const slug = logicalPath === "" ? [] : logicalPath.split("/");
  const name = isDirectoryIndex
    ? slug.at(-1) ?? "root"
    : fileName.replace(/\.md$/i, "");
  const fallbackTitle = titleize(name);
  const summary = typeof data.summary === "string" ? data.summary : inferSummary(inferenceContent);
  const title = typeof data.title === "string"
    ? data.title
    : inferTitle(inferenceContent, fallbackTitle);

  return {
    path: logicalPath,
    slug,
    name,
    title,
    summary,
    tags: toTags(data.tags),
    directoryPath: isDirectoryIndex
      ? logicalPath
      : path.posix.dirname(logicalPath) === "."
        ? ""
        : path.posix.dirname(logicalPath),
    body: parsed.content.trim(),
    isDirectoryIndex,
    sourcePath: absolutePath,
    lastModified: modifiedAt.toISOString(),
  };
}

function toSearchEntry(document: KnowledgeDocument): KnowledgeSearchEntry {
  return {
    path: document.path,
    title: document.title,
    summary: document.summary,
    tags: document.tags,
    normalizedTitle: document.title.toLocaleLowerCase(),
    normalizedSummary: document.summary.toLocaleLowerCase(),
    normalizedTags: document.tags.map((tag) => tag.toLocaleLowerCase()),
  };
}

function getKnowledgeFileSystem(
  overrides?: Partial<KnowledgeFileSystem>
): KnowledgeFileSystem {
  return {
    readdir,
    stat,
    readFile,
    ...overrides,
  };
}

async function walkMarkdownFiles(
  fileSystem: KnowledgeFileSystem,
  rootDir: string,
  currentDir: string,
  files: string[]
) {
  const entries = await fileSystem.readdir(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      await walkMarkdownFiles(fileSystem, rootDir, absolutePath, files);
      continue;
    }

    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) {
      continue;
    }

    files.push(path.relative(rootDir, absolutePath));
  }
}

function ensureDirectoryNode(
  directoriesByPath: Map<string, KnowledgeDirectoryNode>,
  logicalPath: string
) {
  const existing = directoriesByPath.get(logicalPath);
  if (existing) return existing;

  const name = logicalPath === "" ? "root" : logicalPath.split("/").at(-1) ?? "";
  const node: KnowledgeDirectoryNode = {
    path: logicalPath,
    name,
    title: titleize(name),
    document: null,
    directories: [],
    documents: [],
  };

  directoriesByPath.set(logicalPath, node);

  if (logicalPath !== "") {
    const parentPath = path.posix.dirname(logicalPath) === "."
      ? ""
      : path.posix.dirname(logicalPath);
    const parent = ensureDirectoryNode(directoriesByPath, parentPath);
    parent.directories.push(node);
  }

  return node;
}

function findIndexedDocument(index: KnowledgeIndex, targetPath: string) {
  return index.documentsByPath.get(targetPath)
    ?? index.directoriesByPath.get(targetPath)?.document
    ?? null;
}

function findSearchEntry(index: KnowledgeIndex, targetPath: string) {
  return index.searchEntriesByPath.get(targetPath) ?? null;
}

export async function buildKnowledgeBaseIndex({
  rootDir,
  previousIndex,
  fileSystem: fileSystemOverrides,
}: BuildKnowledgeBaseIndexOptions): Promise<KnowledgeIndex> {
  const fileSystem = getKnowledgeFileSystem(fileSystemOverrides);
  const markdownFiles: string[] = [];
  await walkMarkdownFiles(fileSystem, rootDir, rootDir, markdownFiles);

  const directoriesByPath = new Map<string, KnowledgeDirectoryNode>();
  const documentsByPath = new Map<string, KnowledgeDocument>();
  const searchEntriesByPath = new Map<string, KnowledgeSearchEntry>();
  const occupiedPaths = new Map<string, string>();

  const root = ensureDirectoryNode(directoriesByPath, "");

  for (const relativePath of markdownFiles.sort()) {
    const absolutePath = path.join(rootDir, relativePath);
    const fileStat = await fileSystem.stat(absolutePath);
    const normalizedRelative = relativePath.split(path.sep).join(path.posix.sep);
    const isReadme = path.posix.basename(normalizedRelative).toLowerCase() === "readme.md";
    const logicalPath = isReadme
      ? path.posix.dirname(normalizedRelative) === "."
        ? ""
        : path.posix.dirname(normalizedRelative)
      : normalizedRelative.replace(/\.md$/i, "");

    const previousSource = occupiedPaths.get(logicalPath);
    if (previousSource) {
      throw new Error(
        `Knowledge base path collision for "${logicalPath}" between "${previousSource}" and "${normalizedRelative}".`
      );
    }
    occupiedPaths.set(logicalPath, normalizedRelative);

    const directoryPath = isReadme
      ? logicalPath
      : path.posix.dirname(logicalPath) === "."
        ? ""
        : path.posix.dirname(logicalPath);
    const directory = ensureDirectoryNode(directoriesByPath, directoryPath);
    const lastModified = fileStat.mtime.toISOString();
    const previousDocument = previousIndex
      ? findIndexedDocument(previousIndex, logicalPath)
      : null;
    const reusePreviousDocument = previousDocument
      && previousDocument.sourcePath === absolutePath
      && previousDocument.lastModified === lastModified;
    const document = reusePreviousDocument
      ? previousDocument
      : toDocument({
          absolutePath,
          logicalPath,
          isDirectoryIndex: isReadme,
          fileName: path.posix.basename(normalizedRelative),
          content: await fileSystem.readFile(absolutePath, "utf8"),
          modifiedAt: fileStat.mtime,
        });
    const previousSearchEntry = previousIndex
      ? findSearchEntry(previousIndex, logicalPath)
      : null;
    const searchEntry = reusePreviousDocument
      && previousSearchEntry
      ? previousSearchEntry
      : toSearchEntry(document);

    if (isReadme) {
      const landingDirectory = ensureDirectoryNode(directoriesByPath, logicalPath);
      landingDirectory.document = document;
      landingDirectory.title = document.title;
      searchEntriesByPath.set(document.path, searchEntry);
      continue;
    }

    directory.documents.push(document);
    documentsByPath.set(document.path, document);
    searchEntriesByPath.set(document.path, searchEntry);
  }

  for (const node of directoriesByPath.values()) {
    node.directories.sort((left, right) => left.path.localeCompare(right.path));
    node.documents.sort((left, right) => left.path.localeCompare(right.path));
  }

  return {
    root,
    directoriesByPath,
    documentsByPath,
    searchEntriesByPath,
  };
}
