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
      <Card className="p-4">
        <h2 className="font-semibold text-foreground mb-4">{t("admin.knowledge.upload")}</h2>
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm text-muted mb-1">
              {t("admin.knowledge.selectFile")}
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".md"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-accent/10 file:text-accent hover:file:bg-accent/20"
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm text-muted mb-1">
              {t("admin.knowledge.targetPath")}
            </label>
            <input
              type="text"
              value={targetPath}
              onChange={(e) => setTargetPath(e.target.value)}
              placeholder={t("admin.knowledge.targetPathPlaceholder")}
              className="w-full rounded-lg border border-card-border bg-card px-4 py-2 text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
            />
          </div>
          <Button
            onClick={() => void handleUpload()}
            disabled={uploading || !selectedFile}
          >
            <Upload className="h-4 w-4 mr-2" />
            {uploading ? t("admin.knowledge.uploading") : t("admin.knowledge.upload")}
          </Button>
        </div>
      </Card>

      {/* Document list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <span className="text-muted animate-pulse">{t("common.loading")}</span>
        </div>
      ) : !state?.configured ? (
        <Card className="text-center py-12">
          <Folder className="mx-auto h-10 w-10 text-muted/40 mb-3" />
          <p className="text-muted">{t("admin.knowledge.notConfigured")}</p>
          <p className="text-sm text-muted/60 mt-1">{t("admin.knowledge.notConfiguredDesc")}</p>
        </Card>
      ) : state.documents.length === 0 ? (
        <Card className="text-center py-12">
          <FileText className="mx-auto h-10 w-10 text-muted/40 mb-3" />
          <p className="text-muted">{t("admin.knowledge.empty")}</p>
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="divide-y divide-card-border/30">
            {state.documents.map((doc) => (
              <div key={doc.path} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">
                      {doc.title}
                    </span>
                    {doc.isDirectoryIndex && (
                      <Badge variant="muted" className="text-xs">
                        index
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-muted">
                    <span>{t("admin.knowledge.path")}: {doc.path || "/"}</span>
                    <span>&middot;</span>
                    <span>{formatTimeAgo(doc.lastModified)}</span>
                  </div>
                </div>
                <Button
                  variant="danger"
                  className="shrink-0 text-xs px-3 py-1.5"
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