# Filesystem Knowledge Base Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Evory's database-backed knowledge article system with a read-only filesystem knowledge base that renders folder-based Markdown content in the UI and exposes read-only browsing/search/document APIs for Agents.

**Architecture:** Introduce a shared filesystem knowledge service that resolves the knowledge root, scans Markdown folders, parses optional frontmatter, detects path collisions, builds an in-memory tree/search index, and serves both site routes and Agent routes. Migrate the UI from database-id article pages to path-based directory/document pages, remove knowledge write routes at cutover, then clean up dashboard, agent-detail, docs, and stale knowledge-publishing semantics.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Node test runner with `tsx`, Prisma for unrelated legacy surfaces, `gray-matter` for frontmatter parsing, `react-markdown` with `remark-gfm` for safe Markdown rendering

---

## File Structure

- Create: `src/lib/knowledge-base/types.ts`
  Responsibility: canonical directory/document/search result types shared by routes and UI.
- Create: `src/lib/knowledge-base/config.ts`
  Responsibility: resolve `KNOWLEDGE_BASE_DIR`, default fallback, and "not configured" detection.
- Create: `src/lib/knowledge-base/indexer.ts`
  Responsibility: recursive filesystem scan, frontmatter parsing, summary extraction, collision detection, and tree/index construction.
- Create: `src/lib/knowledge-base/service.ts`
  Responsibility: singleton in-memory cache plus explicit rebuild/refresh entrypoints.
- Create: `src/lib/knowledge-base/indexer.test.ts`
  Responsibility: cover parsing, README handling, fallback metadata, root README support, and path-collision rejection.
- Create: `src/lib/knowledge-base/service.test.ts`
  Responsibility: cover lazy load, refresh behavior, and missing-root error handling.
- Create: `src/components/knowledge/knowledge-directory-view.tsx`
  Responsibility: render a directory landing page, breadcrumbs, child directories, and child documents.
- Create: `src/components/knowledge/knowledge-document-view.tsx`
  Responsibility: render normalized metadata plus Markdown content for one document.
- Create: `src/app/api/knowledge/tree/route.ts`
  Responsibility: site-facing root/directory tree response backed by the filesystem service.
- Create: `src/app/api/knowledge/documents/route.ts`
  Responsibility: site-facing root `README.md` document response.
- Create: `src/app/api/knowledge/documents/[...slug]/route.ts`
  Responsibility: site-facing path-based directory/document response.
- Create: `src/app/api/knowledge/tree/route.test.ts`
  Responsibility: prove directory-tree payloads and missing-config behavior.
- Create: `src/app/api/knowledge/documents/route.test.ts`
  Responsibility: prove root landing-document reads.
- Create: `src/app/api/knowledge/documents/[...slug]/route.test.ts`
  Responsibility: prove path-based directory/document reads and 404 handling.
- Create: `src/app/api/agent/knowledge/tree/route.ts`
  Responsibility: official Agent read route for the knowledge tree.
- Create: `src/app/api/agent/knowledge/documents/route.ts`
  Responsibility: official Agent root landing-document read route.
- Create: `src/app/api/agent/knowledge/documents/[...slug]/route.ts`
  Responsibility: official Agent path-based document read route.
- Modify: `src/app/api/knowledge/search/route.ts`
  Responsibility: replace Prisma-backed search with filesystem-backed search.
- Modify: `src/app/api/agent/knowledge/search/route.ts`
  Responsibility: keep auth envelope while switching to the filesystem-backed search implementation.
- Modify: `src/app/knowledge/page.tsx`
  Responsibility: render the root knowledge directory rather than an article feed.
- Create: `src/app/knowledge/[...slug]/page.tsx`
  Responsibility: render directory/document pages from path-based responses.
- Create: `src/app/knowledge/[...slug]/page.test.tsx`
  Responsibility: prove catch-all page states for directories, documents, and not-found behavior.
- Modify: `src/app/knowledge/page.test.tsx`
  Responsibility: replace article-grid assumptions with directory-browser assertions.
- Modify: `src/i18n/zh.ts`
- Modify: `src/i18n/en.ts`
  Responsibility: add knowledge-browser, missing-config, directory/document, and read-only copy.
- Modify: `src/lib/agent-public-documents.ts`
  Responsibility: remove knowledge-publication language and list the new read-only knowledge routes.
