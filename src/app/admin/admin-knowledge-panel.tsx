"use client";

import { useEffect, useRef, useState } from "react";
import { Upload, Trash2, FileText, Folder } from "lucide-react";

import { useT } from "@/i18n";
import { useFormatTimeAgo } from "@/lib/useFormatTime";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { normalizeFolderUploadFiles, type FileWithPath } from "./knowledge/upload-paths";

type DocumentItem = {
  path: string;
  title: string;
  summary: string;
  lastModified: string;
  isDirectoryIndex: boolean;
};

type KnowledgeState = {
  configured: boolean;
  rootDir: string;
  documents: DocumentItem[];
};

function getFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve) => {
    entry.file(resolve);
  });
}

function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve) => {
    const allEntries: FileSystemEntry[] = [];
    function readBatch() {
      reader.readEntries((entries) => {
        if (entries.length === 0) {
          resolve(allEntries);
        } else {
          allEntries.push(...entries);
          readBatch();
        }
      });
    }
    readBatch();
  });
}

async function traverseFileTree(
  item: FileSystemEntry,
  basePath = ""
): Promise<FileWithPath[]> {
  const files: FileWithPath[] = [];

  if (item.isFile) {
    const file = await getFile(item as FileSystemFileEntry);
    if (file.name.endsWith(".md")) {
      files.push({ file, relativePath: basePath + file.name });
    }
  } else if (item.isDirectory) {
    const reader = (item as FileSystemDirectoryEntry).createReader();
    const entries = await readAllEntries(reader);
    for (const entry of entries) {
      const subFiles = await traverseFileTree(entry, basePath + item.name + "/");
      files.push(...subFiles);
    }
  }

  return files;
}

function extractFilesFromFileList(fileList: FileList): FileWithPath[] {
  const files: FileWithPath[] = [];
  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    if (file.name.endsWith(".md")) {
      files.push({ file, relativePath: file.webkitRelativePath });
    }
  }
  return normalizeFolderUploadFiles(files);
}

