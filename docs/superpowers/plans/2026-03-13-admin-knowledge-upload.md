# 管理后台知识库文档上传功能实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在管理后台添加知识库文档上传功能，让管理员可以通过 Web UI 上传 Markdown 文档到 `knowledge/` 目录。

**Architecture:** 添加一个专用的管理后台知识库页面 `/admin/knowledge`，包含文档浏览、上传和删除功能。使用 FormData 处理文件上传，写入到文件系统的 `knowledge/` 目录，然后刷新知识库索引。

**Tech Stack:** Next.js 16 App Router, React 19, Node.js fs/promises API, Node.js native test runner

---

## File Structure

**新建文件:**
- `src/app/admin/knowledge/page.tsx` - 管理后台知识库页面
- `src/app/api/admin/knowledge/upload/route.ts` - 文档上传 API
- `src/app/api/admin/knowledge/upload/route.test.ts` - 上传 API 测试
- `src/app/api/admin/knowledge/documents/route.ts` - 文档列表 API
- `src/app/api/admin/knowledge/documents/route.test.ts` - 文档列表 API 测试
- `src/app/api/admin/knowledge/documents/[path]/route.ts` - 单个文档操作 API (删除)
- `src/app/api/admin/knowledge/documents/[path]/route.test.ts` - 单个文档 API 测试
- `src/lib/admin-knowledge-upload.ts` - 文件上传处理逻辑

**修改文件:**
- `src/app/admin/page.tsx` - 添加知识库管理入口 Tab
- `src/lib/knowledge-base/service.ts` - 添加单个文档刷新函数
- `src/i18n/zh.ts` - 添加中翻译
- `src/i18n/en.ts` - 添加英翻译

---

## Chunk 0: API Endpoint - 文档列表

### Task 0: 创建文档列表 API

**Files:**
- Create: `src/app/api/admin/knowledge/documents/route.ts`
- Create: `src/app/api/admin/knowledge/documents/route.test.ts`

- [ ] **Step 1: 编写失败的测试 - 认证失败返回 401**

```typescript
import assert from "node:assert/strict";
import test from "node:test";

import { createRouteRequest } from "@/test/request-helpers";
import { GET } from "./route";

test("GET /api/admin/knowledge/documents returns 401 when not authenticated", async () => {
  const response = await GET(createRouteRequest("http://localhost/api/admin/knowledge/documents"));
  const json = await response.json();

  assert.equal(response.status, 401);
  assert.equal(json.success, false);
  assert.equal(json.error, "Unauthorized");
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `node --import tsx --test src/app/api/admin/knowledge/documents/route.test.ts`
Expected: FAIL with "GET is not defined"

- [ ] **Step 3: 实现 GET 函数骨架**

```typescript
import { NextRequest } from "next/server";
import { authenticateAdmin } from "@/lib/admin-auth";
import { notForAgentsResponse } from "@/lib/agent-api-contract";
import { getCurrentKnowledgeBase } from "@/lib/knowledge-base/api";

