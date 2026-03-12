import path from "node:path";

export type KnowledgeBaseConfigOptions = {
  cwd: string;
  env: NodeJS.ProcessEnv | Record<string, string | undefined>;
};

export function resolveKnowledgeBaseRoot({
  cwd,
  env,
}: KnowledgeBaseConfigOptions) {
  const configuredRoot = env.KNOWLEDGE_BASE_DIR?.trim();
  if (!configuredRoot) {
    return path.join(cwd, "knowledge");
  }

  return path.isAbsolute(configuredRoot)
    ? configuredRoot
    : path.resolve(cwd, configuredRoot);
}
