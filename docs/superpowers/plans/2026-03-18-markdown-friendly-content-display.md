# Markdown-Friendly Content Display Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce one shared safe-Markdown renderer and migrate forum detail, forum replies, task detail descriptions, and knowledge-base document bodies to it without changing list-page behavior.

**Architecture:** Add a focused `MarkdownContent` presentation component that owns `react-markdown` + `remark-gfm`, safe link handling, and shared prose styling. Roll the migration out surface by surface so the shared renderer is proven in isolation first, then wired into knowledge, forum, and tasks with page-level regression coverage at each step.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, `react-markdown`, `remark-gfm`, Node.js native test runner

---

## File Map

- Create: `src/components/content/markdown-content.tsx`
- Create: `src/components/content/markdown-content.test.tsx`
- Modify: `src/components/knowledge/knowledge-document-view.tsx`
- Modify: `src/components/knowledge/knowledge-directory-view.tsx`
- Modify: `src/app/knowledge/[...slug]/page.test.tsx`
- Modify: `src/app/forum/[id]/page.tsx`
- Modify: `src/app/forum-post-detail-content.test.tsx`
- Modify: `src/app/forum-post-list-content.test.tsx`
- Modify: `src/app/tasks/[id]/page.tsx`
- Modify: `src/app/task-detail-page.test.tsx`

## Chunk 1: Shared Markdown Renderer

### Task 1: Add the shared renderer and prove its safe Markdown behavior in isolation

**Files:**
- Create: `src/components/content/markdown-content.tsx`
- Create: `src/components/content/markdown-content.test.tsx`

- [ ] **Step 1: Write the failing shared-renderer tests**

Create `src/components/content/markdown-content.test.tsx` with focused rendering coverage:

```tsx
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { MarkdownContent } from "./markdown-content";

test("MarkdownContent renders headings, lists, blockquotes, and code", () => {
  const html = renderToStaticMarkup(
    <MarkdownContent
      content={[
        "# Title",
        "",
        "- item one",
        "- item two",
        "",
        "> quoted",
        "",
        "Inline `code` sample.",
        "",
        "```ts",
        "console.log('hello');",
        "```",
      ].join("\n")}
    />
  );

  assert.match(html, /<h1[^>]*>Title<\/h1>/);
  assert.match(html, /<ul>/);
  assert.match(html, /<blockquote/);
  assert.match(html, /<code>code<\/code>/);
  assert.match(html, /<pre/);
  assert.match(html, /console\.log/);
});

test("MarkdownContent renders tables and read-only task lists", () => {
  const html = renderToStaticMarkup(
    <MarkdownContent
      content={[
        "| Name | Value |",
        "| --- | --- |",
        "| API | Stable |",
        "",
        "- [x] shipped",
        "- [ ] pending",
      ].join("\n")}
    />
  );

  assert.match(html, /<table/);
  assert.match(html, /<td[^>]*>API<\/td>/);
  assert.match(html, /type="checkbox"/);
});

test("MarkdownContent keeps raw HTML inert and external links safe", () => {
  const html = renderToStaticMarkup(
    <MarkdownContent
      content={[
        "<script>alert('xss')</script>",
        "",
        "[Docs](https://example.com)",
      ].join("\n")}
    />
  );

  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;alert/);
  assert.match(html, /href="https:\/\/example\.com"/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noreferrer noopener"/);
});
```

- [ ] **Step 2: Run the shared-renderer test to confirm it fails**

Run: `node --import tsx --test src/components/content/markdown-content.test.tsx`
Expected: FAIL with module-not-found or missing-export errors for `markdown-content.tsx`

- [ ] **Step 3: Implement the minimal shared renderer**

Create `src/components/content/markdown-content.tsx` with a focused API and shared element mappings:

```tsx
"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type MarkdownContentProps = {
  content: string;
  className?: string;
  variant?: "default" | "compact";
};

function isExternalHref(href: string) {
  return /^https?:\/\//.test(href);
}

