# Agent Credential Consistency Hardening Design

## Goal

Harden Evory's Agent authentication and credential lifecycle so real external Agents can only operate through a strictly validated, transactionally consistent, database-constrained model.

## Scope

This design covers only the first production-readiness phase for real Agent rollout:

- Agent credential validation semantics
- claim, register, rotate, and revoke consistency
- Prisma schema and migration changes required to enforce database-level safety
- strict handling of historical bad credential data
- regression and DB-backed verification for the new guarantees

This phase does not include deployment pipeline work, SSE redesign, broader observability, or public UI/product surface cleanup beyond what is needed to support the hardened credential model.

## Current Problems

The current implementation has several production blockers:

- `src/lib/auth.ts` treats malformed or empty `scopes` as full default permissions, which is fail-open.
- `src/app/api/agents/claim/route.ts` is not atomic and does not reject expired credentials.
- `src/app/api/agents/register/route.ts`, `src/app/api/users/me/agents/[id]/rotate-key/route.ts`, and `src/app/api/users/me/agents/[id]/revoke/route.ts` perform multi-step writes without a single transaction.
- `prisma/schema.prisma` does not enforce the invariant that one Agent can have at most one active credential.
- Existing tests are strong at route behavior but do not fully prove DB-level concurrency and migration safety.

## Approaches Considered

### 1. Application-only hardening

Keep the schema mostly unchanged and fix behavior only in route and auth code.

Pros:

- smallest surface area
- quickest initial patch

Cons:

- no DB-level protection against future regressions
- leaves integrity dependent on application discipline
- weak story for historical bad data

### 2. Database-first hardening

Add constraints and migration rules first, then adapt application behavior around them.

Pros:

- strongest data boundary
- catches invalid state early

Cons:

- rollout is brittle if application behavior is not updated in the same release
- higher risk of partial operational breakage during deployment

### 3. Recommended: release-unit hardening

Ship schema changes, strict migration, application logic updates, and verification together as one release unit.

Pros:

- closes the dangerous gaps at every layer at once
- minimizes the window where code and data rules disagree
- gives a clean go/no-go gate for real Agent testing

Cons:

- broader implementation batch
- requires DB-backed verification, not just route mocks

## Recommended Approach

Use approach 3.

The system should treat credential safety as a cross-layer invariant:

- authentication must be fail-closed
- lifecycle mutations must be transactional
- the database must reject invalid steady-state credential topologies
- historical bad data must be explicitly invalidated rather than silently normalized into active access

## Product And Security Rules

These rules are fixed by the approved design:

- malformed or empty credential scopes never imply default permissions
- an Agent credential is usable only if it is structurally valid, not revoked, not expired, and attached to an active claimed Agent
- claim succeeds only once for a given unclaimed Agent
- rotate must leave exactly one active credential for the Agent on success
- revoke must leave zero active credentials for the Agent on success
- historical bad credentials are not auto-repaired into valid access
- migration may invalidate historical credential rows when they cannot be trusted

## Architecture

### Auth Layer

`src/lib/auth.ts` becomes the canonical source of Agent credential validity.

It should:

- parse scopes strictly
- distinguish valid scopes from malformed persisted data
- reject malformed or empty scopes instead of substituting defaults
- validate credential revocation, expiration, and Agent activity
- update usage metadata only after the credential passes all checks

The auth layer should also stop hiding internal failures behind ordinary invalid-key semantics. Invalid credentials and infrastructure failures are different operational states and should remain distinguishable in code and logs.

### Route Layer

The following routes become transactional consistency boundaries:

- `src/app/api/agents/register/route.ts`
- `src/app/api/agents/claim/route.ts`
- `src/app/api/users/me/agents/[id]/rotate-key/route.ts`
- `src/app/api/users/me/agents/[id]/revoke/route.ts`

Each route should:

- validate preconditions before starting the write
- perform the state transition inside a single Prisma transaction
- use conditional updates where concurrency matters
- fail cleanly when the current DB state no longer satisfies the transition assumptions

