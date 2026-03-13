# 管理后台知识库文件夹上传功能设计

> **Status:** Draft - Pending Review

**Goal:** 在管理后台知识库页面添加文件夹上传功能，让管理员可以一次性上传整个文件夹的 Markdown 文档。

**Context:** 基于已实现的单文件上传功能扩展，复用现有 API 和工具函数。

---

## 需求

- **交互方式**: 支持拖拽和按钮选择文件夹两种方式
- **冲突处理**: 上传时直接覆盖已存在的文档
- **路径映射**: 保留文件夹原结构（如上传 `guides` 文件夹，路径为 `guides/...`）
- **预览确认**: 选择文件夹后显示文件名列表和总数，用户确认后开始上传

---

## 设计

### 前端 UI 改动

**上传区域**

在现有单文件上传区域扩展，新增文件夹选择按钮和拖拽区域：

```
┌─────────────────────────────────────────────────┐
│  上传文档                                        │
│  ┌──────────────────┐  ┌──────────────────┐     │
│  │ 选择文件         │  │ 选择文件夹        │     │
│  └──────────────────┘  └──────────────────┘     │
│                                                 │
│  目标路径（可选）: [                      ]      │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │     拖拽文件或文件夹到此处上传            │   │
│  └─────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

**预览 UI**

选择文件夹后，在页面上方显示预览区域（非弹窗），包含文件名列表和总数：

```
┌─────────────────────────────────────────────────┐
│  即将上传 5 个文件              [取消] [确认上传] │
│                                                 │
│  • guides/getting-started.md                    │
│  • guides/advanced/README.md                    │
│  • guides/advanced/tips.md                      │
│  • guides/troubleshooting.md                    │
│  • guides/faq.md                                │
└─────────────────────────────────────────────────┘
```

**设计说明**: 使用内联展开方式而非弹窗，因为：
1. 页面本身已有清晰的上下文
2. 文件夹上传是低频操作，不需要专门的 modal 组件
3. 实现更简单，无需新增组件

### 前端逻辑

**文件夹读取流程**

1. 用户选择或拖拽文件夹
   - 使用 `<input type="file" webkitdirectory>` 属性支持按钮选择
   - 使用 `DataTransferItem.webkitGetAsEntry()` API 支持拖拽
2. 递归遍历文件夹
   - 筛选出所有 `.md` 文件
   - 记录每个文件相对于文件夹根的相对路径
3. 显示预览区域
   - 展示文件名列表（显示相对路径）
   - 显示文件总数
4. 用户确认后上传
   - 使用现有 `POST /api/admin/knowledge/upload` API
   - 并发上传，最多 3 个文件同时上传

**上传进度**

- 显示进度条：`上传中... 3/5`
- 全部完成后显示成功消息
- 如有失败，显示失败文件列表及错误原因

**并发控制**

使用 `p-limit` 或手动实现并发限制：
- 最大并发数: 3
- 每个文件上传完成后更新进度
- 全部完成后刷新文档列表

**目标路径处理**

- 如果用户填写了目标路径（如 `docs`），文件会上传到 `docs/{folder-name}/...`
- 如果未填写，文件会上传到 `{folder-name}/...`
- 每个文件的 `path` 参数 = 目标路径 + 文件相对路径

**错误处理**

上传失败时显示失败文件列表，包含：
- 文件路径
- 错误原因（来自 API 响应的 `error` 字段）

示例：
```
上传完成，2 个文件失败：
• guides/advanced/tips.md: Invalid path: path traversal detected
• guides/secret.md: Content exceeds maximum size of 1MB
```

### 后端

**无需新增 API**

复用现有单文件上传 API：
- `POST /api/admin/knowledge/upload`
- `uploadKnowledgeDocument()` 工具函数

### 文件结构

**修改文件:**
- `src/app/admin/knowledge/page.tsx` - 添加文件夹上传 UI 和逻辑
- `src/i18n/zh.ts` - 添加中文翻译
- `src/i18n/en.ts` - 添加英文翻译

**无需新建文件**

---

## i18n 翻译 Key

```typescript
// 中文
"admin.knowledge.selectFolder": "选择文件夹",
"admin.knowledge.dropHint": "拖拽文件或文件夹到此处上传",
"admin.knowledge.uploadPreview": "即将上传 {count} 个文件",
"admin.knowledge.confirmUpload": "确认上传",
"admin.knowledge.uploadingProgress": "上传中... {current}/{total}",
"admin.knowledge.uploadComplete": "上传完成",
"admin.knowledge.uploadFailedSome": "上传完成，{count} 个文件失败",
"admin.knowledge.noMdFiles": "该文件夹中没有 .md 文件",

