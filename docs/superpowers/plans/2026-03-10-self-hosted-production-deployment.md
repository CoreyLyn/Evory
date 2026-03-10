# Self-Hosted Production Deployment Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a production-safe self-hosted deployment baseline for Node and container environments using one cross-platform startup contract.

**Architecture:** Keep deployment logic in Node scripts instead of shell entrypoints so Linux containers and future Windows Server installs can share the same boot flow. Tighten Prisma generation, startup validation, migration deployment, health checks, and operator documentation as one release unit.

**Tech Stack:** Next.js App Router, TypeScript, Prisma 7, PostgreSQL, Node test runner, Docker

---

## Chunk 1: Production Startup Scripts

### Task 1: Add failing tests for startup validation helpers

**Files:**
- Create: `src/scripts/production-startup.test.ts`
- Create: `scripts/production-startup.ts`

- [ ] **Step 1: Write the failing tests**

Cover:

- missing required env values produce a stable error
- startup config normalizes required env keys
- DB probe helper reports failure cleanly

- [ ] **Step 2: Run the focused startup tests and verify RED**

Run: `node --import tsx --test src/scripts/production-startup.test.ts`
Expected: FAIL because the startup helpers do not exist yet.

- [ ] **Step 3: Implement the minimal startup helper module**

Add a script module that exports testable helpers for:

- env validation
- database probe
- production bootstrap sequencing

- [ ] **Step 4: Re-run the focused startup tests and verify GREEN**

Run: `node --import tsx --test src/scripts/production-startup.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/production-startup.ts src/scripts/production-startup.test.ts
git commit -m "feat: add production startup validation helpers"
```

## Chunk 2: Health Endpoint

### Task 2: Add liveness and readiness checks

**Files:**
- Create: `src/app/api/health/route.ts`
- Create: `src/app/api/health/route.test.ts`
- Modify: `scripts/production-startup.ts`

- [ ] **Step 1: Write the failing health endpoint tests**

Cover:

- liveness returns success when the route is reachable
- readiness reports healthy when DB probe passes
- readiness reports degraded when DB probe fails

- [ ] **Step 2: Run the focused health tests and verify RED**

Run: `node --import tsx --test src/app/api/health/route.test.ts`
Expected: FAIL because the route does not exist yet.

- [ ] **Step 3: Implement the health route and shared readiness helper**

Keep the response shape stable and lightweight so proxies and operators can depend on it.

- [ ] **Step 4: Re-run the focused health tests and verify GREEN**

Run: `node --import tsx --test src/app/api/health/route.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/health/route.ts src/app/api/health/route.test.ts scripts/production-startup.ts
git commit -m "feat: add production health checks"
```

## Chunk 3: Package And Deployment Assets

### Task 3: Wire production scripts, Prisma generation, and container packaging

**Files:**
- Modify: `package.json`
- Create: `Dockerfile`
- Modify: `README.md`
- Modify: `.gitignore` only if needed

- [ ] **Step 1: Write failing assertions in existing tests or add a focused script test if needed**

Cover:

- package scripts expose production-safe commands
- Docker startup command reuses the Node startup contract

- [ ] **Step 2: Run the focused verification and verify RED**

Run: `node --import tsx --test src/scripts/production-startup.test.ts`
Expected: FAIL until package wiring and startup contract are aligned.

- [ ] **Step 3: Implement the packaging changes**

Add:

- explicit `prisma generate` command
- production migration command
- production start command that runs startup checks before `next start`
- multi-stage Dockerfile using the same npm startup path
- README instructions for self-hosted Node and container deployment

- [ ] **Step 4: Re-run the focused startup tests and verify GREEN**

Run: `node --import tsx --test src/scripts/production-startup.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package.json Dockerfile README.md scripts/production-startup.ts src/scripts/production-startup.test.ts
git commit -m "feat: add self-hosted production deployment assets"
```

## Chunk 4: Full Verification

### Task 4: Verify the deployment baseline end to end

**Files:**
- Modify: any files required to resolve regressions

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 3: Run production build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Commit the verified phase**

```bash
git add -A
git commit -m "chore: verify self-hosted production deployment"
```
