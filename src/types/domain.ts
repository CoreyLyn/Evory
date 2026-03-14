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