### Database Layer

`prisma/schema.prisma` and the corresponding SQL migration should enforce the steady-state credential model.

The key invariant is:

- one Agent may have at most one active credential, where active means `revokedAt IS NULL`

The migration should also support strict data tightening rules for existing rows.

## Data Model Changes

The schema changes in this phase are intentionally narrow:

- keep the existing `Agent` and `AgentCredential` model structure
- add DB-level support for the single-active-credential invariant
- ensure indexes support active-credential lookups and migration cleanup work

If Prisma cannot express the partial uniqueness directly in schema syntax, the migration may add the index using raw SQL while the Prisma schema documents the intended invariant.

## Migration Rules

Because the approved strategy is strict tightening, migration behavior should be deterministic and conservative:

- any credential with malformed `scopes` data is revoked
- any credential with an empty scopes array is revoked
- any Agent with multiple active credentials retains exactly one survivor chosen by the fixed ordering `createdAt DESC, id DESC` among structurally valid non-expired credentials; the rest are revoked
- expired credentials are never selected as the retained active credential
- if an Agent has no valid surviving credential after migration, that Agent simply becomes unauthenticatable until a fresh credential is issued

The migration should not try to infer user intent or silently repair ambiguous ownership or claim-state semantics. It should only make access stricter and safer.

## Failure Semantics

### Claim

Claim succeeds only when all of the following are true at commit time:

- the credential exists
- the credential is not revoked
- the credential is not expired
- the linked Agent is still `UNCLAIMED`
- the linked Agent is not in a contradictory state, such as mismatched `claimStatus`, `ownerUserId`, and `revokedAt`

If another claimant wins first, the route returns a conflict instead of pretending success.

### Register

Registration creates the Agent and its initial credential in one transaction. If credential creation fails, the Agent row must not remain behind as an orphaned partial registration.

### Rotate

Rotation revokes existing active credentials, creates the replacement credential, and records the audit entry in one transaction. If any part fails, the old active credential remains the source of truth.

Rotation must fail explicitly when the Agent is already in a contradictory claim-state configuration. The route must not silently rewrite ownership or claim metadata to make the operation succeed.

### Revoke

Revocation invalidates active credentials and updates Agent revocation state in one transaction. If the transaction fails, no partial credential shutdown should persist.

Revocation must fail explicitly when the Agent is already in a contradictory claim-state configuration. The route must not auto-heal claim metadata as part of revocation.

## Testing Strategy

This phase requires three kinds of verification.

### 1. Route And Auth Regression Tests

Extend existing tests to cover:

- fail-closed scope parsing
- expired-credential claim rejection
- atomic claim conflict behavior
- rotate and revoke behavior under hardened rules
- internal auth infrastructure failures remain distinguishable from ordinary invalid-key outcomes

### 2. DB-Backed Concurrency Tests

Add integration tests that use a real database state to prove:

- only one concurrent claim can succeed
- concurrent rotate flows do not leave multiple active credentials
- transactional failure does not leave half-complete lifecycle mutations

### 3. Migration Verification Tests

Create fixture-style migration tests that seed known-bad credential layouts and assert:

- malformed scopes are revoked
- duplicate active credentials collapse to one survivor
- expired credentials are not retained as active survivors

## Rollout

This phase should ship as one release unit:

1. schema and migration
2. auth and route updates
3. test fixture and seed updates
4. regression and DB-backed verification

The application should not be deployed ahead of the migration, and the migration should not be considered complete without the route-layer hardening.

## Success Criteria

This phase is complete when all of the following are true:

- malformed or empty scopes cannot authenticate or inherit default permissions
- duplicate active credentials cannot persist after migration or successful runtime mutations
- register, claim, rotate, and revoke are each atomic from the caller's point of view
- expired credentials cannot be used to claim an Agent
- DB-backed tests prove the intended concurrency and migration guarantees
- the existing project verification baseline still passes after the hardening changes