- Modify: `src/app/wiki/prompts/page.tsx`
  Responsibility: update human-facing guidance from "publish knowledge" to "read knowledge".
- Modify: `src/lib/staging-agent-smoke.test.ts`
  Responsibility: update smoke expectations to the new read-only knowledge contract.
- Modify: `scripts/lib/staging-agent-smoke.mjs`
  Responsibility: update the executable smoke flow to use knowledge reads instead of knowledge publishes.
- Modify: `src/app/dashboard-data.ts`
- Modify: `src/app/dashboard-data.test.ts`
  Responsibility: stop fetching `/api/knowledge/articles`; switch to a filesystem-backed doc count source.
- Modify: `src/app/dashboard/page.tsx`
- Modify: `src/app/dashboard-page.test.tsx`
- Modify: `src/app/agents/[id]/page.tsx`
- Create: `src/app/agents/[id]/page.test.tsx`
  Responsibility: remove stale authored-article UI and old "Knowledge Articles" semantics from rendered pages.
- Modify: `src/app/api/agents/[id]/route.ts`
- Modify: `src/app/api/agents/agent-detail.test.ts`
  Responsibility: remove agent-authored article counts that no longer make sense for filesystem docs.
- Modify: `src/lib/auth.ts`
- Modify: `prisma/seed.ts`
- Modify: `src/lib/rate-limit.ts`
- Modify: `src/lib/rate-limit.test.ts`
- Modify: `src/lib/security-events-filters.ts`
  Responsibility: remove stale `knowledge:write` and knowledge-publish rate-limit semantics after write-route removal.
- Delete: `src/app/api/knowledge/articles/route.ts`
- Delete: `src/app/api/knowledge/articles/[id]/route.ts`
- Delete: `src/app/api/agent/knowledge/articles/route.ts`
- Delete: `src/app/knowledge/[id]/page.tsx`
- Modify: `src/app/api/knowledge/knowledge-guards.test.ts`
  Responsibility: replace publish-guard coverage with assertions that the legacy site write route is gone or unsupported.
- Modify: `src/app/api/agent/agent-read-api.test.ts`
- Modify: `src/app/api/agent/agent-write-api.test.ts`
  Responsibility: add read coverage for new tree/document routes and replace knowledge-publish expectations with explicit legacy-write removal assertions.
- Modify: `package.json`
- Modify: `package-lock.json`
  Responsibility: add Markdown parsing/rendering dependencies if they are not already present.

## Chunk 1: Filesystem Knowledge Foundation

### Task 1: Add failing tests for filesystem indexing, root resolution, and collisions

**Files:**
- Create: `src/lib/knowledge-base/indexer.test.ts`
- Create: `src/lib/knowledge-base/service.test.ts`
- Test: `src/lib/knowledge-base/indexer.test.ts`
- Test: `src/lib/knowledge-base/service.test.ts`

- [ ] **Step 1: Write failing indexer tests**

Cover:
- root `README.md` becomes the root landing document
- directory `README.md` attaches to the directory node instead of child document lists
- optional frontmatter wins over fallback metadata
- missing frontmatter falls back to filename and first paragraph
- `foo.md` plus `foo/README.md` is rejected as a path collision

- [ ] **Step 2: Write failing service tests**

Cover:
- `KNOWLEDGE_BASE_DIR` overrides the project-local fallback
- missing root returns a structured "not configured" state
- the service caches the built index
- explicit refresh rebuilds the cache

- [ ] **Step 3: Run the new unit tests to verify they fail**

Run: `node --import tsx --test src/lib/knowledge-base/indexer.test.ts src/lib/knowledge-base/service.test.ts`
Expected: FAIL because the knowledge-base library does not exist yet

### Task 2: Add the minimal filesystem knowledge library

