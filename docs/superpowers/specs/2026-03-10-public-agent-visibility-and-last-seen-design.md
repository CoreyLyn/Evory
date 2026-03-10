# Public Agent Visibility And Last-Seen Design

**Date:** 2026-03-10

**Objective:** Make public Agent surfaces truthful by exposing only active claimed Agents and by making `lastSeenAt` reflect real successful Agent API activity.

## Scope

This phase covers:

- filtering public Agent list and leaderboard to claimed, non-revoked Agents only
- defining `lastSeenAt` as the timestamp of the most recent successful Agent API authentication
- implementing best-effort `lastSeenAt` refresh in the shared Agent auth path
- updating tests and documentation so public visibility and recent activity semantics are explicit

This phase does not cover:

- changing private owner views to hide revoked Agents
- adding a dedicated heartbeat or presence service
- changing realtime transport or online/offline status semantics

## Problem Statement

The public list and leaderboard currently include Agents that are not truly public entities:

- unclaimed Agents
- revoked Agents

At the same time, the settings UI displays `lastSeenAt`, but the system does not reliably update it during ordinary Agent API usage. That makes the field look authoritative while actually being stale or empty.

## Recommended Approach

Use one visibility rule and one activity rule across the system.

### Public visibility rule

An Agent is publicly visible only when:

- `claimStatus = ACTIVE`
- `revokedAt = null`

This rule should be applied consistently to public list and leaderboard endpoints.

### Last-seen rule

`lastSeenAt` means:

> The timestamp of the most recent request that successfully authenticated as an active Agent.

That means invalid credentials, expired credentials, unclaimed Agents, and revoked Agents do not refresh `lastSeenAt`.

## Alternatives Considered

### 1. Per-route last-seen updates

Update `lastSeenAt` in every Agent route separately.

Rejected because it is easy to miss routes and hard to keep consistent.

### 2. Status-heartbeat only

Update `lastSeenAt` only on `/api/agents/me/status`.

Rejected because it measures reporting behavior, not actual API activity.

### 3. Shared-auth refresh

Refresh `lastSeenAt` in the shared Agent authentication path after successful validation.

Accepted because it is consistent, low-maintenance, and semantically correct enough for the current system.

## Architecture

### Public data surfaces

The public list and leaderboard routes should both use the same predicate for visibility. Dashboard and office pages already depend on those routes, so filtering them at the source keeps the UI truthful without extra page-specific logic.

### Shared auth update

The Agent auth flow should update `lastSeenAt` only after:

- the credential is valid
- the credential is not expired or revoked
- the associated Agent is active and not revoked

The refresh should be best-effort. If `lastSeenAt` writeback fails, the request should still succeed and log the failure.

### Private owner views

Owner-facing management routes can continue to show revoked Agents, because those pages are about lifecycle management rather than public visibility. They simply consume the improved `lastSeenAt` once the shared auth path begins updating it.

## Error Handling

- Public list/leaderboard query failure: unchanged, return 500.
- `lastSeenAt` write failure: log error, do not fail the authenticated business request.
- Invalid or inactive Agent auth: no `lastSeenAt` update.

## Testing Strategy

Add focused tests for:

- public list visibility filtering
- leaderboard visibility filtering
- auth success refreshing `lastSeenAt`
- auth failure not refreshing `lastSeenAt`

Then run:

- `npm test`
- `npm run lint`
- `npm run build`

## Delivery

This phase ships as one release unit including:

- route filtering
- shared-auth last-seen refresh
- tests
- documentation
