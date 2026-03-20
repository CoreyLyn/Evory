import { getKnowledgeBase } from "./service";
import { markdownToPlainText } from "@/lib/markdown-summary";
import type {
  KnowledgeDirectoryNode,
  KnowledgeDirectoryPreview,
  KnowledgeDirectoryViewModel,
  KnowledgeDocument,
  KnowledgeDocumentPreview,
  KnowledgeIndex,
} from "./types";

export type KnowledgeDirectoryResponse = KnowledgeDirectoryNode & {
  kind: "directory";
};

export type KnowledgeDocumentResponse = KnowledgeDocument & {
  kind: "document";
};

const KNOWLEDGE_BASE_AGENT = {
  id: "knowledge-base",
  name: "Knowledge Base",
  type: "SYSTEM",
  avatarConfig: null,
} as const;
const ROOT_LEGACY_ARTICLE_ID = "__root__";

export async function getCurrentKnowledgeBase() {
  return getKnowledgeBase({
    cwd: process.cwd(),
    env: process.env,
  });
}

export function countKnowledgeDocuments(index: KnowledgeIndex) {
  return index.searchEntriesByPath.size;
}

export function toKnowledgeDocumentPreview(document: KnowledgeDocument): KnowledgeDocumentPreview {
  return {
    path: document.path,
    title: document.title,
    summary: document.summary,
  };
}

function buildKnowledgeSearchSnippet(document: KnowledgeDocument, rawQuery: string) {
  const query = rawQuery.trim().toLocaleLowerCase();
  if (!query) {
    return document.summary;
  }

  const normalizedTitle = document.title.trim();
  let bodySource = document.body.trimStart();
  if (normalizedTitle && bodySource.startsWith(`# ${normalizedTitle}`)) {
    bodySource = bodySource.slice(`# ${normalizedTitle}`.length).trimStart();
  }

  const bodyText = markdownToPlainText(bodySource);
  const normalizedBody = bodyText.toLocaleLowerCase();
  const matchIndex = normalizedBody.indexOf(query);

  if (matchIndex === -1) {
    if (document.summary.toLocaleLowerCase().includes(query)) {
      return document.summary;
    }
    return bodyText || document.summary;
  }

  const windowSize = 72;
  const start = Math.max(0, matchIndex - windowSize / 2);
  const end = Math.min(bodyText.length, matchIndex + query.length + windowSize / 2);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < bodyText.length ? "..." : "";

  return `${prefix}${bodyText.slice(start, end).trim()}${suffix}`;
}

export function toKnowledgeDirectoryPreview(
  directory: KnowledgeDirectoryNode
): KnowledgeDirectoryPreview {
  return {
    path: directory.path,
    name: directory.name,
    title: directory.title,
    summary: directory.document?.summary ?? "",
  };
}

export function toKnowledgeDirectoryViewModel(
  directory: KnowledgeDirectoryNode
): KnowledgeDirectoryViewModel {
  return {
    path: directory.path,
    name: directory.name,
    title: directory.title,
    document: directory.document,
    directories: directory.directories.map(toKnowledgeDirectoryPreview),
    documents: directory.documents.map(toKnowledgeDocumentPreview),
  };
}

export function findKnowledgeDirectoryViewModel(index: KnowledgeIndex, targetPath: string) {
  const directory = index.directoriesByPath.get(targetPath);
  if (!directory) return null;
  return toKnowledgeDirectoryViewModel(directory);
}

export function findKnowledgeDocument(index: KnowledgeIndex, targetPath: string) {
  const document = index.documentsByPath.get(targetPath);
  if (document) return document;
  return index.directoriesByPath.get(targetPath)?.document ?? null;
}

export function findKnowledgePathPayload(
  index: KnowledgeIndex,
  targetPath: string
): KnowledgeDirectoryResponse | KnowledgeDocumentResponse | null {
  const directory = index.directoriesByPath.get(targetPath);
  if (directory) {
    return {
      kind: "directory",
      ...directory,
    };
  }

  const document = index.documentsByPath.get(targetPath);
  if (!document) return null;

  return {
    kind: "document",
    ...document,
  };
}

function getNormalizedBody(index: KnowledgeIndex, entryPath: string) {
  const entry = index.searchEntriesByPath.get(entryPath);
  if (!entry) return "";

  if (typeof entry.normalizedBody === "string") {
    return entry.normalizedBody;
  }

  const document = findKnowledgeDocument(index, entryPath);
  const normalizedBody = document?.body.toLocaleLowerCase() ?? "";
  entry.normalizedBody = normalizedBody;
  return normalizedBody;
}

function getSearchScore(
  index: KnowledgeIndex,
  entryPath: string,
  query: string
) {
  const entry = index.searchEntriesByPath.get(entryPath);
  if (!entry) return 0;

  let score = 0;

  if (entry.normalizedTitle.includes(query)) score += 100;
  if (entry.normalizedSummary.includes(query)) score += 40;
  if (entry.normalizedTags.some((tag) => tag.includes(query))) score += 40;
  if (getNormalizedBody(index, entryPath).includes(query)) score += 10;

  return score;
}

export function searchKnowledgeDocuments(index: KnowledgeIndex, rawQuery: string) {
  const query = rawQuery.trim().toLocaleLowerCase();
  if (!query) return [];

  return Array.from(index.searchEntriesByPath.keys())
    .map((entryPath) => ({
      entryPath,
      document: findKnowledgeDocument(index, entryPath),
    }))
    .filter((entry): entry is { entryPath: string; document: KnowledgeDocument } => entry.document !== null)
    .map((entry) => ({
      entryPath: entry.entryPath,
      document: entry.document,
      score: getSearchScore(index, entry.entryPath, query),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.document.path.localeCompare(right.document.path);
    })
    .map((entry) => entry.document);
}

export function searchKnowledgeDocumentPreviews(index: KnowledgeIndex, rawQuery: string) {
  return searchKnowledgeDocuments(index, rawQuery).map((document) => ({
    ...toKnowledgeDocumentPreview(document),
    snippet: buildKnowledgeSearchSnippet(document, rawQuery),
  }));
}

export function toLegacyCompatibleKnowledgeSearchResult(
  document: KnowledgeDocument,
  rawQuery?: string
) {
  return {
    ...document,
    id: encodeLegacyKnowledgeArticleId(document.path),
    content: document.body,
    snippet: rawQuery ? buildKnowledgeSearchSnippet(document, rawQuery) : document.summary,
    viewCount: 0,
    createdAt: document.lastModified,
    agent: KNOWLEDGE_BASE_AGENT,
  };
}

export function encodeLegacyKnowledgeArticleId(documentPath: string) {
  if (documentPath === "") return ROOT_LEGACY_ARTICLE_ID;
  return encodeURIComponent(documentPath);
}

export function decodeLegacyKnowledgeArticleId(articleId: string) {
  if (articleId === ROOT_LEGACY_ARTICLE_ID) return "";
  return decodeURIComponent(articleId);
}

export function listLegacyKnowledgeArticles(index: KnowledgeIndex) {
  return Array.from(index.searchEntriesByPath.keys())
    .map((entryPath) => findKnowledgeDocument(index, entryPath))
    .filter((document): document is KnowledgeDocument => document !== null)
    .sort((left, right) => {
      const dateDiff =
        new Date(right.lastModified).getTime() - new Date(left.lastModified).getTime();
      if (dateDiff !== 0) return dateDiff;
      return left.path.localeCompare(right.path);
    })
    .map(toLegacyCompatibleKnowledgeSearchResult);
}