**Files:**
- Create: `src/lib/knowledge-base/types.ts`
- Create: `src/lib/knowledge-base/config.ts`
- Create: `src/lib/knowledge-base/indexer.ts`
- Create: `src/lib/knowledge-base/service.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Test: `src/lib/knowledge-base/indexer.test.ts`
- Test: `src/lib/knowledge-base/service.test.ts`

- [ ] **Step 1: Install the minimal Markdown parsing dependencies**

Run: `npm install gray-matter react-markdown remark-gfm`
Expected: `package.json` and `package-lock.json` update without errors

- [ ] **Step 2: Implement `types.ts` and `config.ts`**

Add normalized knowledge-node/document/search types and the root-resolution helper with `KNOWLEDGE_BASE_DIR` first and a project-local fallback second.

- [ ] **Step 3: Implement `indexer.ts`**

Add recursive scanning that:
- reads only `*.md`
- treats `README.md` as directory landing content
- parses optional frontmatter with `gray-matter`
- derives fallback title/summary/tags
- rejects ambiguous logical paths
- returns a full in-memory tree plus flat lookup/search maps

- [ ] **Step 4: Implement `service.ts`**

Add the singleton cache layer with:
- lazy first build
- explicit refresh
- a stable "not configured" result
- logging for parse/configuration failures without crashing unrelated requests

- [ ] **Step 5: Re-run the focused unit tests**

Run: `node --import tsx --test src/lib/knowledge-base/indexer.test.ts src/lib/knowledge-base/service.test.ts`
Expected: PASS

- [ ] **Step 6: Commit the filesystem foundation**

```bash
git add package.json package-lock.json src/lib/knowledge-base/types.ts src/lib/knowledge-base/config.ts src/lib/knowledge-base/indexer.ts src/lib/knowledge-base/service.ts src/lib/knowledge-base/indexer.test.ts src/lib/knowledge-base/service.test.ts
git commit -m "feat: add filesystem knowledge base foundation"
```

## Chunk 2: Site Routes And Knowledge UI

### Task 3: Add failing site API tests for tree, root document, path document, and search

**Files:**
- Create: `src/app/api/knowledge/tree/route.test.ts`
- Create: `src/app/api/knowledge/documents/route.test.ts`
- Create: `src/app/api/knowledge/documents/[...slug]/route.test.ts`
- Modify: `src/app/api/knowledge/knowledge-guards.test.ts`
- Modify: `src/app/api/knowledge/search/route.ts`
- Test: `src/app/api/knowledge/tree/route.test.ts`
- Test: `src/app/api/knowledge/documents/route.test.ts`
- Test: `src/app/api/knowledge/documents/[...slug]/route.test.ts`
- Test: `src/app/api/knowledge/knowledge-guards.test.ts`

- [ ] **Step 1: Write failing route tests for the new site APIs**

Cover:
- root tree payload shape
- root `README.md` reads
- directory path reads
- regular document reads
- 404s for unknown paths
- explicit "knowledge base not configured" behavior
- the legacy `POST /api/knowledge/articles` route is gone or explicitly unsupported at cutover

- [ ] **Step 2: Add failing search assertions**

Extend search coverage to prove:
- title matches rank above body-only matches
- tags and summary participate in search
- results come from filesystem documents instead of Prisma records

- [ ] **Step 3: Run the focused site API tests to verify they fail**

Run: `node --import tsx --test src/app/api/knowledge/tree/route.test.ts src/app/api/knowledge/documents/route.test.ts 'src/app/api/knowledge/documents/[...slug]/route.test.ts' src/app/api/knowledge/knowledge-guards.test.ts`
Expected: FAIL because the new routes do not exist and the old knowledge guard test still targets a write route we are about to remove

### Task 4: Implement the site-facing filesystem knowledge routes and remove old site write routes

**Files:**
- Create: `src/app/api/knowledge/tree/route.ts`
- Create: `src/app/api/knowledge/documents/route.ts`
- Create: `src/app/api/knowledge/documents/[...slug]/route.ts`
- Modify: `src/app/api/knowledge/search/route.ts`
- Modify: `src/app/api/knowledge/knowledge-guards.test.ts`
- Delete: `src/app/api/knowledge/articles/route.ts`
- Delete: `src/app/api/knowledge/articles/[id]/route.ts`
- Test: `src/app/api/knowledge/tree/route.test.ts`
- Test: `src/app/api/knowledge/documents/route.test.ts`
- Test: `src/app/api/knowledge/documents/[...slug]/route.test.ts`

- [ ] **Step 1: Implement the new read-only site routes**

Back the tree, root-document, path-document, and search routes with `knowledge-base/service.ts`.

- [ ] **Step 2: Remove the old site article routes**

Delete the database-backed article list/detail route files and rewrite `knowledge-guards.test.ts` so it proves `POST /api/knowledge/articles` is no longer available after the cutover.

- [ ] **Step 3: Re-run the focused site API tests**

Run: `node --import tsx --test src/app/api/knowledge/tree/route.test.ts src/app/api/knowledge/documents/route.test.ts 'src/app/api/knowledge/documents/[...slug]/route.test.ts'`
Expected: PASS

- [ ] **Step 4: Commit the site API cutover**

```bash
git add src/app/api/knowledge/tree/route.ts src/app/api/knowledge/tree/route.test.ts src/app/api/knowledge/documents/route.ts src/app/api/knowledge/documents/route.test.ts 'src/app/api/knowledge/documents/[...slug]/route.ts' 'src/app/api/knowledge/documents/[...slug]/route.test.ts' src/app/api/knowledge/search/route.ts src/app/api/knowledge/knowledge-guards.test.ts
git rm src/app/api/knowledge/articles/route.ts src/app/api/knowledge/articles/[id]/route.ts
git commit -m "feat: switch site knowledge api to filesystem"
```

### Task 5: Add failing page tests for directory browsing and Markdown document rendering

**Files:**
- Modify: `src/app/knowledge/page.test.tsx`
- Create: `src/app/knowledge/[...slug]/page.test.tsx`
- Test: `src/app/knowledge/page.test.tsx`
- Test: `src/app/knowledge/[...slug]/page.test.tsx`

- [ ] **Step 1: Rewrite the root knowledge page test**

Assert that `/knowledge` now renders:
- breadcrumb or root-path context
- directory/document sections instead of article cards
- the search control in the header
- an explicit read-only/documentation-oriented empty or unconfigured state

- [ ] **Step 2: Add catch-all page tests**

Cover:
- directory pages render landing Markdown plus child listings
- document pages render Markdown content
- not-found pages show the existing back-navigation affordance

- [ ] **Step 3: Run the focused knowledge page tests to verify they fail**

Run: `node --import tsx --test src/app/knowledge/page.test.tsx 'src/app/knowledge/[...slug]/page.test.tsx'`
Expected: FAIL because the current knowledge pages still assume article ids and plain-text content

### Task 6: Implement the knowledge UI and path-based pages

**Files:**
- Create: `src/components/knowledge/knowledge-directory-view.tsx`
- Create: `src/components/knowledge/knowledge-document-view.tsx`
- Modify: `src/app/knowledge/page.tsx`
- Create: `src/app/knowledge/[...slug]/page.tsx`
- Delete: `src/app/knowledge/[id]/page.tsx`
- Modify: `src/i18n/zh.ts`
- Modify: `src/i18n/en.ts`
- Test: `src/app/knowledge/page.test.tsx`
- Test: `src/app/knowledge/[...slug]/page.test.tsx`

- [ ] **Step 1: Add the new knowledge UI copy**

Add translation keys for:
- directory/document labels
- missing-config state
- empty-directory state
- search result copy that no longer says "articles"

- [ ] **Step 2: Implement the shared directory and document view components**

Use `react-markdown` plus `remark-gfm` for safe Markdown rendering and keep the layout aligned with the existing Evory visual language rather than introducing a separate docs app aesthetic.

- [ ] **Step 3: Migrate `/knowledge` to the root directory page**

Fetch the root tree/directory payload, render the landing content, and keep the search input.

- [ ] **Step 4: Add the catch-all page and remove the id-based page**

Resolve path-based directory/document content and delete the old database-id page.

- [ ] **Step 5: Re-run the focused knowledge page tests**

Run: `node --import tsx --test src/app/knowledge/page.test.tsx 'src/app/knowledge/[...slug]/page.test.tsx'`
Expected: PASS

- [ ] **Step 6: Commit the site UI migration**

```bash
git add src/components/knowledge/knowledge-directory-view.tsx src/components/knowledge/knowledge-document-view.tsx src/app/knowledge/page.tsx 'src/app/knowledge/[...slug]/page.tsx' src/app/knowledge/page.test.tsx 'src/app/knowledge/[...slug]/page.test.tsx' src/i18n/zh.ts src/i18n/en.ts
git rm src/app/knowledge/[id]/page.tsx
git commit -m "feat: migrate knowledge ui to filesystem docs"
```

## Chunk 3: Agent Knowledge Contract And Docs

### Task 7: Add failing Agent read tests for tree, root document, path document, and search

**Files:**
- Modify: `src/app/api/agent/agent-read-api.test.ts`
- Modify: `src/app/api/agent/agent-write-api.test.ts`
- Test: `src/app/api/agent/agent-read-api.test.ts`
- Test: `src/app/api/agent/agent-write-api.test.ts`

- [ ] **Step 1: Extend the Agent read API tests**

Add coverage proving:
- unclaimed Agents cannot call `/api/agent/knowledge/tree`
- claimed Agents can call `/api/agent/knowledge/tree`
- claimed Agents can call `/api/agent/knowledge/documents`
- claimed Agents can call `/api/agent/knowledge/documents/[...slug]`
- search results no longer depend on Prisma knowledge-article mocks
- the legacy `POST /api/agent/knowledge/articles` route is gone or explicitly unsupported at cutover

- [ ] **Step 2: Run the focused Agent read test to verify it fails**

Run: `node --import tsx --test src/app/api/agent/agent-read-api.test.ts src/app/api/agent/agent-write-api.test.ts`
Expected: FAIL because the new Agent tree/document routes do not exist yet

### Task 8: Implement the Agent read routes and remove Agent knowledge writes

**Files:**
- Create: `src/app/api/agent/knowledge/tree/route.ts`
- Create: `src/app/api/agent/knowledge/documents/route.ts`
- Create: `src/app/api/agent/knowledge/documents/[...slug]/route.ts`
- Modify: `src/app/api/agent/knowledge/search/route.ts`
- Modify: `src/app/api/agent/agent-read-api.test.ts`
- Modify: `src/app/api/agent/agent-write-api.test.ts`
- Delete: `src/app/api/agent/knowledge/articles/route.ts`
- Test: `src/app/api/agent/agent-read-api.test.ts`
- Test: `src/app/api/agent/agent-write-api.test.ts`

- [ ] **Step 1: Implement the new official Agent knowledge routes**

Wrap the site-facing filesystem knowledge reads with the existing official-agent auth/contract envelope.

- [ ] **Step 2: Remove the Agent knowledge publish route**

Delete the write route and rewrite the knowledge-specific write test coverage so it proves `POST /api/agent/knowledge/articles` is no longer available after the cutover.

- [ ] **Step 3: Re-run the focused Agent API tests**

Run: `node --import tsx --test src/app/api/agent/agent-read-api.test.ts src/app/api/agent/agent-write-api.test.ts`
Expected: PASS

- [ ] **Step 4: Commit the Agent API cutover**

```bash
git add src/app/api/agent/knowledge/tree/route.ts src/app/api/agent/knowledge/documents/route.ts 'src/app/api/agent/knowledge/documents/[...slug]/route.ts' src/app/api/agent/knowledge/search/route.ts src/app/api/agent/agent-read-api.test.ts src/app/api/agent/agent-write-api.test.ts
git rm src/app/api/agent/knowledge/articles/route.ts
git commit -m "feat: make agent knowledge api read only"
```

### Task 9: Update Agent-facing docs, prompts, and smoke expectations

**Files:**
- Modify: `src/lib/agent-public-documents.ts`
- Modify: `src/app/wiki/prompts/page.tsx`
- Modify: `src/lib/staging-agent-smoke.test.ts`
- Modify: `scripts/lib/staging-agent-smoke.mjs`
- Test: `src/app/agent/API.md/route.test.ts`
- Test: `src/app/agent/WORKFLOWS.md/route.test.ts`
- Test: `src/app/skill.md/route.test.ts`
- Test: `src/lib/staging-agent-smoke.test.ts`

- [ ] **Step 1: Add failing documentation and smoke assertions**

Change the markdown-route and smoke tests so they expect:
- knowledge is read-only
- the public contract lists `tree`, `search`, and `documents` routes
- workflow copy tells Agents to learn from knowledge rather than publish to it
- smoke tests use knowledge reads, not knowledge writes

- [ ] **Step 2: Run the focused doc and smoke tests to verify they fail**

Run: `node --import tsx --test src/app/agent/API.md/route.test.ts src/app/agent/WORKFLOWS.md/route.test.ts src/app/skill.md/route.test.ts src/lib/staging-agent-smoke.test.ts`
Expected: FAIL because the current docs and smoke flow still mention knowledge publication

- [ ] **Step 3: Update the docs and smoke fixtures**

Rewrite the published markdown strings and Prompt Wiki guidance around read-only knowledge browsing/search/document reads, then update both `staging-agent-smoke.mjs` and `staging-agent-smoke.test.ts` to validate the new read flow instead of knowledge publishing.

- [ ] **Step 4: Re-run the focused doc and smoke tests**

Run: `node --import tsx --test src/app/agent/API.md/route.test.ts src/app/agent/WORKFLOWS.md/route.test.ts src/app/skill.md/route.test.ts src/lib/staging-agent-smoke.test.ts`
Expected: PASS

- [ ] **Step 5: Commit the contract copy updates**

```bash
git add src/lib/agent-public-documents.ts src/app/wiki/prompts/page.tsx src/lib/staging-agent-smoke.test.ts scripts/lib/staging-agent-smoke.mjs src/app/agent/API.md/route.test.ts src/app/agent/WORKFLOWS.md/route.test.ts src/app/skill.md/route.test.ts
git commit -m "docs: update knowledge contract to read only"
```

## Chunk 4: Legacy Semantics Cleanup And Regression

### Task 10: Add failing tests for dashboard counts, agent detail, and stale write semantics

**Files:**
- Modify: `src/app/dashboard-data.test.ts`
- Modify: `src/app/api/agents/agent-detail.test.ts`
- Modify: `src/app/dashboard-page.test.tsx`
- Modify: `src/app/dashboard/page.tsx`
- Modify: `src/app/agents/[id]/page.tsx`
- Create: `src/app/agents/[id]/page.test.tsx`
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/zh.ts`
- Modify: `src/lib/rate-limit.test.ts`
- Test: `src/app/dashboard-data.test.ts`
- Test: `src/app/api/agents/agent-detail.test.ts`
- Test: `src/app/dashboard-page.test.tsx`
- Test: `src/app/agents/[id]/page.test.tsx`
- Test: `src/lib/rate-limit.test.ts`

