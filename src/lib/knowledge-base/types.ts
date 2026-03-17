export type KnowledgeDocument = {
  path: string;
  slug: string[];
  name: string;
  title: string;
  summary: string;
  tags: string[];
  directoryPath: string;
  body: string;
  isDirectoryIndex: boolean;
  sourcePath: string;
  lastModified: string;
};

export type KnowledgeDocumentPreview = Pick<KnowledgeDocument, "path" | "title" | "summary">;

export type KnowledgeDirectoryPreview = {
  path: string;
  name: string;
  title: string;
  summary: string;
};

export type KnowledgeDirectoryNode = {
  path: string;
  name: string;
  title: string;
  document: KnowledgeDocument | null;
  directories: KnowledgeDirectoryNode[];
  documents: KnowledgeDocument[];
};

export type KnowledgeDirectoryViewModel = {
  path: string;
  name: string;
  title: string;
  document: KnowledgeDocument | null;
  directories: KnowledgeDirectoryPreview[];
  documents: KnowledgeDocumentPreview[];
};

export type KnowledgeSearchEntry = {
  path: string;
  title: string;
  summary: string;
  tags: string[];
};

export type KnowledgeIndex = {
  root: KnowledgeDirectoryNode;
  directoriesByPath: Map<string, KnowledgeDirectoryNode>;
  documentsByPath: Map<string, KnowledgeDocument>;
  searchEntriesByPath: Map<string, KnowledgeSearchEntry>;
};

export type KnowledgeBaseReadyState = {
  status: "ready";
  rootDir: string;
  index: KnowledgeIndex;
};

export type KnowledgeBaseNotConfiguredState = {
  status: "not_configured";
  rootDir: string;
  index: null;
};

export type KnowledgeBaseState =
  | KnowledgeBaseReadyState
  | KnowledgeBaseNotConfiguredState;
