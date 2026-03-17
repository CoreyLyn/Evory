"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, Upload, Trash2, FileText, Folder } from "lucide-react";

import { useT } from "@/i18n";
import { useFormatTimeAgo } from "@/lib/useFormatTime";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { normalizeFolderUploadFiles, type FileWithPath } from "./upload-paths";

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

export default function AdminKnowledgePage() {
  const t = useT();
  const formatTimeAgo = useFormatTimeAgo();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<KnowledgeState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [targetPath, setTargetPath] = useState("");
  const [deletingPath, setDeletingPath] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [previewFiles, setPreviewFiles] = useState<FileWithPath[] | null>(null);
  const [folderUploading, setFolderUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [failedFiles, setFailedFiles] = useState<Array<{ path: string; error: string }>>([]);

  // Auth check
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.data?.role === "ADMIN") {
          setAuthed(true);
        } else {
          window.location.href = "/";
        }
      })
      .catch(() => (window.location.href = "/"));
  }, []);

  // Load documents
  useEffect(() => {
    if (!authed) return;

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
    loadDocuments();
    return () => { cancelled = true; };
  }, [authed, t, refreshKey]);

  // Auto-clear success message
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
        setRefreshKey((k) => k + 1);
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
        setRefreshKey((k) => k + 1);
      } else {
        setError(json.error || t("admin.knowledge.deleteFailed"));
      }
    } catch {
      setError(t("admin.knowledge.deleteFailed"));
    } finally {
      setDeletingPath(null);
    }
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();

    const items = Array.from(e.dataTransfer.items);
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

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleFolderSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const fileList = e.target.files;
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

    const results = { success: 0, failed: [] as Array<{ path: string; error: string }> };
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
          if (json.success) {
            results.success++;
          } else {
            results.failed.push({ path: item.relativePath, error: json.error || "Upload failed" });
          }
        } catch {
          results.failed.push({ path: item.relativePath, error: "Network error" });
        }

        completed++;
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

    setRefreshKey((k) => k + 1);
  }

  function cancelPreview() {
    setPreviewFiles(null);
    setFailedFiles([]);
  }

  if (!authed) {
    return (
      <div className="flex items-center justify-center py-32">
        <span className="text-muted animate-pulse">{t("common.loading")}</span>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-fade-in-up">
      <PageHeader
        title={t("admin.knowledge.title")}
        description={t("admin.knowledge.subtitle")}
        rightSlot={
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("admin.backToSite")}
          </Link>
        }
      />

      {/* Error banner */}
      {error && (
        <div className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Success banner */}
      {success && (
        <div className="rounded-xl border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
          {success}
        </div>
      )}

      {/* Upload section */}
      <Card className="p-5">
        <h2 className="font-semibold text-foreground mb-4">{t("admin.knowledge.upload")}</h2>

        {/* Preview area for folder upload */}
        {previewFiles && !folderUploading && (
          <div className="mb-4 p-4 rounded-xl border border-accent/20 bg-accent/5">
            <div className="flex items-center justify-between mb-3">
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
            <div className="max-h-40 overflow-y-auto text-sm text-muted space-y-0.5">
              {previewFiles.slice(0, 10).map((f) => (
                <div key={f.relativePath} className="flex items-center gap-1.5">
                  <FileText className="h-3 w-3 shrink-0 text-muted/50" />
                  <span className="truncate">{f.relativePath}</span>
                </div>
              ))}
              {previewFiles.length > 10 && (
                <div className="text-muted/60 pl-[18px]">... and {previewFiles.length - 10} more</div>
              )}
            </div>
          </div>
        )}

        {/* Upload progress */}
        {folderUploading && (
          <div className="mb-4 p-4 rounded-xl border border-accent/20 bg-accent/5">
            <div className="flex items-center gap-3">
              <div className="flex-1 h-1.5 bg-background rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full transition-all duration-300"
                  style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                />
              </div>
              <span className="text-sm text-muted whitespace-nowrap tabular-nums">
                {t("admin.knowledge.uploadingProgress", {
                  current: String(uploadProgress.current),
                  total: String(uploadProgress.total),
                })}
              </span>
            </div>
          </div>
        )}

        {/* Failed files list */}
        {failedFiles.length > 0 && (
          <div className="mb-4 p-4 rounded-xl border border-danger/20 bg-danger/5">
            <p className="text-sm text-danger font-medium mb-2">
              {t("admin.knowledge.uploadFailedSome", { count: String(failedFiles.length) })}
            </p>
            <div className="max-h-32 overflow-y-auto text-sm text-muted space-y-0.5">
              {failedFiles.map((f) => (
                <div key={f.path} className="flex items-center gap-1.5">
                  <span className="text-danger/60 shrink-0">&times;</span>
                  <span className="truncate">{f.path}</span>
                  <span className="text-muted/50 shrink-0">{f.error}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Upload controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <label className="group flex items-center gap-3 rounded-xl border border-card-border/50 bg-background/40 px-4 py-3 cursor-pointer hover:border-accent/30 hover:bg-accent/[0.03] transition-all">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent group-hover:bg-accent/15 transition-colors">
              <FileText className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-foreground">{t("admin.knowledge.selectFile")}</div>
              <div className="text-xs text-muted truncate">
                {selectedFile ? selectedFile.name : ".md"}
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".md"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              className="sr-only"
            />
          </label>

          <label className="group flex items-center gap-3 rounded-xl border border-card-border/50 bg-background/40 px-4 py-3 cursor-pointer hover:border-accent/30 hover:bg-accent/[0.03] transition-all">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent group-hover:bg-accent/15 transition-colors">
              <Folder className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-foreground">{t("admin.knowledge.selectFolder")}</div>
              <div className="text-xs text-muted">.md</div>
            </div>
            <input
              ref={folderInputRef}
              type="file"
              // @ts-expect-error webkitdirectory is not in types
              webkitdirectory=""
              onChange={handleFolderSelect}
              className="sr-only"
            />
          </label>
        </div>

        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="block text-xs text-muted mb-1.5">
              {t("admin.knowledge.targetPath")}
            </label>
            <input
              type="text"
              value={targetPath}
              onChange={(e) => setTargetPath(e.target.value)}
              placeholder={t("admin.knowledge.targetPathPlaceholder")}
              className="w-full rounded-xl border border-card-border/50 bg-background/40 px-4 py-2.5 text-sm text-foreground placeholder:text-muted/60 focus:border-accent/40 focus:outline-none transition-colors"
            />
          </div>
          <Button
            onClick={() => void handleUpload()}
            disabled={uploading || !selectedFile || folderUploading}
            className="shrink-0"
          >
            <Upload className="h-4 w-4 mr-2" />
            {uploading ? t("admin.knowledge.uploading") : t("admin.knowledge.upload")}
          </Button>
        </div>

        {/* Drop zone */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className="group mt-4 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-card-border/60 bg-background/20 py-8 text-center transition-all hover:border-accent/40 hover:bg-accent/[0.02] cursor-pointer"
        >
          <Upload className="h-5 w-5 text-muted/40 group-hover:text-accent/50 transition-colors" />
          <span className="text-sm text-muted/70 group-hover:text-muted transition-colors">
            {t("admin.knowledge.dropHint")}
          </span>
        </div>
      </Card>

      {/* Document list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <span className="text-muted animate-pulse">{t("common.loading")}</span>
        </div>
      ) : !state?.configured ? (
        <Card className="text-center py-16">
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/[0.06]">
              <Folder className="h-7 w-7 text-muted/30" />
            </div>
            <div>
              <p className="text-foreground/70 font-medium">{t("admin.knowledge.notConfigured")}</p>
              <p className="text-sm text-muted/60 mt-1">{t("admin.knowledge.notConfiguredDesc")}</p>
            </div>
          </div>
        </Card>
      ) : state.documents.length === 0 ? (
        <Card className="text-center py-16">
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/[0.06]">
              <FileText className="h-7 w-7 text-muted/30" />
            </div>
            <p className="text-foreground/70 font-medium">{t("admin.knowledge.empty")}</p>
          </div>
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="divide-y divide-card-border/30">
            {state.documents.map((doc) => (
              <div key={doc.path} className="group flex items-center gap-3 px-5 py-3.5 hover:bg-foreground/[0.02] transition-colors">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/[0.07] text-accent/60">
                  <FileText className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-foreground">
                      {doc.title}
                    </span>
                    {doc.isDirectoryIndex && (
                      <Badge variant="muted" className="text-xs">
                        index
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-muted">
                    <span className="truncate">{doc.path || "/"}</span>
                    <span>&middot;</span>
                    <span className="shrink-0">{formatTimeAgo(doc.lastModified)}</span>
                  </div>
                </div>
                <Button
                  variant="danger"
                  className="shrink-0 text-xs px-3 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  disabled={deletingPath === doc.path}
                  onClick={() => void handleDelete(doc.path)}
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  {deletingPath === doc.path
                    ? t("admin.knowledge.deleting")
                    : t("admin.knowledge.delete")}
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
