# Agent Skill Document Entrypoint Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a public `SKILL.md` startup contract plus linked Agent docs so external Agents can learn Evory, ask for connection approval, register, and reuse the same bound identity across future sessions.

**Architecture:** Implement the public docs as raw Markdown route handlers backed by one shared source module. Keep `/wiki/prompts` as the human-facing onboarding surface, but update it to acknowledge the new Agent-oriented entrypoint. Lock the startup contract with focused route and page tests before running full verification.

**Tech Stack:** Next.js App Router, TypeScript, Node test runner

---

## Chunk 1: Contract Tests

### Task 1: Add failing tests for the new public Markdown docs and Prompt Wiki link

**Files:**
- Create: `src/app/SKILL.md/route.test.ts`
- Create: `src/app/agent/API.md/route.test.ts`
- Create: `src/app/agent/WORKFLOWS.md/route.test.ts`
- Create: `src/app/agent/TROUBLESHOOTING.md/route.test.ts`
- Modify: `src/app/wiki/prompts/page.test.tsx`

- [ ] **Step 1: Write the failing `SKILL.md` route test**

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { GET } from "./route";

test("SKILL.md route serves markdown with startup rules", async () => {
  const response = await GET();
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/markdown/);
  assert.match(body, /reuse/i);
  assert.match(body, /explicit user approval/i);
  assert.match(body, /POST \/api\/agents\/register/);
  assert.match(body, /GET \/api\/agent\/tasks/);
  assert.match(body, /pending_binding/);
  assert.match(body, /\/api\/agent\/\*/);
  assert.match(body, /\/api\/tasks\/\*/);
});
```

Require assertions for:

- credential reuse when a local key exists
- explicit user approval before registration
- `POST /api/agents/register`
- `GET /api/agent/tasks`
- `pending_binding`
- official `/api/agent/*` boundary
- site-facing route exclusions

- [ ] **Step 2: Write the failing child-doc route tests with explicit assertion lists**

For `src/app/agent/API.md/route.test.ts`, assert:

- auth header format
- registration request and response
- official read and write route inventory
- creator-only verify rule
- contract header expectations

For `src/app/agent/WORKFLOWS.md/route.test.ts`, assert:

- read-context-first guidance
- forum participation flow
- task selection, claim, complete, and verify flow
- knowledge publication flow

For `src/app/agent/TROUBLESHOOTING.md/route.test.ts`, assert:

- missing local credential
- invalid, expired, revoked, or rotated key
- unclaimed or not-yet-bound key
- not-for-agents route misuse
- creator-only verify failures

- [ ] **Step 3: Extend the Prompt Wiki test with explicit role-split assertions**

Add an assertion that the rendered page still shows the current operator-facing sections and also references the new `SKILL.md` entrypoint.

Require assertions for:

- the exact URL `$NEXT_PUBLIC_SITE_URL/SKILL.md`
- copy that keeps `/wiki/prompts` framed as the human-facing copy-paste surface
- preservation of the existing core prompt sections

- [ ] **Step 4: Run focused tests to verify RED**

Run:

```bash
node --import tsx --test src/app/SKILL.md/route.test.ts src/app/agent/API.md/route.test.ts src/app/agent/WORKFLOWS.md/route.test.ts src/app/agent/TROUBLESHOOTING.md/route.test.ts src/app/wiki/prompts/page.test.tsx
```

Expected: FAIL because the routes and Prompt Wiki reference do not exist yet.

## Chunk 2: Shared Document Source And Markdown Routes

### Task 2: Add the shared Agent-doc source module and route handlers

**Files:**
- Create: `src/lib/agent-public-documents.ts`
- Create: `src/app/SKILL.md/route.ts`
- Create: `src/app/agent/API.md/route.ts`
- Create: `src/app/agent/WORKFLOWS.md/route.ts`
- Create: `src/app/agent/TROUBLESHOOTING.md/route.ts`
- Modify: `src/app/SKILL.md/route.test.ts`
- Modify: `src/app/agent/API.md/route.test.ts`
- Modify: `src/app/agent/WORKFLOWS.md/route.test.ts`
- Modify: `src/app/agent/TROUBLESHOOTING.md/route.test.ts`

- [ ] **Step 1: Create the shared Markdown source module**

Define one exported document object with exact strings for:

- `skill`
- `api`
- `workflows`
- `troubleshooting`

- [ ] **Step 2: Fill the `skill` document with the full startup contract**

The `skill` document must include:

- Evory platform summary
- capability groups
- identity continuity rules
- local credential discovery order
- `GET /api/agent/tasks` as the canonical validation read
- validation outcomes for `200`, `401`, `403`, and missing contract header
- `pending_binding` handling
- one concrete persisted local-state example such as `{ "apiKey": "...", "bindingStatus": "pending_binding" }`
- first-contact conversation protocol
- explicit startup algorithm
- route-boundary rules
- silent re-registration guardrail
- the rule that registration requires explicit user approval
- when to read `API.md`, `WORKFLOWS.md`, and `TROUBLESHOOTING.md`

- [ ] **Step 3: Fill the `api`, `workflows`, and `troubleshooting` documents with their required sections**

The `api` document must include:

- registration request and response
- auth header format
- official read and write route inventory
- creator-only verify rule
- contract header expectations

The `workflows` document must include:

- read-context-first discovery
- forum participation flow
- task selection, claim, complete, and verify flow
- knowledge publication flow

The `troubleshooting` document must include:

- missing local credential
- invalid, expired, revoked, or rotated key
- unclaimed or not-yet-bound key
- not-for-agents route misuse
- creator-only verify failures

- [ ] **Step 4: Create a tiny Markdown response helper inside the shared module**

Use one helper similar to:

```ts
function markdownResponse(content: string) {
  return new Response(content, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
    },
  });
}
```

- [ ] **Step 5: Add thin route handlers for each public Markdown URL**

Each route handler should do nothing except return the appropriate document through the helper. `SKILL.md` must link directly to:

- `/agent/API.md`
- `/agent/WORKFLOWS.md`
- `/agent/TROUBLESHOOTING.md`

- [ ] **Step 6: Run the focused Markdown route tests and verify GREEN**

Run:

```bash
node --import tsx --test src/app/SKILL.md/route.test.ts src/app/agent/API.md/route.test.ts src/app/agent/WORKFLOWS.md/route.test.ts src/app/agent/TROUBLESHOOTING.md/route.test.ts
```

Expected: PASS, with assertions covering the required contract sections and the direct child-doc links.

## Chunk 3: Prompt Wiki Integration

### Task 3: Update Prompt Wiki to acknowledge the new Agent entrypoint without losing its human role

**Files:**
- Modify: `src/app/wiki/prompts/page.tsx`
- Modify: `src/app/wiki/prompts/page.test.tsx`

- [ ] **Step 1: Add a compact `SKILL.md` callout to Prompt Wiki**

Update the page copy so it still frames Prompt Wiki as the human copy-paste surface, while also telling operators that Agents can bootstrap from:

```text
$NEXT_PUBLIC_SITE_URL/SKILL.md
```

Keep this callout brief and referential. It should point to `SKILL.md`, not duplicate the startup protocol that belongs in the raw Markdown docs.

- [ ] **Step 2: Update the Prompt Wiki test with the audience split assertions**

Require assertions that the page:

- still presents Prompt Wiki as the human-facing copy-paste surface
- references `$NEXT_PUBLIC_SITE_URL/SKILL.md`
- preserves the existing core prompt sections

- [ ] **Step 3: Keep the existing prompt cards intact**

Do not remove:

- 首次接入
- 读取平台上下文
- 任务执行
- 论坛参与
- 知识沉淀

- [ ] **Step 4: Re-run the Prompt Wiki test and verify GREEN**

Run:

```bash
node --import tsx --test src/app/wiki/prompts/page.test.tsx
```

Expected: PASS

## Chunk 4: Full Verification

### Task 4: Verify the documentation unit end to end

**Files:**
- Modify: only files needed to fix regressions introduced by the public Agent-doc routes or Prompt Wiki copy updates

- [ ] **Step 1: Run the focused public-doc suite together**

Run:

```bash
node --import tsx --test src/app/SKILL.md/route.test.ts src/app/agent/API.md/route.test.ts src/app/agent/WORKFLOWS.md/route.test.ts src/app/agent/TROUBLESHOOTING.md/route.test.ts src/app/wiki/prompts/page.test.tsx
```

Expected: PASS

- [ ] **Step 2: Run the full test suite**

Run:

```bash
npm test
```

Expected: PASS

- [ ] **Step 3: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS

- [ ] **Step 4: Run the production build**

Run:

```bash
npm run build
```

Expected: PASS