export async function GET(request: NextRequest) {
  const auth = await authenticateAdmin(request);
  if (auth.type === "error") return notForAgentsResponse(auth.response);

  return Response.json({ success: true, data: [] });
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `node --import tsx --test src/app/api/admin/knowledge/documents/route.test.ts`
Expected: PASS

- [ ] **Step 5: 编写失败的测试 - 成功返回文档列表**

```typescript
test("GET /api/admin/knowledge/documents returns document list for admin", async () => {
  // Mock authenticateAdmin to return admin user
  const response = await GET(
    createRouteRequest("http://localhost/api/admin/knowledge/documents", {
      headers: { cookie: "evory_user_session=admin-session" },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.ok(Array.isArray(json.data));
});
```

- [ ] **Step 6: 实现完整的文档列表逻辑**

```typescript
import { NextRequest } from "next/server";
import { authenticateAdmin } from "@/lib/admin-auth";
import { notForAgentsResponse } from "@/lib/agent-api-contract";
import { getCurrentKnowledgeBase } from "@/lib/knowledge-base/api";

type DocumentListItem = {
  path: string;
  title: string;
  summary: string;
  lastModified: string;
  isDirectoryIndex: boolean;
};

export async function GET(request: NextRequest) {
  const auth = await authenticateAdmin(request);
  if (auth.type === "error") return notForAgentsResponse(auth.response);

  const knowledgeBase = await getCurrentKnowledgeBase();

  if (knowledgeBase.status === "not_configured") {
    return notForAgentsResponse(
      Response.json({
        success: true,
        data: [],
        configured: false,
        rootDir: knowledgeBase.rootDir,
      })
    );
  }

  const documents: DocumentListItem[] = [];
  const { searchEntriesByPath } = knowledgeBase.index;

  for (const [path, entry] of searchEntriesByPath) {
    const doc = knowledgeBase.index.documentsByPath.get(path);
    if (doc) {
      documents.push({
        path: doc.path,
        title: doc.title,
        summary: doc.summary,
        lastModified: doc.lastModified,
        isDirectoryIndex: doc.isDirectoryIndex,
      });
    }
  }

  // Sort by path
  documents.sort((a, b) => a.path.localeCompare(b.path));

  return notForAgentsResponse(
    Response.json({
      success: true,
      data: documents,
      configured: true,
      rootDir: knowledgeBase.rootDir,
    })
  );
}
```

- [ ] **Step 7: 运行测试验证通过**

Run: `node --import tsx --test src/app/api/admin/knowledge/documents/route.test.ts`
Expected: PASS

- [ ] **Step 8: 提交文档列表 API**

```bash
git add src/app/api/admin/knowledge/documents/route.ts src/app/api/admin/knowledge/documents/route.test.ts
git commit -m "feat: add admin knowledge documents list API"
```

---

## Chunk 1: API Endpoint - 文档上传

### Task 1: 创建文件上传处理工具函数

**Files:**
- Create: `src/lib/admin-knowledge-upload.ts`

- [ ] **Step 1: 创建上传处理函数**

```typescript
import { mkdir, writeFile, stat } from "node:fs/promises";
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
  } catch (error) {
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
```

- [ ] **Step 2: 提交上传工具函数**

```bash
git add src/lib/admin-knowledge-upload.ts
git commit -m "feat: add admin knowledge upload utility functions"
```

### Task 2: 创建文档上传 API

**Files:**
- Create: `src/app/api/admin/knowledge/upload/route.ts`
- Create: `src/app/api/admin/knowledge/upload/route.test.ts`

- [ ] **Step 1: 编写失败的测试 - 认证失败返回 401**

```typescript
import assert from "node:assert/strict";
import test from "node:test";

import { createRouteRequest } from "@/test/request-helpers";
import { POST } from "./route";

test("POST /api/admin/knowledge/upload returns 401 when not authenticated", async () => {
  const formData = new FormData();
  formData.append("file", new Blob(["# Test"], { type: "text/markdown" }), "test.md");

  const response = await POST(
    createRouteRequest("http://localhost/api/admin/knowledge/upload", {
      method: "POST",
      body: formData,
    })
  );
  const json = await response.json();

  assert.equal(response.status, 401);
  assert.equal(json.success, false);
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `node --import tsx --test src/app/api/admin/knowledge/upload/route.test.ts`
Expected: FAIL with "POST is not defined"

- [ ] **Step 3: 实现 POST 函数骨架**

```typescript
import { NextRequest } from "next/server";
import { authenticateAdmin } from "@/lib/admin-auth";
import { notForAgentsResponse } from "@/lib/agent-api-contract";
import { enforceSameOriginControlPlaneRequest } from "@/lib/request-security";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const auth = await authenticateAdmin(request);
  if (auth.type === "error") return notForAgentsResponse(auth.response);

  const sameOriginRejected = await enforceSameOriginControlPlaneRequest({
    request,
    routeKey: "admin-knowledge-upload",
    userId: auth.user.id,
  });
  if (sameOriginRejected) return notForAgentsResponse(sameOriginRejected);

  const rateLimited = await enforceRateLimit({
    bucketId: "admin-knowledge-upload",
    routeKey: "admin-knowledge-upload",
    maxRequests: 20,
    windowMs: 10 * 60 * 1000,
    request,
    subjectId: auth.user.id,
    userId: auth.user.id,
  });
  if (rateLimited) return notForAgentsResponse(rateLimited);

  return Response.json({ success: true, data: { path: "" } });
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `node --import tsx --test src/app/api/admin/knowledge/upload/route.test.ts`
Expected: PASS

- [ ] **Step 5: 编写失败的测试 - 成功上传文档**

```typescript
test("POST /api/admin/knowledge/upload uploads a markdown file", async () => {
  // This test would need mocking of the file system
  // For now, we'll test the validation logic
  const formData = new FormData();
  formData.append("file", new Blob(["# Test Document\n\nThis is a test."], { type: "text/markdown" }), "test-upload.md");
  formData.append("path", "test-upload");

  const response = await POST(
    createRouteRequest("http://localhost/api/admin/knowledge/upload", {
      method: "POST",
      body: formData,
      headers: {
        cookie: "evory_user_session=admin-session",
        origin: "http://localhost",
      },
    })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
});
```

- [ ] **Step 6: 实现完整的上传逻辑**

```typescript
import { NextRequest } from "next/server";
import { authenticateAdmin } from "@/lib/admin-auth";
import { notForAgentsResponse } from "@/lib/agent-api-contract";
import { enforceSameOriginControlPlaneRequest } from "@/lib/request-security";
import { enforceRateLimit } from "@/lib/rate-limit";
import { resolveKnowledgeBaseRoot } from "@/lib/knowledge-base/config";
import {
  uploadKnowledgeDocument,
  validateMarkdownContent,
} from "@/lib/admin-knowledge-upload";
import { refreshKnowledgeBase } from "@/lib/knowledge-base/service";

export async function POST(request: NextRequest) {
  const auth = await authenticateAdmin(request);
  if (auth.type === "error") return notForAgentsResponse(auth.response);

  const sameOriginRejected = await enforceSameOriginControlPlaneRequest({
    request,
    routeKey: "admin-knowledge-upload",
    userId: auth.user.id,
  });
  if (sameOriginRejected) return notForAgentsResponse(sameOriginRejected);

  const rateLimited = await enforceRateLimit({
    bucketId: "admin-knowledge-upload",
    routeKey: "admin-knowledge-upload",
    maxRequests: 20,
    windowMs: 10 * 60 * 1000,
    request,
    subjectId: auth.user.id,
    userId: auth.user.id,
  });
  if (rateLimited) return notForAgentsResponse(rateLimited);

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const targetPath = formData.get("path");

    if (!file || !(file instanceof File)) {
      return notForAgentsResponse(
        Response.json({ success: false, error: "No file provided" }, { status: 400 })
      );
    }

    if (file.type !== "text/markdown" && !file.name.endsWith(".md")) {
      return notForAgentsResponse(
        Response.json({ success: false, error: "Only .md files are allowed" }, { status: 400 })
      );
    }

    const content = await file.text();
    const contentError = validateMarkdownContent(content);
    if (contentError) {
      return notForAgentsResponse(
        Response.json({ success: false, error: contentError }, { status: 400 })
      );
    }

    const knowledgeBaseDir = resolveKnowledgeBaseRoot({
      cwd: process.cwd(),
      env: process.env,
    });

    const result = await uploadKnowledgeDocument({
      knowledgeBaseDir,
      targetPath: typeof targetPath === "string" ? targetPath : file.name.replace(/\.md$/, ""),
      content,
    });

    if (!result.success) {
      return notForAgentsResponse(
        Response.json({ success: false, error: result.error }, { status: 400 })
      );
    }

    // Refresh the knowledge base index
    await refreshKnowledgeBase({ cwd: process.cwd(), env: process.env });

    return notForAgentsResponse(
      Response.json({
        success: true,
        data: {
          path: result.path,
          absolutePath: result.absolutePath,
        },
      })
    );
  } catch (error) {
    console.error("[admin/knowledge/upload POST]", error);
    return notForAgentsResponse(
      Response.json({ success: false, error: "Internal server error" }, { status: 500 })
    );
  }
}
```

- [ ] **Step 7: 运行测试验证**

Run: `node --import tsx --test src/app/api/admin/knowledge/upload/route.test.ts`
Expected: PASS

- [ ] **Step 8: 提交上传 API**

```bash
git add src/app/api/admin/knowledge/upload/route.ts src/app/api/admin/knowledge/upload/route.test.ts
git commit -m "feat: add admin knowledge upload API"
```

---

## Chunk 2: API Endpoint - 文档删除

### Task 3: 创建文档删除 API

**Files:**
- Create: `src/app/api/admin/knowledge/documents/[path]/route.ts`
- Create: `src/app/api/admin/knowledge/documents/[path]/route.test.ts`

- [ ] **Step 1: 编写失败的测试 - 认证失败返回 401**

```typescript
import assert from "node:assert/strict";
import test from "node:test";

import { createRouteRequest, createRouteParams } from "@/test/request-helpers";
import { DELETE } from "./route";

test("DELETE /api/admin/knowledge/documents/[path] returns 401 when not authenticated", async () => {
  const response = await DELETE(
    createRouteRequest("http://localhost/api/admin/knowledge/documents/test-doc"),
    createRouteParams({ path: "test-doc" })
  );
  const json = await response.json();

  assert.equal(response.status, 401);
  assert.equal(json.success, false);
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `node --import tsx --test "src/app/api/admin/knowledge/documents/[path]/route.test.ts"`
Expected: FAIL with "DELETE is not defined"

- [ ] **Step 3: 实现 DELETE 函数**

```typescript
import { NextRequest } from "next/server";
import { unlink, stat } from "node:fs/promises";
import path from "node:path";

import { authenticateAdmin } from "@/lib/admin-auth";
import { notForAgentsResponse } from "@/lib/agent-api-contract";
import { enforceSameOriginControlPlaneRequest } from "@/lib/request-security";
import { enforceRateLimit } from "@/lib/rate-limit";
import { resolveKnowledgeBaseRoot } from "@/lib/knowledge-base/config";
import { refreshKnowledgeBase } from "@/lib/knowledge-base/service";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string }> }
) {
  const auth = await authenticateAdmin(request);
  if (auth.type === "error") return notForAgentsResponse(auth.response);

  const sameOriginRejected = await enforceSameOriginControlPlaneRequest({
    request,
    routeKey: "admin-knowledge-delete",
    userId: auth.user.id,
  });
  if (sameOriginRejected) return notForAgentsResponse(sameOriginRejected);

  const rateLimited = await enforceRateLimit({
    bucketId: "admin-knowledge-delete",
    routeKey: "admin-knowledge-delete",
    maxRequests: 20,
    windowMs: 10 * 60 * 1000,
    request,
    subjectId: auth.user.id,
    userId: auth.user.id,
  });
  if (rateLimited) return notForAgentsResponse(rateLimited);

  const { path: docPath } = await params;

  // Validate the path to prevent traversal attacks
  const normalizedPath = path.normalize(decodeURIComponent(docPath));
  if (normalizedPath.startsWith("..") || path.isAbsolute(normalizedPath)) {
    return notForAgentsResponse(
      Response.json({ success: false, error: "Invalid path" }, { status: 400 })
    );
  }

  const knowledgeBaseDir = resolveKnowledgeBaseRoot({
    cwd: process.cwd(),
    env: process.env,
  });

  // Try to find the file
  const possiblePaths = [
    path.join(knowledgeBaseDir, normalizedPath + ".md"),
    path.join(knowledgeBaseDir, normalizedPath, "index.md"),
  ];

  let filePath: string | null = null;
  for (const p of possiblePaths) {
    try {
      await stat(p);
      filePath = p;
      break;
    } catch {
      // File doesn't exist at this path
    }
  }

  if (!filePath) {
    return notForAgentsResponse(
      Response.json({ success: false, error: "Document not found" }, { status: 404 })
    );
  }

  try {
    await unlink(filePath);
    await refreshKnowledgeBase({ cwd: process.cwd(), env: process.env });

    return notForAgentsResponse(
      Response.json({ success: true, data: { path: docPath } })
    );
  } catch (error) {
    console.error("[admin/knowledge/documents/[path] DELETE]", error);
    return notForAgentsResponse(
      Response.json({ success: false, error: "Failed to delete document" }, { status: 500 })
    );
  }
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `node --import tsx --test "src/app/api/admin/knowledge/documents/[path]/route.test.ts"`
Expected: PASS

- [ ] **Step 5: 提交删除 API**

```bash
git add "src/app/api/admin/knowledge/documents/[path]/route.ts" "src/app/api/admin/knowledge/documents/[path]/route.test.ts"
git commit -m "feat: add admin knowledge document delete API"
```

---

## Chunk 3: Frontend UI

### Task 4: 添加 i18n 翻译

**Files:**
- Modify: `src/i18n/zh.ts`
- Modify: `src/i18n/en.ts`

- [ ] **Step 1: 添加中文翻译**

在 `src/i18n/zh.ts` 的 `admin` 部分后添加:

```typescript
  // admin knowledge
  "admin.knowledge.title": "知识库管理",
  "admin.knowledge.subtitle": "上传和管理知识库文档",
  "admin.knowledge.tab": "知识库",
  "admin.knowledge.empty": "知识库暂无文档",
  "admin.knowledge.notConfigured": "知识库未配置",
  "admin.knowledge.notConfiguredDesc": "请设置 KNOWLEDGE_BASE_DIR 环境变量",
  "admin.knowledge.upload": "上传文档",
  "admin.knowledge.uploading": "上传中...",
  "admin.knowledge.uploadSuccess": "文档上传成功",
  "admin.knowledge.uploadFailed": "上传失败",
  "admin.knowledge.delete": "删除",
  "admin.knowledge.deleting": "删除中...",
  "admin.knowledge.deleteSuccess": "文档已删除",
  "admin.knowledge.deleteFailed": "删除失败",
  "admin.knowledge.confirmDelete": "确定要删除这篇文档吗？",
  "admin.knowledge.path": "路径",
  "admin.knowledge.lastModified": "最后修改",
  "admin.knowledge.selectFile": "选择文件",
  "admin.knowledge.targetPath": "目标路径（可选）",
  "admin.knowledge.targetPathPlaceholder": "例如: guides/new-guide",
  "admin.knowledge.noFileSelected": "请选择文件",
  "admin.knowledge.invalidFileType": "只支持 .md 文件",
```

- [ ] **Step 2: 添加英文翻译**

在 `src/i18n/en.ts` 的 `admin` 部分后添加:

```typescript
  // admin knowledge
  "admin.knowledge.title": "Knowledge Base Management",
  "admin.knowledge.subtitle": "Upload and manage knowledge base documents",
  "admin.knowledge.tab": "Knowledge",
  "admin.knowledge.empty": "No documents in knowledge base",
  "admin.knowledge.notConfigured": "Knowledge base not configured",
  "admin.knowledge.notConfiguredDesc": "Please set the KNOWLEDGE_BASE_DIR environment variable",
  "admin.knowledge.upload": "Upload Document",
  "admin.knowledge.uploading": "Uploading...",
  "admin.knowledge.uploadSuccess": "Document uploaded successfully",
  "admin.knowledge.uploadFailed": "Upload failed",
  "admin.knowledge.delete": "Delete",
  "admin.knowledge.deleting": "Deleting...",
  "admin.knowledge.deleteSuccess": "Document deleted",
  "admin.knowledge.deleteFailed": "Delete failed",
  "admin.knowledge.confirmDelete": "Are you sure you want to delete this document?",
  "admin.knowledge.path": "Path",
  "admin.knowledge.lastModified": "Last Modified",
  "admin.knowledge.selectFile": "Select file",
  "admin.knowledge.targetPath": "Target Path (optional)",
  "admin.knowledge.targetPathPlaceholder": "e.g., guides/new-guide",
  "admin.knowledge.noFileSelected": "Please select a file",
  "admin.knowledge.invalidFileType": "Only .md files are supported",
```

- [ ] **Step 3: 提交翻译**

```bash
git add src/i18n/zh.ts src/i18n/en.ts
git commit -m "feat: add admin knowledge i18n translations"
```

### Task 5: 创建管理后台知识库页面

**Files:**
- Create: `src/app/admin/knowledge/page.tsx`

- [ ] **Step 1: 创建知识库管理页面组件**

```typescript
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
    loadDocuments();
  }, [authed]);

  function loadDocuments() {
    setLoading(true);
    fetch("/api/admin/knowledge/documents")
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          setState({
            configured: json.configured,
            rootDir: json.rootDir,
            documents: json.data,
          });
        } else {
          setError(json.error || t("admin.actionFailed"));
        }
      })
      .catch(() => setError(t("admin.actionFailed")))
      .finally(() => setLoading(false));
  }

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
        loadDocuments();
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
        loadDocuments();
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
                      <Badge variant="secondary" className="text-xs">
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
```

- [ ] **Step 2: 提交页面组件**

```bash
git add src/app/admin/knowledge/page.tsx
git commit -m "feat: add admin knowledge management page"
```

### Task 6: 修改管理后台首页添加知识库入口

**Files:**
- Modify: `src/app/admin/page.tsx`

- [ ] **Step 1: 添加知识库管理 Tab**

修改 `src/app/admin/page.tsx`，在 tab 切换部分添加知识库选项：

```tsx
// 在 tab 状态中添加
const [tab, setTab] = useState<"all" | "hidden" | "knowledge">("all");

// 在 tab 切换器中添加
{(["all", "hidden", "knowledge"] as const).map((value) => (
  <button
    key={value}
    onClick={() => {
      setTab(value);
      setPage(1);
      setExpandedId(null);
      setReplies({});
    }}
    className={`rounded-xl px-4 py-2 text-sm font-medium transition-all duration-300 ${
      tab === value
        ? "text-accent bg-accent/10 shadow-[inset_0_0_0_1px_rgba(255,107,74,0.2)]"
        : "text-muted hover:text-foreground hover:bg-foreground/[0.04]"
    }`}
  >
    {value === "all"
      ? t("admin.tabAll")
      : value === "hidden"
        ? t("admin.tabHidden")
        : t("admin.knowledge.tab")}
  </button>
))}
```

- [ ] **Step 2: 添加 Tab 内容切换**

在帖子列表渲染前添加 tab 判断：

```tsx
// 如果是知识库 tab，渲染知识库管理组件
if (tab === "knowledge") {
  return <AdminKnowledgeView />;
}
```

- [ ] **Step 3: 或者使用路由跳转**

替代方案：点击知识库 tab 时跳转到 `/admin/knowledge`：

```tsx
<button
  key="knowledge"
  onClick={() => router.push("/admin/knowledge")}
  className="rounded-xl px-4 py-2 text-sm font-medium transition-all duration-300 text-muted hover:text-foreground hover:bg-foreground/[0.04]"
>
  {t("admin.knowledge.tab")}
</button>
```

- [ ] **Step 4: 提交修改**

```bash
git add src/app/admin/page.tsx
git commit -m "feat: add knowledge tab to admin page"
```

---

## Chunk 4: Integration & Testing

### Task 7: 运行全量测试

- [ ] **Step 1: 运行全量测试**

Run: `npm test`
Expected: PASS

- [ ] **Step 2: 运行 lint**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 3: 构建项目**

Run: `npm run build`
Expected: Build successful

### Task 8: 提交最终集成

- [ ] **Step 1: 提交所有剩余更改**

```bash
git add -A
git commit -m "feat: complete admin knowledge document upload feature"
```

---

## Execution Handoff

计划完成并保存到 `docs/superpowers/plans/2026-03-13-admin-knowledge-upload.md`。准备执行？

**执行路径:**

**如果有 subagents (Claude Code 等):**
- **REQUIRED:** 使用 superpowers:subagent-driven-development
- 不要提供选择 - subagent-driven 是标准方法
- 每个任务一个新 subagent + 两阶段审查

**如果没有 subagents:**
- 在当前会话中使用 superpowers:executing-plans 执行
- 批量执行并设置检查点进行审查