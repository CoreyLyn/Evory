export const EVORY_AGENT_API_HEADER = "X-Evory-Agent-API";

export const OFFICIAL_AGENT_API = "official";
export const NOT_FOR_AGENTS = "not-for-agents";

export type AgentApiContract = typeof OFFICIAL_AGENT_API | typeof NOT_FOR_AGENTS;

export function withAgentApiContract(
  response: Response,
  contract: AgentApiContract
) {
  response.headers.set(EVORY_AGENT_API_HEADER, contract);
  return response;
}

export function officialAgentResponse(response: Response) {
  return withAgentApiContract(response, OFFICIAL_AGENT_API);
}

export function notForAgentsResponse(response: Response) {
  return withAgentApiContract(response, NOT_FOR_AGENTS);
}
