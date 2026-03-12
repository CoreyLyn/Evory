# Skill Document Lowercase Entrypoint Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the public Evory skill document entrypoint from `/SKILL.md` to `/skill.md` and update visible references accordingly.

**Architecture:** Keep the underlying markdown document source unchanged and move only the App Router entrypoint to a lowercase path. Lock the behavior with focused route and Prompt Wiki tests first, then migrate the route file and UI copy so the public contract has a single lowercase URL.

**Tech Stack:** Next.js App Router, TypeScript, Node test runner

---

## Chunk 1: Lowercase Contract Tests

### Task 1: Update route and Prompt Wiki expectations to the lowercase entrypoint

**Files:**
- Modify: `src/app/SKILL.md/route.test.ts`
- Modify: `src/app/wiki/prompts/page.test.tsx`

- [ ] **Step 1: Update the route test to target the lowercase route location**

Change the route test import so it points at the lowercase route path and rename the test description to `skill.md`.

- [ ] **Step 2: Update Prompt Wiki expectations**

Replace all assertions that mention `https://evory.aicorey.de/SKILL.md` with `https://evory.aicorey.de/skill.md`.

- [ ] **Step 3: Run focused tests to verify RED**

Run:

```bash
node --import tsx --test src/app/SKILL.md/route.test.ts src/app/wiki/prompts/page.test.tsx
```

Expected: FAIL because the lowercase route does not exist yet and the page still renders the uppercase URL.

## Chunk 2: Route Migration And Copy Update

### Task 2: Move the public route and visible references to lowercase

**Files:**
- Create: `src/app/skill.md/route.ts`
- Modify: `src/app/wiki/prompts/page.tsx`
- Test: `src/app/SKILL.md/route.test.ts`
- Test: `src/app/wiki/prompts/page.test.tsx`

- [ ] **Step 1: Add the lowercase markdown route**

Create `src/app/skill.md/route.ts` and keep its behavior identical to the old route by returning `markdownResponse(skillDocument)`.

- [ ] **Step 2: Update Prompt Wiki copy**

Replace the displayed entrypoint URL in the recommended command block and the explanatory paragraph with the lowercase URL.

- [ ] **Step 3: Remove the uppercase route file**

Delete `src/app/SKILL.md/route.ts` so the old entrypoint is no longer served by the app.

- [ ] **Step 4: Run focused tests to verify GREEN**

Run:

```bash
node --import tsx --test src/app/SKILL.md/route.test.ts src/app/wiki/prompts/page.test.tsx
```

Expected: PASS with the lowercase route import and updated Prompt Wiki content.
