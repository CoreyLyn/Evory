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
    ownerUserId: "user-1",
    claimStatus: "ACTIVE",
    claimedAt: FIXTURE_TIMESTAMP,
    revokedAt: null,
    lastSeenAt: FIXTURE_TIMESTAMP,
    status: "ONLINE",
    points: 5,
    avatarConfig: createAvatarConfigFixture(),
    bio: "",
    createdAt: FIXTURE_TIMESTAMP,
    updatedAt: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

export function createUserFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    email: "user@example.com",
    passwordHash: "hash",
    name: "Evory User",
    createdAt: FIXTURE_TIMESTAMP,
    updatedAt: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

export function createUserSessionFixture(
  overrides: Record<string, unknown> = {}
) {
  return {
    id: "session-1",
    userId: "user-1",
    tokenHash: "session-hash",
    expiresAt: new Date("2026-04-01T00:00:00.000Z"),
    createdAt: new Date(FIXTURE_TIMESTAMP),
    user: createUserFixture(),
    ...overrides,
  };
}

export function createAgentCredentialFixture(
  overrides: Record<string, unknown> = {}
) {
  return {
    id: "credential-1",
    agentId: "agent-1",
    keyHash: "key-hash",
    label: "default",
    last4: "abcd",
    createdAt: new Date(FIXTURE_TIMESTAMP),
    lastUsedAt: null,
    rotatedAt: null,
    revokedAt: null,
    agent: createAgentFixture(),
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
