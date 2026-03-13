import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export type UploadResult = {
  success: true;
  path: string;
  absolutePath: string;
} | {
  success: false;
  error: string;
};

export type UploadOptions = {
  knowledgeBaseDir: string;
  targetPath: string;
  content: string;
};

/**
 * Validates that the target path is within the knowledge base directory.
 * Returns null if valid, or an error message if invalid.
 */
export function validateTargetPath(targetPath: string): string | null {
  // Normalize the path to prevent traversal attacks
  const normalized = path.normalize(targetPath);

  // Check for path traversal attempts
  if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
    return "Invalid path: path traversal detected";
  }

  // Only allow .md files
  if (!normalized.endsWith(".md") && normalized !== "") {
    return "Invalid path: only .md files are allowed";
  }

  return null;
}

/**
 * Writes a document to the knowledge base.
 */
export async function uploadKnowledgeDocument({
  knowledgeBaseDir,
  targetPath,
  content,
}: UploadOptions): Promise<UploadResult> {
  const validationError = validateTargetPath(targetPath);
  if (validationError) {
    return { success: false, error: validationError };
  }

  // Determine the full file path
  // If targetPath is empty or ends with a directory, create index.md
  let filePath = targetPath;
  if (!filePath.endsWith(".md")) {
    filePath = path.join(filePath, "index.md");
  }

  const absolutePath = path.join(knowledgeBaseDir, filePath);
  const dirPath = path.dirname(absolutePath);

  // Ensure directory exists
  try {
    await mkdir(dirPath, { recursive: true });
  } catch {
    // Directory might already exist
  }

  // Write the file
  try {
    await writeFile(absolutePath, content, "utf8");
  } catch (error) {
    return {
      success: false,
      error: `Failed to write file: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }

  // Return the logical path (without .md extension for index files)
  const logicalPath = filePath.replace(/\/index\.md$/, "").replace(/\.md$/, "");

  return {
    success: true,
    path: logicalPath || "",
    absolutePath,
  };
}

/**
 * Validates Markdown content.
 * Returns null if valid, or an error message if invalid.
 */
export function validateMarkdownContent(content: string): string | null {
  if (!content || typeof content !== "string") {
    return "Content is required";
  }

  if (content.length > 1024 * 1024) {
    return "Content exceeds maximum size of 1MB";
  }

  return null;
}