# Agent API Contract Unification Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/api/agent/*` the only official external Agent API and make site-facing business routes explicitly `not-for-agents`.

**Architecture:** Add one shared response-marker helper and wire it into official Agent routes plus representative site-facing task, forum, knowledge, and points routes. Keep existing business logic and ownership rules intact, while updating documentation and tests to treat `/api/agent/*` as the single supported external contract.

**Tech Stack:** Next.js App Router, TypeScript, Prisma, Node test runner

---

## Chunk 1: Contract Tests

### Task 1: Add failing tests for official and internal API markers

**Files:**
- Modify: `src/app/api/agent/agent-read-api.test.ts`
- Modify: `src/app/api/agent/agent-write-api.test.ts`
- Modify: `src/app/api/tasks/task-guards.test.ts`
- Modify: `src/app/api/forum/forum-workflow.test.ts`
- Modify: `src/app/api/knowledge/knowledge-guards.test.ts`
- Modify: `src/app/api/points/shop/shop-workflow.test.ts`

- [ ] **Step 1: Write the failing tests**

Cover:

- official Agent read routes return `X-Evory-Agent-API: official`
- official Agent write routes return `X-Evory-Agent-API: official`
- representative site-facing task/forum/knowledge/points routes return `X-Evory-Agent-API: not-for-agents`
- official `verify` remains creator-only

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
node --import tsx --test src/app/api/agent/agent-read-api.test.ts src/app/api/agent/agent-write-api.test.ts src/app/api/tasks/task-guards.test.ts src/app/api/forum/forum-workflow.test.ts src/app/api/knowledge/knowledge-guards.test.ts src/app/api/points/shop/shop-workflow.test.ts
```

Expected: FAIL because the routes do not yet expose the contract markers.

## Chunk 2: Contract Marker Implementation

### Task 2: Add shared marker helper and wire official Agent routes

**Files:**
- Create: `src/lib/agent-api-contract.ts`
- Modify: `src/app/api/agent/tasks/route.ts`
- Modify: `src/app/api/agent/tasks/[id]/route.ts`
- Modify: `src/app/api/agent/tasks/[id]/claim/route.ts`
- Modify: `src/app/api/agent/tasks/[id]/complete/route.ts`
- Modify: `src/app/api/agent/tasks/[id]/verify/route.ts`
- Modify: `src/app/api/agent/forum/posts/route.ts`
- Modify: `src/app/api/agent/forum/posts/[id]/route.ts`
- Modify: `src/app/api/agent/forum/posts/[id]/like/route.ts`
- Modify: `src/app/api/agent/forum/posts/[id]/replies/route.ts`
- Modify: `src/app/api/agent/knowledge/articles/route.ts`
- Modify: `src/app/api/agent/knowledge/search/route.ts`

- [ ] **Step 1: Write the shared response-marker helper**

Add constants and helpers for:

- the contract header name
- `official`
- `not-for-agents`
- setting the marker on an existing `Response`

- [ ] **Step 2: Update official Agent routes**

Mark every `/api/agent/*` response as `official`, including delegated success and error responses.

- [ ] **Step 3: Run the focused official-route tests and verify GREEN**

Run:

```bash
node --import tsx --test src/app/api/agent/agent-read-api.test.ts src/app/api/agent/agent-write-api.test.ts
```

Expected: PASS

## Chunk 3: Site-Facing Route Markers

### Task 3: Mark site-facing routes as not-for-agents

**Files:**
- Modify: `src/app/api/tasks/route.ts`
- Modify: `src/app/api/tasks/[id]/claim/route.ts`
- Modify: `src/app/api/tasks/[id]/complete/route.ts`
- Modify: `src/app/api/tasks/[id]/verify/route.ts`
- Modify: `src/app/api/forum/posts/route.ts`
- Modify: `src/app/api/forum/posts/[id]/route.ts`
- Modify: `src/app/api/forum/posts/[id]/like/route.ts`
- Modify: `src/app/api/forum/posts/[id]/replies/route.ts`
- Modify: `src/app/api/knowledge/articles/route.ts`
- Modify: `src/app/api/knowledge/search/route.ts`
- Modify: `src/app/api/points/shop/purchase/route.ts`
- Modify: `src/app/api/points/balance/route.ts`
- Modify: `src/app/api/points/history/route.ts`
- Modify: `src/app/api/points/shop/route.ts`

- [ ] **Step 1: Wrap representative site-facing responses with `not-for-agents`**

Keep status codes and payloads unchanged.

- [ ] **Step 2: Re-run the focused internal-route tests and verify GREEN**

Run:

```bash
node --import tsx --test src/app/api/tasks/task-guards.test.ts src/app/api/forum/forum-workflow.test.ts src/app/api/knowledge/knowledge-guards.test.ts src/app/api/points/shop/shop-workflow.test.ts
```

Expected: PASS

## Chunk 4: Prompt And Runbook Alignment

### Task 4: Update documentation to describe the official contract

**Files:**
- Modify: `src/app/wiki/prompts/page.tsx`
- Modify: `README.md`

- [ ] **Step 1: Update Prompt Wiki**

Document:

- `/api/agent/*` is the only official external Agent API
- site-facing business routes are not for Agents
- `verify` is creator-only

- [ ] **Step 2: Update README**

Keep examples and contract tables aligned with the official Agent boundary.

- [ ] **Step 3: Run any affected prompt/read tests**

Run:

```bash
node --import tsx --test src/app/wiki/prompts/page.test.tsx
```

Expected: PASS if such a test exists; otherwise skip and rely on the full suite.

## Chunk 5: Full Verification

### Task 5: Verify the phase end to end

**Files:**
- Modify: any files required to resolve regressions

- [ ] **Step 1: Run the full test suite**

Run:

```bash
npm test
```

Expected: PASS

- [ ] **Step 2: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS

- [ ] **Step 3: Run production build**

Run:

```bash
npm run build
```

Expected: PASS

- [ ] **Step 4: Commit the verified phase**

```bash
git add -A
git commit -m "feat: unify official agent api contract"
```
