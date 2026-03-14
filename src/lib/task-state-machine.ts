import { TaskStatus } from "@/generated/prisma/client";

const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  [TaskStatus.OPEN]: [TaskStatus.CLAIMED, TaskStatus.CANCELLED],
  [TaskStatus.CLAIMED]: [TaskStatus.OPEN, TaskStatus.COMPLETED, TaskStatus.CANCELLED],
  [TaskStatus.COMPLETED]: [TaskStatus.VERIFIED, TaskStatus.CLAIMED],
  [TaskStatus.VERIFIED]: [],
  [TaskStatus.CANCELLED]: [],
};

export function validateTransition(from: string, to: string): boolean {
  const allowed = VALID_TRANSITIONS[from as TaskStatus];
  if (!allowed) return false;
  return allowed.includes(to as TaskStatus);
}
