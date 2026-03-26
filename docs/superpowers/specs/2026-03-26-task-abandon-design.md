# Task Abandon Feature Design

## Summary

Allow task assignees to abandon a completed task, returning it to OPEN status for others to claim.

## Motivation

Currently, once a task reaches `COMPLETED` status, only the creator can reject it (back to `CLAIMED`). The assignee has no way to voluntarily give up the task. This feature enables the assignee to abandon a completed task when they realize they cannot or do not want to proceed with verification.

## Design

### State Machine Change

Modify `src/lib/task-state-machine.ts`:

```typescript
const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  [TaskStatus.OPEN]: [TaskStatus.CLAIMED, TaskStatus.CANCELLED],
  [TaskStatus.CLAIMED]: [TaskStatus.OPEN, TaskStatus.COMPLETED, TaskStatus.CANCELLED],
  [TaskStatus.COMPLETED]: [TaskStatus.VERIFIED, TaskStatus.CLAIMED, TaskStatus.OPEN], // Added OPEN
  [TaskStatus.VERIFIED]: [],
  [TaskStatus.CANCELLED]: [],
};
```

### API Endpoint

**Endpoint:** `POST /api/tasks/[id]/abandon`

| Property | Value |
|----------|-------|
| Auth | `tasks:write` scope required |
| Precondition | Task status must be `COMPLETED` |
| Caller | Only the `assignee` can call |
| Rate limit | 10 requests / 10 minutes |
| Postcondition | Task status → `OPEN` |

**Data changes:**
- `status` → `OPEN`
- `assigneeId` → `null`
- `completedAt` → `null`
- `completionNote` → `null`

**Side effects:**
- Record `AgentActivity` with type `TASK_ABANDONED`
- Publish `task.abandoned` live event

**Agent API:** `POST /api/agent/tasks/[id]/abandon` wraps the above and updates agent status.

### Response Format

Success (200):
```json
{
  "success": true,
  "data": {
    "id": "task_xxx",
    "title": "...",
    "status": "OPEN",
    "assigneeId": null,
    ...
  }
}
```

Errors:
- 400: Task not in COMPLETED status
- 403: Only assignee can abandon
- 404: Task not found
- 409: Concurrent modification conflict

### Testing

1. **State machine tests**: Verify `COMPLETED → OPEN` transition is valid
2. **API tests**:
   - Happy path: assignee abandons COMPLETED task → becomes OPEN
   - Auth: non-authenticated → 401
   - Scope: missing `tasks:write` → 403
   - Permission: non-assignee attempts → 403
   - State: non-COMPLETED task → 400
   - Concurrency: simultaneous abandon → 409

## Files to Modify

1. `src/lib/task-state-machine.ts` - Add `OPEN` to COMPLETED transitions
2. `src/app/api/tasks/[id]/abandon/route.ts` - New endpoint
3. `src/app/api/agent/tasks/[id]/abandon/route.ts` - New Agent API endpoint
4. `src/lib/agent-activity-shared.ts` - Add `TASK_ABANDONED` type (if not exists)
5. Tests for above

## Out of Scope

- Abandon history tracking (no new DB fields)
- Cooldown period before re-claiming
- Notification to task creator