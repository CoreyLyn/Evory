# Single-Instance Realtime Hardening Design

**Date:** 2026-03-10

**Objective:** Make the current SSE/live-event system honest about its single-instance limitations and ensure clients degrade cleanly instead of assuming durable realtime guarantees.

## Scope

This phase covers:

- explicit capability metadata for the in-memory live-event bus
- SSE endpoint signaling that the transport is single-instance only
- health/capability exposure for realtime mode
- client-side downgrade behavior when realtime is unavailable or discouraged
- deployment documentation that states the single-instance limitation clearly

This phase does not cover:

- Redis or any other shared pub/sub backend
- multi-instance ordering or durability guarantees
- changing core business workflows to depend on realtime delivery

## Problem Statement

The current realtime path uses an in-memory event store inside one Node process. That means:

- events are not shared across instances
- process restarts drop all subscribers and continuity
- any deployment that introduces multiple processes makes realtime observationally inconsistent

Right now the code exposes SSE as if it were a general realtime transport. The system should instead declare that it is an enhancement valid only for single-instance deployments.

## Recommended Approach

Treat realtime as an optional enhancement with explicit runtime signaling.

1. The live-event layer declares its mode as `in-memory-single-instance`.
2. `/api/events` emits capability metadata up front.
3. `/api/health` includes realtime capability details.
4. Clients use SSE only when the server advertises it as usable, and fall back to polling otherwise.

This keeps the current architecture lightweight while removing false assumptions from both operators and the UI.

## Alternatives Considered

### 1. Documentation only

Write down the limitation in README and deployment docs.

Rejected because it does not change runtime behavior or client assumptions.

### 2. Runtime signaling only

Expose single-instance capability metadata but leave clients unchanged.

Rejected because the UI would still depend on optimistic SSE behavior even when the server signals limited confidence.

### 3. Runtime signaling plus downgrade

Expose capability metadata and teach clients to degrade to polling.

Accepted because it matches current infrastructure reality without introducing new dependencies.

## Architecture

### Realtime capability model

The live-event subsystem should expose a small capability object, for example:

- mode: `in-memory-single-instance`
- transport: `sse`
- durability: `ephemeral`
- recommendedClientMode: `poll`
- reliableDeployment: `single-instance-only`

This object is not meant to negotiate advanced behavior. It exists to let routes, health checks, and clients present the truth consistently.

### SSE endpoint behavior

`/api/events` should continue to stream events, but the first messages must establish context:

- capability metadata
- ready event

Clients should no longer interpret a successful HTTP connection as proof of durable realtime support.

### Health exposure

`/api/health` should include a realtime section showing that the current transport is available but constrained. This gives operators a stable place to confirm that realtime is intentionally in degraded semantics rather than silently broken.

### Client downgrade behavior

Any consumer of `/api/events` should:

- read the capability payload
- continue using SSE only if the transport is usable for the current page
- switch to polling or refresh-based fallback when the capability says polling is recommended or the stream fails

The goal is graceful loss of enhancement, not perfect catch-up.

## Error Handling

- SSE unavailable: client falls back to polling without breaking the page.
- Capability says polling is recommended: client uses fallback immediately.
- Event stream disconnects: client should retry conservatively or stay on polling, depending on current page behavior.

## Testing Strategy

Add focused tests for:

- live-event capability metadata
- `/api/events` first-frame signaling
- health route realtime capability reporting
- client downgrade behavior when SSE is discouraged or fails

Then run:

- `npm test`
- `npm run lint`
- `npm run build`

## Delivery

This phase ships as one release unit including:

- live-events capability metadata
- SSE route updates
- health capability updates
- client downgrade behavior
- documentation
