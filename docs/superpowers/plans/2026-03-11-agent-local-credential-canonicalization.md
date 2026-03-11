# Agent Local Credential Canonicalization Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align Evory's public Agent docs and Prompt Wiki around one canonical long-term local credential location and one canonical persisted JSON shape.

**Architecture:** Keep runtime behavior unchanged and update only published documentation surfaces plus content-locking tests. Preserve compatibility by continuing to mention legacy project-local discovery paths as fallback reads while making the user-level config file the only recommended long-term write target.

**Tech Stack:** Next.js route-based markdown docs, React server component page tests, Node test runner, TypeScript

---

## Chunk 1: Lock The New Public Contract In Tests

### Task 1: Update `SKILL.md` route expectations

**Files:**
- Modify: `src/app/SKILL.md/route.test.ts`
- Test: `src/app/SKILL.md/route.test.ts`

- [ ] **Step 1: Write the failing test assertions**

Add assertions for:
- `~/.config/evory/agents/default.json`
- compatibility fallback wording for `.env.local`
- compatibility fallback wording for `.evory/agent.json`
- canonical JSON example fields `agentId` and `updatedAt`

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test src/app/SKILL.md/route.test.ts`
Expected: FAIL because the current skill document still uses the older discovery order and example shape.

- [ ] **Step 3: Commit**

```bash
git add src/app/SKILL.md/route.test.ts
git commit -m "test: lock canonical Evory credential contract"
```

### Task 2: Update Prompt Wiki expectations

**Files:**
- Modify: `src/app/wiki/prompts/page.test.tsx`
- Test: `src/app/wiki/prompts/page.test.tsx`

- [ ] **Step 1: Write the failing test assertions**

Add assertions for:
- canonical user-level config path text
- guidance that project-local files are compatibility fallbacks
- updated storage wording in the onboarding prompt

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test src/app/wiki/prompts/page.test.tsx`
Expected: FAIL because Prompt Wiki still uses the older "save to local long-term config" wording without the canonical path contract.

- [ ] **Step 3: Commit**

```bash
git add src/app/wiki/prompts/page.test.tsx
git commit -m "test: lock prompt wiki credential storage guidance"
```

## Chunk 2: Update The Published Markdown Contract

### Task 3: Revise the shared public skill document strings

**Files:**
- Modify: `src/lib/agent-public-documents.ts`
- Test: `src/app/SKILL.md/route.test.ts`

- [ ] **Step 1: Write minimal content updates**

Update:
- local credential discovery and persistence guidance
- canonical storage location wording
- JSON example shape
- pending binding / bound wording as needed

- [ ] **Step 2: Run `SKILL.md` test**

Run: `npm test -- --test src/app/SKILL.md/route.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/agent-public-documents.ts src/app/SKILL.md/route.test.ts
git commit -m "docs: canonicalize Evory local credential guidance"
```

## Chunk 3: Align The Human-Facing Prompt Wiki

### Task 4: Update Prompt Wiki onboarding copy

**Files:**
- Modify: `src/app/wiki/prompts/page.tsx`
- Test: `src/app/wiki/prompts/page.test.tsx`

- [ ] **Step 1: Write minimal copy changes**

Update the onboarding prompt and security note text so they:
- recommend `~/.config/evory/agents/default.json` for long-term persistence
- describe `.env.local` and `.evory/agent.json` as compatibility fallback reads
- stay consistent with the public skill contract

- [ ] **Step 2: Run Prompt Wiki test**

Run: `npm test -- --test src/app/wiki/prompts/page.test.tsx`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/wiki/prompts/page.tsx src/app/wiki/prompts/page.test.tsx
git commit -m "docs: align prompt wiki with canonical credential storage"
```

## Chunk 4: Final Verification

### Task 5: Run the targeted doc contract suite

**Files:**
- Test: `src/app/SKILL.md/route.test.ts`
- Test: `src/app/wiki/prompts/page.test.tsx`

- [ ] **Step 1: Run both targeted tests**

Run: `npm test -- --test src/app/SKILL.md/route.test.ts --test src/app/wiki/prompts/page.test.tsx`
Expected: PASS

- [ ] **Step 2: Review the diff for scope control**

Run: `git diff -- src/lib/agent-public-documents.ts src/app/SKILL.md/route.test.ts src/app/wiki/prompts/page.tsx src/app/wiki/prompts/page.test.tsx docs/superpowers/specs/2026-03-11-agent-local-credential-canonicalization-design.md docs/superpowers/plans/2026-03-11-agent-local-credential-canonicalization.md`
Expected: only doc, copy, and test changes

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-03-11-agent-local-credential-canonicalization-design.md docs/superpowers/plans/2026-03-11-agent-local-credential-canonicalization.md
git commit -m "docs: add agent credential canonicalization design and plan"
```
