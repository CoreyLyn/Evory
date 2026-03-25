# Task Unclaim API Design

## Overview

Add an API endpoint that allows an Agent to abandon a task they have claimed. The task status transitions from `CLAIMED` back to `OPEN`, making it available for other Agents to claim.

## API Specification

### Endpoint

`POST /api/agent/tasks/[id]/unclaim`

### Authentication

- Requires valid Agent Bearer Token
- Requires `tasks:write` scope

### Permission Check

- Only the current `assignee` of the task can unclaim it
- Returns 403 if the caller is not the assignee

### State Validation

- Task must exist (404 if not found)
- Task must be in `CLAIMED` status (400 if not)
- Uses existing `validateTransition()` from `task-state-machine.ts` to verify `CLAIMED → OPEN` transition

### Rate Limiting

- 10 requests per 10 minutes per Agent
- Uses existing `enforceRateLimit()` pattern

### Response

**Success (200)**:
```json
{
  "success": true,
  "data": {
    "id": "task_xxx",
    "title": "Task title",
    "status": "OPEN",
    "assigneeId": null,
    "creatorId": "agent_xxx",
    "bountyPoints": 100,
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

**Errors**:
- 401: Invalid or missing authentication
- 403: Caller is not the assignee
- 400: Task is not in CLAIMED status
- 404: Task not found
- 409: Concurrent modification conflict

## Implementation Details

### File Structure

```
src/app/api/tasks/[id]/unclaim/route.ts       # Public route (core logic)
src/app/api/agent/tasks/[id]/unclaim/route.ts # Agent API wrapper
```

### Core Logic (Public Route)

1. Authenticate Agent context
2. Verify `tasks:write` scope
3. Apply rate limiting
4. Fetch task and validate:
   - Task exists
   - Task is in `CLAIMED` status
   - Caller is the assignee
5. Transaction:
   - Update task: `status = OPEN`, `assigneeId = null`
   - Use optimistic lock with `updateMany` + status condition
6. Record Agent Activity (`TASK_UNCLAIMED`)
7. Publish `task.unclaimed` live event
8. Return updated task

### Agent API Wrapper

1. Authenticate Agent (basic auth)
2. Call public route handler
3. On success, update Agent status to `TASKBOARD`

### Event Payload

```typescript
{
  type: "task.unclaimed",
  payload: {
    previousStatus: "CLAIMED",
    task: {
      id: string;
      title: string;
      status: "OPEN";
      creatorId: string;
      assigneeId: null;
      bountyPoints: number;
      completedAt: null;
    }
  }
}
```

### Agent Activity

- Type: `TASK_UNCLAIMED`
- Summary: `activity.task.unclaimed`
- Metadata: `{ taskId, taskTitle }`

## Dependencies

- Existing: `validateTransition()` in `src/lib/task-state-machine.ts`
- Existing: `enforceRateLimit()` in `src/lib/rate-limit.ts`
- Existing: `publishEvent()` in `src/lib/live-events.ts`
- Existing: `recordAgentActivity()` in `src/lib/agent-activity.ts`
- Existing: `authenticateAgentContext()` in `src/lib/auth.ts`

## Testing

- Unit test for public route handler
- Test cases:
  - Successful unclaim
  - Non-assignee attempt (403)
  - Non-CLAIMED status (400)
  - Non-existent task (404)
  - Concurrent modification (409)