const variantClasses = {
  default: "text-sm leading-7 sm:text-[15px]",
  compact: "text-sm leading-6",
} as const;

export function MarkdownContent({
  content,
  className = "",
  variant = "default",
}: MarkdownContentProps) {
  return (
    <div
      className={[
        "prose prose-invert max-w-none text-foreground",
        "prose-headings:font-display prose-headings:text-foreground",
        "prose-p:text-foreground prose-strong:text-foreground",
        "prose-code:text-foreground prose-pre:overflow-x-auto",
        "prose-pre:rounded-xl prose-pre:border prose-pre:border-card-border/60",
        "prose-pre:bg-card/80 prose-blockquote:border-l-accent",
        "prose-blockquote:bg-card/40 prose-blockquote:px-4 prose-blockquote:py-2",
        "prose-table:block prose-table:w-full prose-table:overflow-x-auto",
        "prose-th:text-foreground prose-td:text-foreground",
        variantClasses[variant],
        className,
      ].join(" ")}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href = "", children }) => {
            if (isExternalHref(href)) {
              return (
                <a href={href} target="_blank" rel="noreferrer noopener">
                  {children}
                </a>
              );
            }

            return <a href={href}>{children}</a>;
          },
          input: ({ checked, disabled, type }) => {
            if (type === "checkbox") {
              return (
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled ?? true}
                  readOnly
                />
              );
            }

            return <input type={type} disabled={disabled} readOnly />;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
```

- [ ] **Step 4: Run the shared-renderer test to verify it passes**

Run: `node --import tsx --test src/components/content/markdown-content.test.tsx`
Expected: PASS for all `MarkdownContent` cases

- [ ] **Step 5: Commit the shared renderer**

```bash
git add src/components/content/markdown-content.tsx src/components/content/markdown-content.test.tsx
git commit -m "feat: add shared markdown content renderer"
```

## Chunk 2: Knowledge Base Migration

### Task 2: Migrate knowledge-base rendering to the shared component without changing route behavior

**Files:**
- Modify: `src/components/knowledge/knowledge-document-view.tsx`
- Modify: `src/components/knowledge/knowledge-directory-view.tsx`
- Modify: `src/app/knowledge/[...slug]/page.test.tsx`

- [ ] **Step 1: Expand a knowledge test to pin shared Markdown semantics**

Update `src/app/knowledge/[...slug]/page.test.tsx` so the regular-document test writes richer Markdown:

```tsx
await writeKnowledgeMarkdown(
  sandbox.knowledgeRoot,
  "guides/install/nginx.md",
  [
    "# Nginx Install",
    "",
    "> Provision before deploy",
    "",
    "- [x] package",
    "- [ ] verify config",
    "",
    "[Runbook](https://example.com/runbook)",
    "",
    "| Port | Purpose |",
    "| --- | --- |",
    "| 443 | HTTPS |",
  ].join("\n")
);
```

Add assertions like:

```tsx
assert.match(html, /<blockquote/);
assert.match(html, /type="checkbox"/);
assert.match(html, /<table/);
assert.match(html, /target="_blank"/);
```

- [ ] **Step 2: Run the knowledge page test to confirm the current expectation gap**

Run: `node --import tsx --test 'src/app/knowledge/[...slug]/page.test.tsx'`
Expected: FAIL because the current inline `ReactMarkdown` setup does not add the shared renderer's safe external-link behavior

- [ ] **Step 3: Replace inline Markdown rendering in both knowledge views**

Update `src/components/knowledge/knowledge-document-view.tsx`:

```tsx
import { MarkdownContent } from "@/components/content/markdown-content";
```

Replace:

```tsx
<div className="prose prose-invert max-w-none text-foreground">
  <ReactMarkdown remarkPlugins={[remarkGfm]}>
    {document.body}
  </ReactMarkdown>
