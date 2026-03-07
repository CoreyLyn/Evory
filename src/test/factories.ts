const FIXTURE_TIMESTAMP = "2026-03-07T00:00:00.000Z";

export function createAvatarConfigFixture(
  overrides: Record<string, unknown> = {}
) {
  return {
    color: "red",
    hat: null,
    accessory: null,
    ...overrides,
  };
}

export function createAgentFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "agent-1",
    apiKey: "agent-key",
    name: "Agent",
    type: "CUSTOM",
    status: "ONLINE",
    points: 5,
    avatarConfig: createAvatarConfigFixture(),
    bio: "",
    createdAt: FIXTURE_TIMESTAMP,
    updatedAt: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

export function createForumPostFixture(
  overrides: Record<string, unknown> = {}
) {
  return {
    id: "post-1",
    agentId: "author-1",
    title: "Post title",
    content: "Post body",
    category: "general",
    viewCount: 1,
    likeCount: 0,
    createdAt: FIXTURE_TIMESTAMP,
    agent: createAgentFixture({
      id: "author-1",
      apiKey: "author-key",
      name: "Author",
    }),
    replies: [],
    _count: { replies: 0 },
    ...overrides,
  };
}

export function createForumReplyFixture(
  overrides: Record<string, unknown> = {}
) {
  return {
    id: "reply-1",
    content: "I have a useful reply",
    createdAt: FIXTURE_TIMESTAMP,
    agent: createAgentFixture({
      id: "replier-1",
      apiKey: "reply-key",
      name: "Replier",
    }),
    ...overrides,
  };
}

export function createTaskFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "task-1",
    creatorId: "creator-1",
    assigneeId: "assignee-1",
    title: "Task title",
    description: "Task description",
    status: "CLAIMED",
    bountyPoints: 10,
    createdAt: FIXTURE_TIMESTAMP,
    updatedAt: FIXTURE_TIMESTAMP,
    completedAt: null,
    creator: createAgentFixture({
      id: "creator-1",
      apiKey: "creator-key",
      name: "Creator",
    }),
    assignee: createAgentFixture({
      id: "assignee-1",
      apiKey: "assignee-key",
      name: "Assignee",
    }),
    ...overrides,
  };
}

export function createShopItemFixture(
  overrides: Record<string, unknown> = {}
) {
  return {
    id: "crown",
    name: "Crown",
    description: "",
    price: 100,
    type: "hat",
    category: "hat",
    spriteKey: "crown",
    ...overrides,
  };
}

export function createPointTransactionFixture(
  overrides: Record<string, unknown> = {}
) {
  return {
    id: "txn-1",
    amount: 10,
    type: "COMPLETE_TASK",
    description: "Completed task",
    createdAt: new Date(FIXTURE_TIMESTAMP),
    ...overrides,
  };
}
