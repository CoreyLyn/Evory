# Markdown Reading Typography Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated Chinese-friendly reading typography layer to Markdown content in forum, knowledge, and task detail surfaces while keeping page-level branding and application UI typography unchanged.

**Architecture:** Keep typography ownership localized to `MarkdownContent`. Replace inert `prose`-driven font assumptions with explicit root, heading, and code font classes, then opt long-form task review feedback into the same reading surface so the content layer stays visually coherent.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Tailwind CSS 4, Node.js native test runner

---

## File Map

- Create: `docs/superpowers/specs/2026-03-24-markdown-reading-typography-design.md`
- Modify: `src/components/content/markdown-content.tsx`
- Modify: `src/components/content/markdown-content.test.tsx`
- Modify: `src/app/tasks/[id]/task-detail-page-client.tsx`

## Task 1: Prove reading-layer typography expectations in the shared renderer

**Files:**
- Modify: `src/components/content/markdown-content.test.tsx`
- Test: `src/components/content/markdown-content.test.tsx`

- [ ] **Step 1: Write the failing typography tests**

Add renderer assertions that pin:

- the root Markdown container carries a dedicated reading-font class
- Markdown headings use the reading layer rather than display typography
- inline code and code blocks explicitly carry monospace classes

Suggested assertions:

```tsx
assert.match(
  html,
  /data-markdown-content="default"[^>]*class="[^"]*font-reading[^"]*"/
);
assert.match(
  html,
  /<h1[^>]*class="[^"]*font-reading[^"]*"/
);
assert.match(
  html,
  /<code[^>]*class="[^"]*font-mono[^"]*"/
);
assert.match(
  html,
  /<pre[^>]*class="[^"]*font-mono[^"]*"/
);
```

- [ ] **Step 2: Run the renderer test to verify it fails**

Run: `node --import tsx --test src/components/content/markdown-content.test.tsx`
Expected: FAIL because `font-reading` and explicit code-font classes are not yet rendered

- [ ] **Step 3: Implement the minimal typography changes in the renderer**

Update `src/components/content/markdown-content.tsx` to:

- add a root `font-reading` class
- add `font-reading` to Markdown heading class generation
- add `font-mono` to inline code and fenced code blocks
- remove the old `prose-headings:font-display` / `prose-code:*` font assumptions

- [ ] **Step 4: Re-run the renderer test to verify it passes**

Run: `node --import tsx --test src/components/content/markdown-content.test.tsx`
Expected: PASS for all renderer tests

- [ ] **Step 5: Commit the renderer typography change**

```bash
git add src/components/content/markdown-content.tsx src/components/content/markdown-content.test.tsx
git commit -m "feat: add markdown reading typography layer"
```

## Task 2: Extend the reading layer to long-form task review feedback

**Files:**
- Modify: `src/app/tasks/[id]/task-detail-page-client.tsx`
- Test: `src/app/task-detail-page.test.tsx`

- [ ] **Step 1: Write the failing task-detail regression test**

Update `src/app/task-detail-page.test.tsx` so the review-comment rendering path asserts the review body uses the reading typography class rather than plain app text styling.

Suggested assertion:

```tsx
assert.match(html, /data-task-review-comment="true"[^>]*class="[^"]*font-reading[^"]*"/);
```

- [ ] **Step 2: Run the task-detail test to verify it fails**

Run: `node --import tsx --test src/app/task-detail-page.test.tsx`
Expected: FAIL because the review comment wrapper does not yet mark itself as reading content

- [ ] **Step 3: Implement the minimal task-detail change**

Update `src/app/tasks/[id]/task-detail-page-client.tsx` so review comments render inside a wrapper marked for reading typography, without changing status, bounty, metadata, or button typography.

- [ ] **Step 4: Re-run the task-detail test to verify it passes**

Run: `node --import tsx --test src/app/task-detail-page.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit the task-detail typography change**

```bash
git add src/app/tasks/[id]/task-detail-page-client.tsx src/app/task-detail-page.test.tsx
git commit -m "feat: align task review feedback with markdown reading typography"
```

## Task 3: Verify no regression in the approved Markdown detail surfaces

**Files:**
- Test: `src/components/content/markdown-content.test.tsx`
- Test: `src/app/forum-post-detail-content.test.tsx`
- Test: `src/app/task-detail-page.test.tsx`
- Test: `src/app/knowledge/[...slug]/page.test.tsx`

- [ ] **Step 1: Run the shared renderer and detail-surface tests together**

Run:

```bash
node --import tsx --test \
  src/components/content/markdown-content.test.tsx \
  src/app/forum-post-detail-content.test.tsx \
  src/app/task-detail-page.test.tsx \
  'src/app/knowledge/[...slug]/page.test.tsx'
```

Expected: PASS across renderer, forum detail, task detail, and knowledge document coverage

- [ ] **Step 2: Inspect the diff for typography-boundary drift**

Run: `git diff -- src/components/content/markdown-content.tsx src/app/tasks/[id]/task-detail-page-client.tsx`
Expected: only Markdown renderer typography ownership and task review-content wrapper changes

- [ ] **Step 3: Commit the verified batch if needed**

```bash
git add docs/superpowers/specs/2026-03-24-markdown-reading-typography-design.md \
  docs/superpowers/plans/2026-03-24-markdown-reading-typography.md \
  src/components/content/markdown-content.tsx \
  src/components/content/markdown-content.test.tsx \
  src/app/tasks/[id]/task-detail-page-client.tsx \
  src/app/task-detail-page.test.tsx
git commit -m "feat: improve markdown reading typography"
```
