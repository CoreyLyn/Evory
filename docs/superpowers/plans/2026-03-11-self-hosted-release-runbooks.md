# Self-Hosted Release Runbooks Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a generic self-hosted pre-production checklist and operations manual, then simplify the README to point operators at those runbooks.

**Architecture:** Keep the operational knowledge in `docs/runbooks/`, with `README.md` acting as the top-level entry point. Reuse existing staging smoke documentation instead of duplicating it, and cross-link the three docs so the release flow is easy to follow.

**Tech Stack:** Markdown documentation, npm command references, existing Next.js/Prisma/Docker deployment commands

---

## Chunk 1: Add The Release Runbooks

### Task 1: Write The Pre-Production Checklist

**Files:**
- Create: `docs/runbooks/pre-production-checklist.md`
- Reference: `docs/runbooks/staging-agent-smoke.md`
- Reference: `README.md`

- [ ] **Step 1: Write the checklist sections**

Include:

- prerequisites
- build and deployment verification
- migration verification
- health verification
- shop seed verification
- Agent smoke verification
- sign-off section

- [ ] **Step 2: Add concrete commands**

Use real repository commands such as:

- `npm run build`
- `npm run start:prod`
- `npm run db:migrate:deploy`
- `npm run db:seed`
- `npm run smoke:staging:preclaim`
- `npm run smoke:staging:postclaim`

- [ ] **Step 3: Add explicit pass criteria**

For each section, state what counts as ready, such as `/api/health` returning `status: ok` and `/api/points/shop` returning at least one catalog item.

### Task 2: Write The Self-Hosted Operations Manual

**Files:**
- Create: `docs/runbooks/self-hosted-operations.md`
- Reference: `docs/runbooks/staging-agent-smoke.md`
- Reference: `README.md`

- [ ] **Step 1: Document supported deployment assumptions**

State that the manual targets self-hosted Node/container deployments behind a reverse proxy and does not depend on a specific control panel.

- [ ] **Step 2: Document common operations**

Include:

- rebuild/restart commands
- health checks
- logs
- migrations
- seed flow
- smoke flow

- [ ] **Step 3: Document failure diagnosis**

Cover at least:

- `/api/health` not ready
- migration failures
- empty shop catalog
- failed smoke claim/auth
- reverse proxy reaching the app but not the public domain

## Chunk 2: Cross-Link Existing Docs

### Task 3: Update The Staging Smoke Runbook

**Files:**
- Modify: `docs/runbooks/staging-agent-smoke.md`

- [ ] **Step 1: Add release-flow context**

Clarify when to use the smoke runbook relative to the pre-production checklist.

- [ ] **Step 2: Add links to the new runbooks**

Keep the smoke runbook focused and point to the checklist/operations docs for broader deployment guidance.

### Task 4: Simplify README Deployment Entry Points

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Keep local development instructions intact**

Do not expand README into another runbook.

- [ ] **Step 2: Replace long deployment prose with doc links**

Point operators to:

- `docs/runbooks/pre-production-checklist.md`
- `docs/runbooks/self-hosted-operations.md`
- `docs/runbooks/staging-agent-smoke.md`

- [ ] **Step 3: Keep key high-level operational facts**

Retain short notes about:

- `npm run start:prod`
- `/api/health`
- single-instance realtime limitation

## Chunk 3: Verify And Commit

### Task 5: Verify Documentation References

**Files:**
- Verify: `README.md`
- Verify: `docs/runbooks/pre-production-checklist.md`
- Verify: `docs/runbooks/self-hosted-operations.md`
- Verify: `docs/runbooks/staging-agent-smoke.md`

- [ ] **Step 1: Read the modified docs once end-to-end**

Check command accuracy, path accuracy, and link accuracy.

- [ ] **Step 2: Run verification**

Run:

```bash
npm run lint
npm run build
```

Expected:

- both commands exit successfully

- [ ] **Step 3: Commit**

```bash
git add README.md docs/runbooks docs/superpowers/specs/2026-03-11-self-hosted-release-runbooks-design.md docs/superpowers/plans/2026-03-11-self-hosted-release-runbooks.md
git commit -m "docs: add self-hosted release runbooks"
```
