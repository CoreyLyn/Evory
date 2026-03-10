# Single-Instance Realtime Hardening Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make realtime behavior explicit and safe for single-instance deployments by signaling capability limits and degrading clients cleanly when SSE is not trustworthy.

**Architecture:** Keep the current in-memory event bus, but stop treating it as a general-purpose realtime layer. Add capability signaling at the live-event and route layers, expose the limitation in health checks, and update clients to fall back to polling or refresh-friendly behavior when realtime is discouraged or unavailable.

**Tech Stack:** Next.js App Router, TypeScript, SSE, Node test runner

---

## Chunk 1: Capability Signaling

### Task 1: Add failing tests for live-event capability metadata

**Files:**
- Modify: `src/lib/live-events.test.ts`
- Modify: `src/lib/live-events.ts`

- [ ] **Step 1: Write the failing tests**

Cover:

- live-event subsystem exposes stable capability metadata
- ready event payload includes capability context
- serialized stream starts with capability signaling before normal events

- [ ] **Step 2: Run the focused live-event tests and verify RED**

Run: `node --import tsx --test src/lib/live-events.test.ts`
Expected: FAIL because capability signaling does not exist yet.

- [ ] **Step 3: Implement the minimal live-event capability changes**

Add a small capability object and include it in stream bootstrapping.

- [ ] **Step 4: Re-run the focused live-event tests and verify GREEN**

Run: `node --import tsx --test src/lib/live-events.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/live-events.ts src/lib/live-events.test.ts
git commit -m "feat: signal single-instance realtime capability"
```

## Chunk 2: Route And Health Exposure

### Task 2: Expose realtime limits through routes

**Files:**
- Modify: `src/app/api/events/route.ts`
- Modify: `src/app/api/health/route.ts`
- Modify: `src/app/api/health/route.test.ts`
- Create or modify: `src/app/api/events/route.test.ts`

- [ ] **Step 1: Write the failing route tests**

Cover:

- `/api/events` sends capability metadata on connect
- `/api/health` includes realtime capability details
- health response remains healthy for process liveness while still marking realtime as single-instance constrained

- [ ] **Step 2: Run the focused route tests and verify RED**

Run: `node --import tsx --test src/app/api/health/route.test.ts src/app/api/events/route.test.ts`
Expected: FAIL because the route responses do not yet include realtime capability metadata.

- [ ] **Step 3: Implement the minimal route changes**

Wire the live-event capability object into both routes without changing core event publishing semantics.

- [ ] **Step 4: Re-run the focused route tests and verify GREEN**

Run: `node --import tsx --test src/app/api/health/route.test.ts src/app/api/events/route.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/events/route.ts src/app/api/health/route.ts src/app/api/health/route.test.ts src/app/api/events/route.test.ts
git commit -m "feat: expose realtime capability metadata"
```

## Chunk 3: Client Downgrade Behavior

### Task 3: Degrade realtime consumers cleanly

**Files:**
- Modify: client files that consume `/api/events` after discovery
- Modify: relevant tests for those client files
- Modify: `README.md`

- [ ] **Step 1: Identify realtime consumers and write the failing downgrade tests**

Cover:

- capability recommends polling
- SSE connection fails
- page still refreshes state through fallback behavior

- [ ] **Step 2: Run the focused client tests and verify RED**

Run the exact focused tests for the discovered consumer files.
Expected: FAIL because the current client logic assumes SSE availability.

- [ ] **Step 3: Implement the minimal downgrade behavior**

Keep fallback logic local to the realtime consumer rather than spreading it across unrelated components.

- [ ] **Step 4: Update operator documentation**

Document:

- single-instance-only realtime semantics
- what fallback behavior the UI uses
- that realtime is an enhancement, not a correctness guarantee

- [ ] **Step 5: Re-run the focused client tests and verify GREEN**

Run the same focused client tests from Step 2.
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add README.md <realtime-client-files> <realtime-client-tests>
git commit -m "fix: degrade realtime clients outside single-instance mode"
```

## Chunk 4: Full Verification

### Task 4: Verify the realtime hardening phase end to end

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
git commit -m "chore: verify single-instance realtime hardening"
```
