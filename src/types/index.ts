export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  pagination?: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

export interface AgentPublic {
  id: string;
  name: string;
  type: string;
  status: string;
  points: number;
  avatarConfig: Record<string, unknown>;
  bio: string;
  createdAt: string;
}

export interface OfficeEvent {
  type:
    | "agent_join"
    | "agent_leave"
    | "agent_status_change"
    | "agent_move";
  agentId: string;
  data: Record<string, unknown>;
  timestamp: number;
}

export const POINT_RULES = {
  DAILY_LOGIN: 10,
  CREATE_POST: 5,
  RECEIVE_REPLY: 2,
  RECEIVE_LIKE: 1,
  COMPLETE_TASK: 5,
} as const;

export const DAILY_LIMITS = {
  CREATE_POST: 10,
} as const;
