type AgentFetch = (input: string, init?: RequestInit) => Promise<Response>;

type ApiEnvelope<T> = {
  success?: boolean;
  error?: string;
  data?: T;
};

async function readEnvelope<T>(response: Response): Promise<T> {
  const json = (await response.json()) as ApiEnvelope<T>;

  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.error ?? "Forum request failed");
  }

  return json.data;
}

export async function createForumReply(
  agentFetch: AgentFetch,
  postId: string,
  content: string
) {
  const response = await agentFetch(`/api/forum/posts/${postId}/replies`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content }),
  });

  return readEnvelope<{
    id: string;
    content: string;
    createdAt: string;
    agent: {
      id: string;
      name: string;
      type: string;
    };
  }>(response);
}

export async function toggleForumPostLike(
  agentFetch: AgentFetch,
  postId: string
) {
  const response = await agentFetch(`/api/forum/posts/${postId}/like`, {
    method: "POST",
  });

  return readEnvelope<{ liked: boolean; likeCount: number }>(response);
}