</div>
```

with:

```tsx
<MarkdownContent content={document.body} />
```

Make the same replacement in `src/components/knowledge/knowledge-directory-view.tsx` for `directory.document.body`.

- [ ] **Step 4: Run the knowledge page test to verify the migration**

Run: `node --import tsx --test 'src/app/knowledge/[...slug]/page.test.tsx'`
Expected: PASS for directory landing, document rendering, not-found navigation, and encoded-path coverage

- [ ] **Step 5: Commit the knowledge migration**

```bash
git add src/components/knowledge/knowledge-document-view.tsx src/components/knowledge/knowledge-directory-view.tsx 'src/app/knowledge/[...slug]/page.test.tsx'
git commit -m "refactor: use shared markdown renderer in knowledge views"
```

## Chunk 3: Forum Detail Migration

### Task 3: Render forum post bodies and replies through the shared component while keeping list cards summary-only

**Files:**
- Modify: `src/app/forum/[id]/page.tsx`
- Modify: `src/app/forum-post-detail-content.test.tsx`
- Modify: `src/app/forum-post-list-content.test.tsx`

- [ ] **Step 1: Add failing forum-detail and list-scope assertions**

Update `src/app/forum-post-detail-content.test.tsx` so the harness uses Markdown in both the post and reply:

```tsx
content: [
  "# Weekly agent meetup notes",
  "",
  "> Capture what changed",
  "",
  "- [x] API review",
  "- [ ] publish recap",
].join("\n"),
```

and:

```tsx
content: [
  "Reply with `details`.",
  "",
  "```md",
  "follow-up",
  "```",
].join("\n"),
```

Add assertions like:

```tsx
assert.match(html, /<blockquote/);
assert.match(html, /type="checkbox"/);
assert.match(html, /<pre/);
```

Update `src/app/forum-post-list-content.test.tsx` so `posts[0].content` contains Markdown markers such as `# Heading` and assert the list view does **not** produce heading markup:

```tsx
assert.doesNotMatch(html, /<h1[^>]*>Heading<\/h1>/);
```

- [ ] **Step 2: Run the forum tests to confirm they fail before the migration**

Run: `node --import tsx --test src/app/forum-post-detail-content.test.tsx src/app/forum-post-list-content.test.tsx`
Expected: FAIL in the detail test while the list-scope test continues to describe the non-rich list behavior

- [ ] **Step 3: Migrate forum detail bodies to the shared renderer**

Update `src/app/forum/[id]/page.tsx`:

```tsx
import { MarkdownContent } from "@/components/content/markdown-content";
```

Replace the plain-text post body block:

```tsx
<div className="prose prose-invert max-w-none whitespace-pre-wrap text-foreground">
  {post.content}
</div>
```

with:

```tsx
<MarkdownContent content={post.content} className="mt-0" />
```

Replace each reply body block:

```tsx
<div className="mt-3 whitespace-pre-wrap text-foreground">
  {reply.content}
</div>
```

with:

```tsx
<MarkdownContent content={reply.content} variant="compact" className="mt-3" />
```

- [ ] **Step 4: Run the forum tests to verify detail migration and list isolation**

Run: `node --import tsx --test src/app/forum-post-detail-content.test.tsx src/app/forum-post-list-content.test.tsx`
Expected: PASS with Markdown markup present in detail HTML and absent from list-card output

- [ ] **Step 5: Commit the forum migration**

```bash
git add 'src/app/forum/[id]/page.tsx' src/app/forum-post-detail-content.test.tsx src/app/forum-post-list-content.test.tsx
git commit -m "feat: render forum detail content as markdown"
```

## Chunk 4: Task Detail Migration

### Task 4: Migrate task descriptions to the shared renderer without changing task-board cards

**Files:**
- Modify: `src/app/tasks/[id]/page.tsx`
- Modify: `src/app/task-detail-page.test.tsx`

- [ ] **Step 1: Add a failing task-detail Markdown assertion**

Update `src/app/task-detail-page.test.tsx` so `task.description` uses richer Markdown:

```tsx
description: [
  "## Helper 类补充范围",
  "",
  "- [x] API helper",
  "- [ ] cache helper",
  "",
  "> 需要和现有代码保持一致",
].join("\n"),
```

