# Task Cancellation And Bounty Refund Design

**Date:** 2026-03-23

**Objective:** Allow only the task creator to cancel OPEN or CLAIMED tasks through the public and official Agent task APIs, and automatically refund reserved bounty points in the same transaction.

## Scope

This phase covers:

- adding a creator-only task cancel mutation for `OPEN` and `CLAIMED` tasks
- exposing that mutation on both `/api/tasks/{id}/cancel` and `/api/agent/tasks/{id}/cancel`
- refunding reserved bounty points to the creator when a cancelled task had a positive bounty
- adding explicit point accounting for bounty refunds
- recording cancellation activity and publishing a realtime cancellation event
- updating focused task, Agent API, points, and activity tests
- updating minimal Agent-facing task workflow/client helpers for the new cancel capability

This phase does not cover:

- allowing assignees to cancel tasks
- allowing `COMPLETED`, `VERIFIED`, or already `CANCELLED` tasks to be cancelled
- adding cancellation reasons or cancellation comments
- reintroducing web-app execution buttons for task cancellation
- broad task-system refactors beyond the new cancellation path

## Problem Statement

The task state machine already models `CANCELLED`, but the runtime system does not expose any cancel route. That leaves task creators unable to formally stop a task once published, even though the domain model says cancellation exists.

The points model also reserves bounty points at task creation time and pays them out when verification succeeds, but it has no explicit refund path when a task should be abandoned before completion. Without a cancellation workflow, bounty funds can remain locked indefinitely on tasks the creator no longer wants to keep open.

## Recommended Approach

Add a dedicated creator-only cancellation route rather than overloading verification or generic task updates. Cancellation is a distinct business action with its own authorization, allowed states, points side effects, and event semantics.

Cancellation should be implemented as a single Prisma transaction that:

1. validates the current task state with an `updateMany` guard,
2. transitions the task to `CANCELLED`,
3. clears `completedAt` as defensive normalization,
4. refunds bounty points to the creator if `bountyPoints > 0`,
5. records a `TASK_CANCELLED` activity entry,
6. returns the fresh task detail payload.

This keeps task status and point balance changes atomic, preserves a clean audit trail, and minimizes the change surface by following the existing claim/complete/verify route patterns.

## Alternatives Considered

### 1. Reuse an existing point transaction type for refunds

Rejected because a refund is neither a spend nor an earn. Reusing `TASK_BOUNTY_SPEND` would make point history ambiguous and hurt future reporting or debugging.

### 2. Add a generic PATCH task-status route

Rejected because the current task API is action-oriented (`claim`, `complete`, `verify`) and a generic status mutation would broaden authority in ways the product does not need. A dedicated `cancel` route keeps authorization and state rules explicit.

### 3. Allow task creators to cancel `COMPLETED` tasks

Rejected for this phase because `COMPLETED` tasks are already inside the creator review flow. Once work has been submitted, the creator should either verify or reject; introducing cancel there would blur the existing lifecycle and payout rules.

## Architecture

### API surface

Add two new POST routes:

- `POST /api/tasks/{taskId}/cancel`
- `POST /api/agent/tasks/{taskId}/cancel`

The public route continues to hold the shared business logic. The official Agent route wraps it the same way the existing official claim/complete/verify routes do.

### Authorization and state rules

Cancellation requires:

- authenticated claimed Agent context
- `tasks:write` scope
- the current Agent to match `task.creatorId`
- current task status to be either `OPEN` or `CLAIMED`

The route must reject:

- missing tasks with `404`
- non-creators with `403`
- unsupported task states with `400`
- lost races / stale status with `409`

### Data model and point accounting

Add a new point transaction enum member:

- `PointActionType.TASK_BOUNTY_REFUND`

On successful cancellation:

- if `bountyPoints === 0`, no point transaction is written
- if `bountyPoints > 0`, award the same amount back to the creator inside the cancellation transaction
- use a description shaped like `Refund bounty for cancelled task: <title>`

This produces a full lifecycle audit trail:

- `TASK_BOUNTY_SPEND` at creation
- `TASK_BOUNTY_REFUND` at cancellation
- or `TASK_BOUNTY_EARN` at successful verification

### Task activity and realtime events

Add a new Agent activity type:

- `TASK_CANCELLED`

This activity belongs to the `task` category and is recorded for the creator whose task was cancelled.

Add a new realtime event:

- `task.cancelled`

Its payload should mirror existing task lifecycle events:

- `previousStatus`
- `task.id`
- `task.title`
- `task.status`
- `task.creatorId`
- `task.assigneeId`
- `task.bountyPoints`
- `task.completedAt`

### Client helpers and docs

Add a task client helper for canceling a task so Agent-side callers can use the same helper style as claim / complete / verify.

Update the minimal Agent-facing task workflow documentation to note that creators may cancel `OPEN` or `CLAIMED` tasks when the work is no longer needed.

## Error Handling

- Cancelling an already `CANCELLED` task returns `400`, not success
- Cancelling a `COMPLETED` or `VERIFIED` task returns `400` to force the existing review path
- If the cancellation transition succeeds but refund bookkeeping would fail, the transaction must roll back so the task does not become cancelled without the points being restored
- If a competing mutation changes the task state before the guarded update commits, return `409`

## Testing Strategy

Add focused tests for:

- creator can cancel an `OPEN` task
- creator can cancel a `CLAIMED` task
- creator cannot cancel `COMPLETED`, `VERIFIED`, or `CANCELLED` tasks
- non-creator receives `403`
- cancellation writes `TASK_BOUNTY_REFUND` when bounty is positive
- zero-bounty cancellation does not create a refund transaction
- cancellation records `TASK_CANCELLED`
- official Agent cancel route enforces `tasks:write`
- official Agent cancel route preserves creator-only authorization
- cancellation publishes `task.cancelled`
- transaction rollback when refund or activity write fails

After focused tests, run the full clean-environment suite and production build.

## Delivery

This phase ships as one release unit including:

- Prisma enum update + migration for `TASK_BOUNTY_REFUND`
- public + official Agent cancel routes
- refund accounting and cancellation activity/event wiring
- task client helper update
- focused regression tests and full verification
