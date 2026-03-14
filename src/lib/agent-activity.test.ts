import assert from "node:assert/strict";
import test from "node:test";

import {
  ACTIVITY_CATEGORIES,
  CATEGORY_ACTIVITY_TYPES,
  CATEGORY_SECURITY_TYPES,
  normalizeAgentActivityRecord,
  normalizeSecurityEventToActivity,
  mergeActivities,
  buildCompositeCursor,
  parseCompositeCursor,
} from "./agent-activity";
import type { NormalizedSecurityEventRecord } from "./security-events";

test("ACTIVITY_CATEGORIES maps categories to correct sources", () => {
  assert.equal(ACTIVITY_CATEGORIES.all.source, "both");
  assert.equal(ACTIVITY_CATEGORIES.security.source, "security_event");
  assert.equal(ACTIVITY_CATEGORIES.forum.source, "agent_activity");
  assert.equal(ACTIVITY_CATEGORIES.task.source, "agent_activity");
  assert.equal(ACTIVITY_CATEGORIES.point.source, "agent_activity");
  assert.equal(ACTIVITY_CATEGORIES.credential.source, "agent_activity");
  assert.equal(ACTIVITY_CATEGORIES.checkin.source, "agent_activity");
  assert.equal(ACTIVITY_CATEGORIES.knowledge.source, "agent_activity");
  assert.equal(ACTIVITY_CATEGORIES.status.source, "agent_activity");
});

test("CATEGORY_ACTIVITY_TYPES maps forum to correct activity types", () => {
  assert.deepEqual(CATEGORY_ACTIVITY_TYPES.forum, [
    "FORUM_POST_CREATED",
    "FORUM_REPLY_CREATED",
    "FORUM_LIKE_CREATED",
  ]);
});

test("CATEGORY_SECURITY_TYPES includes all 7 security event types", () => {
  const types = CATEGORY_SECURITY_TYPES.security;
  assert.equal(types.length, 7);
  assert.ok(types.includes("RATE_LIMIT_HIT"));
  assert.ok(types.includes("AUTH_FAILURE"));
  assert.ok(types.includes("CSRF_REJECTED"));
  assert.ok(types.includes("INVALID_AGENT_CREDENTIAL"));
  assert.ok(types.includes("AGENT_ABUSE_LIMIT_HIT"));
  assert.ok(types.includes("CONTENT_HIDDEN"));
  assert.ok(types.includes("CONTENT_RESTORED"));
});

test("normalizeAgentActivityRecord produces correct UnifiedActivityItem", () => {
  const record = {
    id: "act_001",
    agentId: "agent_abc",
    type: "FORUM_POST_CREATED",
    summary: "activity.forum.postCreated",
    metadata: { postId: "post_123", postTitle: "Hello" },
    createdAt: new Date("2026-03-14T10:00:00.000Z"),
  };

  const result = normalizeAgentActivityRecord(record, "TestBot");

  assert.equal(result.id, "act_001");
  assert.equal(result.source, "agent_activity");
  assert.equal(result.category, "forum");
  assert.equal(result.type, "FORUM_POST_CREATED");
  assert.equal(result.agentId, "agent_abc");
  assert.equal(result.agentName, "TestBot");
  assert.equal(result.summary, "activity.forum.postCreated");
  assert.equal(result.createdAt, "2026-03-14T10:00:00.000Z");
  assert.deepEqual(result.metadata, { postId: "post_123", postTitle: "Hello" });
});

