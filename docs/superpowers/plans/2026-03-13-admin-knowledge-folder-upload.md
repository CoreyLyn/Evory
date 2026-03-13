# 管理后台知识库文件夹上传功能实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在管理后台知识库页面添加文件夹上传功能，支持拖拽和按钮选择文件夹。

**Architecture:** 扩展现有单文件上传 UI，新增文件夹选择按钮和拖拽区域。使用 `webkitdirectory` 属性和 `webkitGetAsEntry()` API 递归遍历文件夹。并发上传（最多 3 个），复用现有上传 API。

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, File System Access API

---

## File Structure

**修改文件:**
- `src/i18n/zh.ts` - 添加中文翻译
- `src/i18n/en.ts` - 添加英文翻译
- `src/app/admin/knowledge/page.tsx` - 添加文件夹上传 UI 和逻辑

**无需新建文件**

---

## Chunk 0: i18n 翻译

### Task 0: 添加翻译

**Files:**
- Modify: `src/i18n/zh.ts`
- Modify: `src/i18n/en.ts`

- [ ] **Step 1: 添加中文翻译到 `src/i18n/zh.ts`**

在 `admin.knowledge.invalidFileType` 后添加:

```typescript
  "admin.knowledge.selectFolder": "选择文件夹",
  "admin.knowledge.dropHint": "拖拽文件或文件夹到此处上传",
  "admin.knowledge.uploadPreview": "即将上传 {count} 个文件",
  "admin.knowledge.confirmUpload": "确认上传",
  "admin.knowledge.uploadingProgress": "上传中... {current}/{total}",
  "admin.knowledge.uploadComplete": "上传完成",
  "admin.knowledge.uploadFailedSome": "上传完成，{count} 个文件失败",
  "admin.knowledge.noMdFiles": "该文件夹中没有 .md 文件",
```

- [ ] **Step 2: 添加英文翻译到 `src/i18n/en.ts`**

在 `admin.knowledge.invalidFileType` 后添加:

```typescript
  "admin.knowledge.selectFolder": "Select Folder",
  "admin.knowledge.dropHint": "Drop files or folders here to upload",
  "admin.knowledge.uploadPreview": "About to upload {count} files",
  "admin.knowledge.confirmUpload": "Confirm Upload",
  "admin.knowledge.uploadingProgress": "Uploading... {current}/{total}",
  "admin.knowledge.uploadComplete": "Upload complete",
  "admin.knowledge.uploadFailedSome": "Upload complete, {count} files failed",
  "admin.knowledge.noMdFiles": "No .md files found in this folder",
```

- [ ] **Step 3: 提交翻译**

```bash
git add src/i18n/zh.ts src/i18n/en.ts
git commit -m "feat: add folder upload i18n translations"
```

---

## Chunk 1: 前端 UI 和逻辑

### Task 1: 添加文件夹上传功能

**Files:**
- Modify: `src/app/admin/knowledge/page.tsx`

- [ ] **Step 1: 添加类型定义**

在 `type KnowledgeState` 后添加:

```typescript
type FileWithPath = {
  file: File;
  relativePath: string;
};

type FolderUploadState = {
  files: FileWithPath[];
  uploading: boolean;
  progress: { current: number; total: number };
  failedFiles: Array<{ path: string; error: string }>;
};
```

- [ ] **Step 2: 添加状态和 ref**

在 `const [refreshKey, setRefreshKey] = useState(0);` 后添加:

```typescript
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [previewFiles, setPreviewFiles] = useState<FileWithPath[] | null>(null);
  const [folderUploading, setFolderUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [failedFiles, setFailedFiles] = useState<Array<{ path: string; error: string }>>([]);
```

- [ ] **Step 3: 添加拖拽处理函数**

在 `handleDelete` 函数后添加:

```typescript
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

    setPreviewFiles(files);
    setError(null);
    setSuccess(null);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }
```

- [ ] **Step 4: 添加文件遍历辅助函数**

在组件外部（`export default function AdminKnowledgePage()` 之前）添加:

```typescript
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
      // webkitRelativePath includes the selected folder name
      files.push({ file, relativePath: file.webkitRelativePath });
    }
  }
  return files;
}
```

- [ ] **Step 5: 添加文件夹选择处理函数**

在 `handleDrop` 函数后添加:

```typescript
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

    // Reset input
    if (folderInputRef.current) {
      folderInputRef.current.value = "";
    }
  }
```

- [ ] **Step 6: 添加并发上传函数**

