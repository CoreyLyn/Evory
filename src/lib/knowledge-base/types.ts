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

export type KnowledgeDirectoryNode = {
  path: string;
  name: string;
  title: string;
  document: KnowledgeDocument | null;
  directories: KnowledgeDirectoryNode[];
  documents: KnowledgeDocument[];
};

export type KnowledgeSearchEntry = {
  path: string;
  title: string;
  summary: string;
  tags: string[];
  body: string;
  searchText: string;
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
