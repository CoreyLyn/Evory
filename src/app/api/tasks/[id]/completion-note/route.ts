import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { notForAgentsResponse } from "@/lib/agent-api-contract";
import { serializeAgentDisplayName } from "@/lib/agent-display-name";
import {
  agentContextHasScope,
  authenticateAgentContext,
  forbiddenAgentScopeResponse,
  unauthorizedResponse,
} from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { TaskStatus } from "@/generated/prisma/client";

const COMPLETION_NOTE_MAX_LENGTH = 5000;

const AGENT_SELECT = {
  id: true,
  name: true,
  isDeletedPlaceholder: true,
  avatarConfig: true,
} as const;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // 1. Authentication + scope validation
  const agentContext = await authenticateAgentContext(request);
  if (!agentContext) return notForAgentsResponse(unauthorizedResponse());
  if (!agentContextHasScope(agentContext, "tasks:write")) {
    return notForAgentsResponse(forbiddenAgentScopeResponse("tasks:write"));
  }

  // 2. Rate limit
  const abuseLimited = await enforceRateLimit({
    bucketId: "task-completion-note-update",
    routeKey: "task-completion-note-update",
    maxRequests: 10,
    windowMs: 10 * 60 * 1000,
    request,
    subjectId: agentContext.agent.id,
    eventType: "AGENT_ABUSE_LIMIT_HIT",
    metadata: {
      agentId: agentContext.agent.id,
    },
  });

  if (abuseLimited) {
    return notForAgentsResponse(abuseLimited);
  }

  const agent = agentContext.agent;
  const { id } = await params;

  // 3. Parse request body
  const body = await request.json().catch(() => ({}));
  const completionNoteInput = body.completionNote;

  // 4. Validate completionNote
  if (
    completionNoteInput !== undefined &&
    typeof completionNoteInput !== "string"
  ) {
    return notForAgentsResponse(Response.json(
      { success: false, error: "completionNote must be a string" },
      { status: 400 }
    ));
  }

  const trimmedCompletionNote =
    typeof completionNoteInput === "string" ? completionNoteInput.trim() : "";
  if (trimmedCompletionNote.length > COMPLETION_NOTE_MAX_LENGTH) {
    return notForAgentsResponse(Response.json(
      {
        success: false,
        error: `completionNote must be at most ${COMPLETION_NOTE_MAX_LENGTH} characters`,
      },
      { status: 400 }
    ));
  }

  const completionNote = trimmedCompletionNote.length > 0 ? trimmedCompletionNote : null;

  try {
    // 5. Query task, validate status and assignee
    const task = await prisma.task.findUnique({
      where: { id },
      select: { id: true, assigneeId: true, status: true },
    });

    if (!task) {
      return notForAgentsResponse(Response.json(
        { success: false, error: "Task not found" },
        { status: 404 }
      ));
    }

    if (task.status !== TaskStatus.COMPLETED) {
      return notForAgentsResponse(Response.json(
        { success: false, error: "Can only update completionNote when task is COMPLETED" },
        { status: 400 }
      ));
    }

    if (task.assigneeId !== agent.id) {
      return notForAgentsResponse(Response.json(
        { success: false, error: "Only the assignee can update this task's completion note" },
        { status: 403 }
      ));
    }

    // 6. Update completionNote
    const updated = await prisma.task.update({
      where: { id },
      data: { completionNote },
      select: {
        id: true,
        creatorId: true,
        assigneeId: true,
        title: true,
        description: true,
        status: true,
        bountyPoints: true,
        createdAt: true,
        updatedAt: true,
        completedAt: true,
        completionNote: true,
        reviewComment: true,
        reviewedAt: true,
        creator: { select: AGENT_SELECT },
        assignee: { select: AGENT_SELECT },
      },
    });

    // 7. Return updated task
    return notForAgentsResponse(Response.json({
      success: true,
      data: {
        ...updated,
        creator: serializeAgentDisplayName(updated.creator),
        assignee: updated.assignee ? serializeAgentDisplayName(updated.assignee) : null,
      },
    }));
  } catch (err) {
    console.error("[tasks/[id]/completion-note PATCH]", err);
    return notForAgentsResponse(Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    ));
  }
}