在 `handleFolderSelect` 函数后添加:

```typescript
  async function handleFolderUpload() {
    if (!previewFiles || previewFiles.length === 0) return;

    setFolderUploading(true);
    setUploadProgress({ current: 0, total: previewFiles.length });
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
        // Remove .md extension and prepend target path
        const pathWithoutExt = item.relativePath.replace(/\.md$/, "");
        const finalPath = targetPath.trim()
          ? `${targetPath.trim()}/${pathWithoutExt}`
          : pathWithoutExt;
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
        setUploadProgress({ current: completed, total: previewFiles.length });
      }
    }

    // Run 3 concurrent workers
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
```

- [ ] **Step 7: 更新上传区域 UI**

替换现有的 Upload section (`{/* Upload section */}` 部分):

```tsx
      {/* Upload section */}
      <Card className="p-4">
        <h2 className="font-semibold text-foreground mb-4">{t("admin.knowledge.upload")}</h2>

        {/* Preview area for folder upload */}
        {previewFiles && !folderUploading && (
          <div className="mb-4 p-3 rounded-lg border border-accent/30 bg-accent/5">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium text-foreground">
                {t("admin.knowledge.uploadPreview", { count: String(previewFiles.length) })}
              </span>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={cancelPreview}>
                  {t("agents.cancel")}
                </Button>
                <Button size="sm" onClick={() => void handleFolderUpload()}>
                  {t("admin.knowledge.confirmUpload")}
                </Button>
              </div>
            </div>
            <div className="max-h-40 overflow-y-auto text-sm text-muted">
              {previewFiles.slice(0, 10).map((f) => (
                <div key={f.relativePath}>• {f.relativePath}</div>
              ))}
              {previewFiles.length > 10 && (
                <div className="text-muted/60">... and {previewFiles.length - 10} more</div>
              )}
            </div>
          </div>
        )}

        {/* Upload progress */}
        {folderUploading && (
          <div className="mb-4 p-3 rounded-lg border border-accent/30 bg-accent/5">
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 bg-background rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent transition-all"
                  style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                />
              </div>
              <span className="text-sm text-muted whitespace-nowrap">
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
          <div className="mb-4 p-3 rounded-lg border border-danger/30 bg-danger/5">
            <p className="text-sm text-danger mb-2">
              {t("admin.knowledge.uploadFailedSome", { count: String(failedFiles.length) })}
            </p>
            <div className="max-h-32 overflow-y-auto text-sm text-muted">
              {failedFiles.map((f) => (
                <div key={f.path}>• {f.path}: {f.error}</div>
              ))}
            </div>
          </div>
        )}

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
              {t("admin.knowledge.selectFolder")}
            </label>
            <input
              ref={folderInputRef}
              type="file"
              // @ts-expect-error webkitdirectory is not in types
              webkitdirectory=""
              onChange={handleFolderSelect}
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
            disabled={uploading || !selectedFile || folderUploading}
          >
            <Upload className="h-4 w-4 mr-2" />
            {uploading ? t("admin.knowledge.uploading") : t("admin.knowledge.upload")}
          </Button>
        </div>

        {/* Drop zone */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className="mt-4 p-6 border-2 border-dashed border-card-border rounded-lg text-center text-sm text-muted hover:border-accent/50 transition-colors cursor-pointer"
        >
          {t("admin.knowledge.dropHint")}
        </div>
      </Card>
```

- [ ] **Step 8: 验证页面正常工作**

手动测试：
1. 打开 `/admin/knowledge` 页面
2. 点击"选择文件夹"按钮，选择一个包含 .md 文件的文件夹
3. 确认显示预览区域
4. 点击"确认上传"开始上传
5. 确认进度条显示正常
6. 拖拽文件夹到拖拽区域，重复测试

- [ ] **Step 9: 提交更改**

```bash
git add src/app/admin/knowledge/page.tsx
git commit -m "feat: add folder upload to admin knowledge page"
```

---

## Execution Handoff

计划完成并保存到 `docs/superpowers/plans/2026-03-13-admin-knowledge-folder-upload.md`。准备执行？

**执行路径:**

**如果有 subagents (Claude Code 等):**
- **REQUIRED:** 使用 superpowers:subagent-driven-development
- 不要提供选择 - subagent-driven 是标准方法
- 每个任务一个新 subagent + 两阶段审查

**如果没有 subagents:**
- 在当前会话中使用 superpowers:executing-plans 执行
- 批量执行并设置检查点进行审查