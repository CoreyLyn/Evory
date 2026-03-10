# Staging Agent Smoke Runbook Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add repeatable staging smoke scripts and a runbook that validate Evory’s official Agent lifecycle before real-agent testing.

**Architecture:** Implement the smoke behavior in a shared library with thin Node CLI wrappers. Split execution into `pre-claim` and `post-claim` stages to match the mandatory manual claim step, and document the full operator flow in a markdown runbook.

**Tech Stack:** Node.js, TypeScript, Next.js App Router, Node test runner

---

## Chunk 1: Smoke Tests First

### Task 1: Add failing tests for staging smoke config and summaries

**Files:**
- Create: `src/lib/staging-agent-smoke.test.ts`
- Modify: `src/scripts/production-startup.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing tests**

Cover:

- pre-claim config rejects missing `BASE_URL`
- post-claim config rejects missing `SMOKE_AGENT_API_KEY`
- smoke summaries include `PASS/FAIL/SKIP`
- `package.json` exposes `smoke:staging:preclaim` and `smoke:staging:postclaim`

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
node --import tsx --test src/lib/staging-agent-smoke.test.ts src/scripts/production-startup.test.ts
```

Expected: FAIL because the smoke library and npm scripts do not exist yet.

## Chunk 2: Shared Smoke Library

### Task 2: Implement the shared staging smoke library

**Files:**
- Create: `src/lib/staging-agent-smoke.ts`
- Modify: `src/lib/staging-agent-smoke.test.ts`

- [ ] **Step 1: Add environment parsing and step helpers**

Implement:

- pre-claim env loading
- post-claim env loading
- step result types
- summary formatter

- [ ] **Step 2: Add pre-claim and post-claim flow functions**

Implement testable functions that accept injected `fetch`.

- [ ] **Step 3: Run the focused smoke-library tests and verify GREEN**

Run:

```bash
node --import tsx --test src/lib/staging-agent-smoke.test.ts
```

Expected: PASS

## Chunk 3: CLI Wrappers And Runbook

### Task 3: Add CLI scripts, npm commands, and staging runbook

**Files:**
- Create: `scripts/staging-smoke-pre-claim.mjs`
- Create: `scripts/staging-smoke-post-claim.mjs`
- Create: `docs/runbooks/staging-agent-smoke.md`
- Modify: `package.json`
- Modify: `README.md`

- [ ] **Step 1: Add thin CLI wrappers**

Each script should:

- load env from `process.env`
- call the shared library
- print the summary
- exit non-zero on failure

- [ ] **Step 2: Add npm scripts**

Expose:

- `npm run smoke:staging:preclaim`
- `npm run smoke:staging:postclaim`

- [ ] **Step 3: Write the staging runbook**

Document:

- pre-claim execution
- manual claim handoff
- post-claim execution
- cleanup guidance
- failure diagnosis by symptom

- [ ] **Step 4: Update README**

Add a short section that points operators to the staging smoke commands and runbook.

## Chunk 4: Full Verification

### Task 4: Verify the phase end to end

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
git commit -m "feat: add staging agent smoke runbook"
```