export function AdminKnowledgePanel() {
  const t = useT();
  const formatTimeAgo = useFormatTimeAgo();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<KnowledgeState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [targetPath, setTargetPath] = useState("");
  const [deletingPath, setDeletingPath] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [previewFiles, setPreviewFiles] = useState<FileWithPath[] | null>(null);
  const [folderUploading, setFolderUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [failedFiles, setFailedFiles] = useState<Array<{ path: string; error: string }>>([]);

  useEffect(() => {
    let cancelled = false;
    async function loadDocuments() {
      setLoading(true);
      try {
        const r = await fetch("/api/admin/knowledge/documents");
        const json = await r.json();
        if (cancelled) return;
        if (json.success) {
          setState({
            configured: json.configured,
            rootDir: json.rootDir,
            documents: json.data,
          });
        } else {
          setError(json.error || t("admin.actionFailed"));
        }
      } catch {
        if (!cancelled) setError(t("admin.actionFailed"));
      }
      if (!cancelled) setLoading(false);
    }
    void loadDocuments();
    return () => {
      cancelled = true;
    };
  }, [t, refreshKey]);

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(null), 3000);
    return () => clearTimeout(timer);
  }, [success]);

  async function handleUpload() {
    if (!selectedFile) {
      setError(t("admin.knowledge.noFileSelected"));
      return;
    }

    if (!selectedFile.name.endsWith(".md")) {
      setError(t("admin.knowledge.invalidFileType"));
      return;
    }

    setUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      if (targetPath.trim()) {
        formData.append("path", targetPath.trim());
      }

      const response = await fetch("/api/admin/knowledge/upload", {
        method: "POST",
        body: formData,
      });
      const json = await response.json();

      if (json.success) {
        setSuccess(t("admin.knowledge.uploadSuccess"));
        setSelectedFile(null);
        setTargetPath("");
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        setRefreshKey((current) => current + 1);
      } else {
        setError(json.error || t("admin.knowledge.uploadFailed"));
      }
    } catch {
      setError(t("admin.knowledge.uploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(docPath: string) {
    if (!confirm(t("admin.knowledge.confirmDelete"))) return;

    setDeletingPath(docPath);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/admin/knowledge/documents/${encodeURIComponent(docPath)}`, {
        method: "DELETE",
      });
      const json = await response.json();

      if (json.success) {
        setSuccess(t("admin.knowledge.deleteSuccess"));
        setRefreshKey((current) => current + 1);
      } else {
        setError(json.error || t("admin.knowledge.deleteFailed"));
      }
    } catch {
      setError(t("admin.knowledge.deleteFailed"));
    } finally {
      setDeletingPath(null);
    }
  }

  async function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    event.stopPropagation();

    const items = Array.from(event.dataTransfer.items);
    const files: FileWithPath[] = [];

    for (const item of items) {
      const entry = item.webkitGetAsEntry?.();
      if (entry) {
        const entryFiles = await traverseFileTree(entry);
        files.push(...entryFiles);
      }
    }

    if (files.length === 0) {
      setError(t("admin.knowledge.noMdFiles"));
      return;
    }

    setPreviewFiles(normalizeFolderUploadFiles(files));
    setError(null);
    setSuccess(null);
    setFailedFiles([]);
  }

  function handleDragOver(event: React.DragEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  function handleFolderSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const fileList = event.target.files;
    if (!fileList || fileList.length === 0) return;

    const files = extractFilesFromFileList(fileList);
    if (files.length === 0) {
      setError(t("admin.knowledge.noMdFiles"));
      return;
    }

    setPreviewFiles(files);
    setError(null);
    setSuccess(null);
    setFailedFiles([]);

    if (folderInputRef.current) {
      folderInputRef.current.value = "";
    }
  }

  async function handleFolderUpload() {
    if (!previewFiles || previewFiles.length === 0) return;

    const totalFiles = previewFiles.length;
    setFolderUploading(true);
    setUploadProgress({ current: 0, total: totalFiles });
    setFailedFiles([]);
    setError(null);
    setSuccess(null);

    const results = { failed: [] as Array<{ path: string; error: string }> };
    const queue = [...previewFiles];
    let completed = 0;

    async function processQueue() {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) break;

        const formData = new FormData();
        formData.append("file", item.file);
        const finalPath = targetPath.trim()
          ? `${targetPath.trim()}/${item.relativePath}`
          : item.relativePath;
        formData.append("path", finalPath);

        try {
          const response = await fetch("/api/admin/knowledge/upload", {
            method: "POST",
            body: formData,
          });
          const json = await response.json();
          if (!json.success) {
            results.failed.push({ path: item.relativePath, error: json.error || "Upload failed" });
          }
        } catch {
          results.failed.push({ path: item.relativePath, error: "Network error" });
        }

        completed += 1;
        setUploadProgress({ current: completed, total: totalFiles });
      }
    }

    await Promise.all([processQueue(), processQueue(), processQueue()]);

    setFolderUploading(false);
    setPreviewFiles(null);

    if (results.failed.length > 0) {
      setFailedFiles(results.failed);
      setError(t("admin.knowledge.uploadFailedSome", { count: String(results.failed.length) }));
    } else {
      setSuccess(t("admin.knowledge.uploadComplete"));
    }

    setRefreshKey((current) => current + 1);
  }

  function cancelPreview() {
    setPreviewFiles(null);
    setFailedFiles([]);
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-xl border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
          {success}
        </div>
      )}

      <Card className="p-5">
        <div className="mb-4">
          <h2 className="font-semibold text-foreground">{t("admin.knowledge.title")}</h2>
          <p className="mt-1 text-sm text-muted">{t("admin.knowledge.subtitle")}</p>
        </div>

        {previewFiles && !folderUploading && (
          <div className="mb-4 rounded-xl border border-accent/20 bg-accent/5 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-medium text-foreground text-sm">
                {t("admin.knowledge.uploadPreview", { count: String(previewFiles.length) })}
              </span>
              <div className="flex gap-2">
                <Button variant="secondary" className="text-xs px-3 py-1.5" onClick={cancelPreview}>
                  {t("agents.cancel")}
                </Button>
                <Button className="text-xs px-3 py-1.5" onClick={() => void handleFolderUpload()}>
                  {t("admin.knowledge.confirmUpload")}
                </Button>
              </div>
            </div>
            <div className="max-h-40 overflow-y-auto space-y-0.5 text-sm text-muted">
              {previewFiles.slice(0, 10).map((file) => (
                <div key={file.relativePath} className="flex items-center gap-1.5">
                  <FileText className="h-3 w-3 shrink-0 text-muted/50" />
                  <span className="truncate">{file.relativePath}</span>
                </div>
              ))}
              {previewFiles.length > 10 && (
                <div className="pl-[18px] text-muted/60">... and {previewFiles.length - 10} more</div>
              )}
            </div>
          </div>
        )}

        {folderUploading && (
          <div className="mb-4 rounded-xl border border-accent/20 bg-accent/5 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">
                {t("admin.knowledge.uploading")}
              </span>
              <span className="text-sm text-muted whitespace-nowrap tabular-nums">
                {t("admin.knowledge.uploadingProgress", {
                  current: String(uploadProgress.current),
                  total: String(uploadProgress.total),
                })}
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-card-border/30">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{
                  width: `${uploadProgress.total === 0 ? 0 : (uploadProgress.current / uploadProgress.total) * 100}%`,
                }}
              />
            </div>
          </div>
        )}

        {failedFiles.length > 0 && (
          <div className="mb-4 rounded-xl border border-danger/20 bg-danger/5 p-4">
            <p className="text-sm font-medium text-danger">
              {t("admin.knowledge.uploadFailedSome", { count: String(failedFiles.length) })}
            </p>
            <div className="mt-3 max-h-40 space-y-2 overflow-y-auto text-xs text-danger/80">
              {failedFiles.map((file) => (
                <div key={file.path}>
                  <span className="font-medium">{file.path}</span>
                  <span className="ml-2">{file.error}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3 rounded-xl border border-card-border/30 p-4">
            <div className="flex items-center gap-2">
              <Upload className="h-4 w-4 text-accent" />
              <div className="text-sm font-medium text-foreground">{t("admin.knowledge.selectFile")}</div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".md"
              onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
              className="block w-full text-sm text-muted file:mr-4 file:rounded-lg file:border-0 file:bg-accent/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-accent"
            />
          </div>

          <div className="space-y-3 rounded-xl border border-card-border/30 p-4">
            <div className="flex items-center gap-2">
              <Folder className="h-4 w-4 text-accent-secondary" />
              <div className="text-sm font-medium text-foreground">{t("admin.knowledge.selectFolder")}</div>
            </div>
            <input
              ref={folderInputRef}
              type="file"
              accept=".md"
              multiple
              onChange={handleFolderSelect}
              className="block w-full text-sm text-muted file:mr-4 file:rounded-lg file:border-0 file:bg-accent-secondary/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-accent-secondary"
              {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
            />
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground" htmlFor="knowledge-target-path">
              {t("admin.knowledge.targetPath")}
            </label>
            <input
              id="knowledge-target-path"
              value={targetPath}
              onChange={(event) => setTargetPath(event.target.value)}
              placeholder={t("admin.knowledge.targetPathPlaceholder")}
              className="w-full rounded-xl border border-card-border bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent/40"
            />
          </div>
          <div className="flex items-end">
            <Button onClick={() => void handleUpload()} disabled={uploading || !selectedFile}>
              {uploading ? t("admin.knowledge.uploading") : t("admin.knowledge.upload")}
            </Button>
          </div>
        </div>

        <div
          onDrop={(event) => void handleDrop(event)}
          onDragOver={handleDragOver}
          className="mt-4 rounded-xl border border-dashed border-card-border/50 px-4 py-6 text-center text-sm text-muted"
        >
          {t("admin.knowledge.dropHint")}
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <span className="text-muted animate-pulse">{t("common.loading")}</span>
          </div>
        ) : !state?.configured ? (
          <div className="px-6 py-12 text-center">
            <p className="font-medium text-foreground/70">{t("admin.knowledge.notConfigured")}</p>
            <p className="mt-1 text-sm text-muted/60">{t("admin.knowledge.notConfiguredDesc")}</p>
          </div>
        ) : state.documents.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="font-medium text-foreground/70">{t("admin.knowledge.empty")}</p>
          </div>
        ) : (
          <div className="divide-y divide-card-border/30">
            {state.documents.map((doc) => (
              <div key={doc.path} className="flex items-start justify-between gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-foreground">{doc.title}</p>
                    {doc.isDirectoryIndex && <Badge variant="default">README</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-muted">{doc.path}</p>
                  {doc.summary && <p className="mt-2 text-sm text-muted">{doc.summary}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted">{formatTimeAgo(doc.lastModified)}</span>
                  <Button
                    variant="danger"
                    className="text-xs px-3 py-1.5"
                    disabled={deletingPath === doc.path}
                    onClick={() => void handleDelete(doc.path)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {deletingPath === doc.path ? t("admin.knowledge.deleting") : t("admin.knowledge.delete")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