- [ ] **Step 1: Update dashboard-data tests**

Make them expect the dashboard knowledge stat to come from a filesystem-backed knowledge count source rather than `/api/knowledge/articles?pageSize=1`.

- [ ] **Step 2: Update agent-detail tests**

Make them expect no `counts.articles` field tied to authored knowledge documents.

- [ ] **Step 3: Update rendered-page expectations**

Make them expect:
- dashboard no longer renders stale "Knowledge Articles" semantics
- the agent detail page no longer renders authored-article counts or article labels

- [ ] **Step 4: Update rate-limit tests**

Make them expect no active `knowledge-publish-write` bucket once write routes are gone.

- [ ] **Step 5: Run the focused cleanup tests to verify they fail**

Run: `node --import tsx --test src/app/dashboard-data.test.ts src/app/api/agents/agent-detail.test.ts src/app/dashboard-page.test.tsx 'src/app/agents/[id]/page.test.tsx' src/lib/rate-limit.test.ts`
Expected: FAIL because these areas still assume database-backed knowledge publishing

### Task 11: Remove stale knowledge-publishing semantics from remaining runtime code

**Files:**
- Modify: `src/app/dashboard-data.ts`
- Modify: `src/app/dashboard-data.test.ts`
- Modify: `src/app/dashboard/page.tsx`
- Modify: `src/app/api/agents/[id]/route.ts`
- Modify: `src/app/api/agents/agent-detail.test.ts`
- Modify: `src/app/agents/[id]/page.tsx`
- Create: `src/app/agents/[id]/page.test.tsx`
- Modify: `src/app/dashboard-page.test.tsx`
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/zh.ts`
- Modify: `src/lib/auth.ts`
- Modify: `prisma/seed.ts`
- Modify: `src/lib/rate-limit.ts`
- Modify: `src/lib/rate-limit.test.ts`
- Modify: `src/lib/security-events-filters.ts`
- Test: `src/app/dashboard-data.test.ts`
- Test: `src/app/api/agents/agent-detail.test.ts`
- Test: `src/app/agents/[id]/page.test.tsx`
- Test: `src/lib/rate-limit.test.ts`

- [ ] **Step 1: Update dashboard knowledge stats**

Replace the old article-count fetch with a filesystem-backed document count read, or explicitly rename/remove the stat if the page no longer needs a numeric knowledge total.

- [ ] **Step 2: Remove authored-article counts from agent detail**

Stop counting `KnowledgeArticle` rows in the public agent profile payload, update the agent detail page to stop rendering authored-article stats, and update tests accordingly.

- [ ] **Step 3: Remove stale write-scope and rate-limit semantics**

Delete or neutralize:
- `knowledge:write`
- `knowledge-publish-write`
- seed data and copy that imply Agents publish knowledge into Evory
- dashboard/page copy and labels that still say "Knowledge Articles"

- [ ] **Step 4: Re-run the focused cleanup tests**

Run: `node --import tsx --test src/app/dashboard-data.test.ts src/app/api/agents/agent-detail.test.ts src/app/dashboard-page.test.tsx 'src/app/agents/[id]/page.test.tsx' src/lib/rate-limit.test.ts`
Expected: PASS

- [ ] **Step 5: Commit the legacy cleanup**

```bash
git add src/app/dashboard-data.ts src/app/dashboard-data.test.ts src/app/dashboard/page.tsx src/app/dashboard-page.test.tsx 'src/app/api/agents/[id]/route.ts' src/app/api/agents/agent-detail.test.ts 'src/app/agents/[id]/page.tsx' 'src/app/agents/[id]/page.test.tsx' src/i18n/en.ts src/i18n/zh.ts src/lib/auth.ts prisma/seed.ts src/lib/rate-limit.ts src/lib/rate-limit.test.ts src/lib/security-events-filters.ts
git commit -m "refactor: remove legacy knowledge publish semantics"
```

### Task 12: Run the end-to-end focused regression suite

**Files:**
- Test: `src/lib/knowledge-base/indexer.test.ts`
- Test: `src/lib/knowledge-base/service.test.ts`
- Test: `src/app/api/knowledge/tree/route.test.ts`
- Test: `src/app/api/knowledge/documents/route.test.ts`
- Test: `src/app/api/knowledge/documents/[...slug]/route.test.ts`
- Test: `src/app/knowledge/page.test.tsx`
- Test: `src/app/knowledge/[...slug]/page.test.tsx`
- Test: `src/app/api/agent/agent-read-api.test.ts`
- Test: `src/app/api/agent/agent-write-api.test.ts`
- Test: `src/app/agent/API.md/route.test.ts`
- Test: `src/app/agent/WORKFLOWS.md/route.test.ts`
- Test: `src/app/skill.md/route.test.ts`
- Test: `src/lib/staging-agent-smoke.test.ts`
- Test: `src/app/dashboard-data.test.ts`
- Test: `src/app/api/agents/agent-detail.test.ts`
- Test: `src/app/dashboard-page.test.tsx`
- Test: `src/app/agents/[id]/page.test.tsx`
- Test: `src/lib/rate-limit.test.ts`

- [ ] **Step 1: Run the focused regression suite**

Run: `node --import tsx --test src/lib/knowledge-base/indexer.test.ts src/lib/knowledge-base/service.test.ts src/app/api/knowledge/tree/route.test.ts src/app/api/knowledge/documents/route.test.ts 'src/app/api/knowledge/documents/[...slug]/route.test.ts' src/app/api/knowledge/knowledge-guards.test.ts src/app/knowledge/page.test.tsx 'src/app/knowledge/[...slug]/page.test.tsx' src/app/api/agent/agent-read-api.test.ts src/app/api/agent/agent-write-api.test.ts src/app/agent/API.md/route.test.ts src/app/agent/WORKFLOWS.md/route.test.ts src/app/skill.md/route.test.ts src/lib/staging-agent-smoke.test.ts src/app/dashboard-data.test.ts src/app/api/agents/agent-detail.test.ts src/app/dashboard-page.test.tsx 'src/app/agents/[id]/page.test.tsx' src/lib/rate-limit.test.ts`
Expected: PASS

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 3: Commit any final regression-only fixes**

```bash
git add -A
git commit -m "test: finalize filesystem knowledge base rollout"
```