Add assertions like:

```tsx
assert.match(html, /<h2[^>]*>Helper 类补充范围<\/h2>/);
assert.match(html, /type="checkbox"/);
assert.match(html, /<blockquote/);
```

- [ ] **Step 2: Run the task-detail test to confirm it fails**

Run: `node --import tsx --test src/app/task-detail-page.test.tsx`
Expected: FAIL until the description stops rendering as plain pre-wrapped text

- [ ] **Step 3: Replace the task description block with the shared renderer**

Update `src/app/tasks/[id]/page.tsx`:

```tsx
import { MarkdownContent } from "@/components/content/markdown-content";
```

Replace:

```tsx
<div
  className="mt-6 whitespace-pre-wrap text-foreground leading-relaxed"
  style={{ whiteSpace: "pre-wrap" }}
>
  {task.description}
</div>
```

with:

```tsx
<div className="mt-6">
  <MarkdownContent content={task.description} />
</div>
```

- [ ] **Step 4: Run the task-detail test to verify the migration**

Run: `node --import tsx --test src/app/task-detail-page.test.tsx`
Expected: PASS with task metadata unchanged and Markdown rendered semantically

- [ ] **Step 5: Commit the task-detail migration**

```bash
git add 'src/app/tasks/[id]/page.tsx' src/app/task-detail-page.test.tsx
git commit -m "feat: render task detail descriptions as markdown"
```

## Chunk 5: Focused Regression Sweep

### Task 5: Run the focused regression set that covers the new shared renderer and all touched surfaces

**Files:**
- Test: `src/components/content/markdown-content.test.tsx`
- Test: `src/app/knowledge/[...slug]/page.test.tsx`
- Test: `src/app/forum-post-detail-content.test.tsx`
- Test: `src/app/forum-post-list-content.test.tsx`
- Test: `src/app/task-detail-page.test.tsx`
- Test: `src/app/read-only-page-shells.test.tsx`

- [ ] **Step 1: Run the full focused suite**

Run:

```bash
node --import tsx --test \
  src/components/content/markdown-content.test.tsx \
  'src/app/knowledge/[...slug]/page.test.tsx' \
  src/app/forum-post-detail-content.test.tsx \
  src/app/forum-post-list-content.test.tsx \
  src/app/task-detail-page.test.tsx \
  src/app/read-only-page-shells.test.tsx
```

Expected: PASS for the shared renderer, knowledge pages, forum detail, forum list scope guard, task detail, and read-only shell regressions

- [ ] **Step 2: Run lint on the touched files if the suite passes**

Run:

```bash
npx eslint \
  src/components/content/markdown-content.tsx \
  src/components/content/markdown-content.test.tsx \
  src/components/knowledge/knowledge-document-view.tsx \
  src/components/knowledge/knowledge-directory-view.tsx \
  'src/app/forum/[id]/page.tsx' \
  src/app/forum-post-detail-content.test.tsx \
  src/app/forum-post-list-content.test.tsx \
  'src/app/tasks/[id]/page.tsx' \
  src/app/task-detail-page.test.tsx \
  'src/app/knowledge/[...slug]/page.test.tsx'
```

Expected: no lint errors

- [ ] **Step 3: Commit the verification checkpoint if any cleanup was needed**

```bash
git add src/components/content/markdown-content.tsx src/components/content/markdown-content.test.tsx src/components/knowledge/knowledge-document-view.tsx src/components/knowledge/knowledge-directory-view.tsx 'src/app/knowledge/[...slug]/page.test.tsx' 'src/app/forum/[id]/page.tsx' src/app/forum-post-detail-content.test.tsx src/app/forum-post-list-content.test.tsx 'src/app/tasks/[id]/page.tsx' src/app/task-detail-page.test.tsx
git commit -m "test: verify markdown rendering regression coverage"
```

Skip this commit if Task 5 made no code changes after the prior task commits.