// 英文
"admin.knowledge.selectFolder": "Select Folder",
"admin.knowledge.dropHint": "Drop files or folders here to upload",
"admin.knowledge.uploadPreview": "About to upload {count} files",
"admin.knowledge.confirmUpload": "Confirm Upload",
"admin.knowledge.uploadingProgress": "Uploading... {current}/{total}",
"admin.knowledge.uploadComplete": "Upload complete",
"admin.knowledge.uploadFailedSome": "Upload complete, {count} files failed",
"admin.knowledge.noMdFiles": "No .md files found in this folder",
```

---

## 技术细节

### 类型定义

```typescript
type FileWithPath = {
  file: File;
  relativePath: string; // 相对于文件夹根的路径，如 "guides/advanced/tips.md"
};
```

### webkitdirectory 属性

```tsx
<input
  type="file"
  // @ts-expect-error webkitdirectory is not in types
  webkitdirectory=""
  onChange={handleFolderSelect}
/>
```

### 拖拽文件夹读取

```typescript
type FileWithPath = {
  file: File;
  relativePath: string;
};

/**
 * 从 FileSystemFileEntry 获取 File 对象（Promise 包装）
 */
function getFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve) => {
    entry.file(resolve);
  });
}

/**
 * 读取目录中的所有条目（处理分批返回的情况）
 */
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

/**
 * 递归遍历文件树，收集所有 .md 文件
 */
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
```

### 并发控制

```typescript
async function uploadFilesWithConcurrency(
  files: FileWithPath[],
  targetPath: string,
  maxConcurrent = 3
): Promise<{ success: number; failed: Array<{ path: string; error: string }> }> {
  const results = { success: 0, failed: [] as Array<{ path: string; error: string }> };
  const queue = [...files];

  async function processQueue() {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;

      const formData = new FormData();
      formData.append("file", item.file);
      formData.append("path", targetPath ? `${targetPath}/${item.relativePath.replace(/\.md$/, "")}` : item.relativePath.replace(/\.md$/, ""));

      try {
        const response = await fetch("/api/admin/knowledge/upload", {
          method: "POST",
          body: formData,
        });
        const json = await response.json();
        if (json.success) {
          results.success++;
        } else {
          results.failed.push({ path: item.relativePath, error: json.error });
        }
      } catch {
        results.failed.push({ path: item.relativePath, error: "Network error" });
      }
    }
  }

  await Promise.all(Array(maxConcurrent).fill(null).map(() => processQueue()));
  return results;
}
```

---

## 边界情况

1. **文件夹为空或无 .md 文件** → 显示提示："该文件夹中没有 .md 文件"
2. **上传过程中网络中断** → 显示失败文件列表及错误原因，已上传的保留
3. **文件名包含特殊字符** → 由现有 `validateTargetPath()` 函数处理，API 返回错误
4. **嵌套层级很深** → 递归遍历，无层级限制
5. **文件过大** → 由现有 `validateMarkdownContent()` 函数处理，API 返回错误
6. **上传中途取消** → 用户可点击"取消"关闭预览区域，不开始上传

---

## 实现范围

- 仅修改前端页面 `src/app/admin/knowledge/page.tsx`
- 添加 i18n 翻译
- 复用现有后端 API
- 无需数据库变更
- 无需新增 UI 组件