test("normalizeSecurityEventToActivity produces correct UnifiedActivityItem", () => {
  const event: NormalizedSecurityEventRecord = {
    id: "sec_001",
    type: "AUTH_FAILURE",
    routeKey: "auth-login",
    agentId: "agent_xyz",
    agentName: "BadBot",
    ipAddress: "1.2.3.4",
    metadata: { reason: "invalid password" },
    scope: "user",
    severity: "warning",
    operation: "auth_failure",
    summary: "Authentication attempt failed.",
    retryAfterSeconds: null,
    createdAt: "2026-03-14T09:00:00.000Z",
  };

  const result = normalizeSecurityEventToActivity(event);

  assert.equal(result.id, "sec_001");
  assert.equal(result.source, "security_event");
  assert.equal(result.category, "security");
  assert.equal(result.type, "AUTH_FAILURE");
  assert.equal(result.agentId, "agent_xyz");
  assert.equal(result.agentName, "BadBot");
  assert.equal(result.summary, "Authentication attempt failed.");
  assert.equal(result.createdAt, "2026-03-14T09:00:00.000Z");
  assert.deepEqual(result.metadata, { reason: "invalid password" });
});

test("mergeActivities sorts by createdAt DESC then id DESC", () => {
  const items = [
    {
      id: "a",
      source: "agent_activity" as const,
      category: "forum" as const,
      type: "FORUM_POST_CREATED",
      agentId: "agent1",
      agentName: "Bot1",
      summary: "Post created",
      metadata: {},
      createdAt: "2026-03-14T08:00:00.000Z",
    },
    {
      id: "c",
      source: "security_event" as const,
      category: "security" as const,
      type: "AUTH_FAILURE",
      agentId: null,
      agentName: null,
      summary: "Auth failed",
      metadata: {},
      createdAt: "2026-03-14T10:00:00.000Z",
    },
    {
      id: "b",
      source: "agent_activity" as const,
      category: "task" as const,
      type: "TASK_CLAIMED",
      agentId: "agent2",
      agentName: "Bot2",
      summary: "Task claimed",
      metadata: {},
      createdAt: "2026-03-14T10:00:00.000Z",
    },
  ];

  const merged = mergeActivities(items, 10);

  // Same createdAt: id "c" > "b", so "c" comes first
  assert.equal(merged[0].id, "c");
  assert.equal(merged[1].id, "b");
  assert.equal(merged[2].id, "a");
});

test("mergeActivities truncates to limit", () => {
  const items = [
    {
      id: "1",
      source: "agent_activity" as const,
      category: "forum" as const,
      type: "FORUM_POST_CREATED",
      agentId: "a",
      agentName: null,
      summary: "s1",
      metadata: {},
      createdAt: "2026-03-14T01:00:00.000Z",
    },
    {
      id: "2",
      source: "agent_activity" as const,
      category: "forum" as const,
      type: "FORUM_REPLY_CREATED",
      agentId: "a",
      agentName: null,
      summary: "s2",
      metadata: {},
      createdAt: "2026-03-14T02:00:00.000Z",
    },
    {
      id: "3",
      source: "agent_activity" as const,
      category: "task" as const,
      type: "TASK_CLAIMED",
      agentId: "a",
      agentName: null,
      summary: "s3",
      metadata: {},
      createdAt: "2026-03-14T03:00:00.000Z",
    },
  ];

  const merged = mergeActivities(items, 2);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].id, "3");
  assert.equal(merged[1].id, "2");
});

test("buildCompositeCursor and parseCompositeCursor round-trip", () => {
  const createdAt = "2026-03-14T08:30:00.000Z";
  const id = "clxyz123abc";

  const cursor = buildCompositeCursor(createdAt, id);
  assert.equal(cursor, `${createdAt}:${id}`);

  const parsed = parseCompositeCursor(cursor);
  assert.ok(parsed !== null);
  assert.equal(parsed.createdAt, createdAt);
  assert.equal(parsed.id, id);
});

test("parseCompositeCursor returns null for invalid input", () => {
  assert.equal(parseCompositeCursor(""), null);
  assert.equal(parseCompositeCursor("no-colon-here"), null);
  assert.equal(parseCompositeCursor("not-a-date:someid"), null);
  assert.equal(parseCompositeCursor(":onlyid"), null);
});
