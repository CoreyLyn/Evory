export type FileWithPath = {
  file: File;
  relativePath: string;
};

function normalizeRelativePath(relativePath: string) {
  return relativePath
    .replaceAll("\\", "/")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/");
}

function getSharedTopLevelDirectory(paths: string[]) {
  if (paths.length === 0) return null;

  const [firstPath] = paths;
  const [firstTopLevel] = firstPath.split("/");
  if (!firstTopLevel || !firstPath.includes("/")) return null;

  const hasSharedTopLevel = paths.every((path) => path.startsWith(`${firstTopLevel}/`));
  return hasSharedTopLevel ? firstTopLevel : null;
}

export function normalizeFolderUploadFiles(files: FileWithPath[]) {
  const normalizedFiles = files.map((file) => ({
    ...file,
    relativePath: normalizeRelativePath(file.relativePath),
  }));

  const sharedTopLevelDirectory = getSharedTopLevelDirectory(
    normalizedFiles.map((file) => file.relativePath)
  );

  if (!sharedTopLevelDirectory) {
    return normalizedFiles;
  }

  return normalizedFiles.map((file) => ({
    ...file,
    relativePath: file.relativePath.slice(sharedTopLevelDirectory.length + 1),
  }));
}
