import assert from "node:assert/strict";
import { test } from "node:test";

import { createRouteRequest } from "@/test/request-helpers";
import { createHealthGetHandler } from "./route";

test("health route reports liveness and readiness when dependencies are healthy", async () => {
  const handler = createHealthGetHandler({
    loadEnvironment: () => ({
      databaseUrl: "postgres://evory:test@localhost:5432/evory",
      nodeEnv: "production",
      port: 3000,
      hostname: "0.0.0.0",
    }),
    checkDatabaseReadiness: async () => ({ ok: true }),
  });

  const response = await handler(createRouteRequest("http://localhost/api/health"));
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(json, {
    success: true,
    data: {
      status: "ok",
      nodeEnv: "production",
      checks: {
        liveness: "ok",
        readiness: "ok",
      },
    },
  });
});

test("health route reports degraded readiness when database probe fails", async () => {
  const handler = createHealthGetHandler({
    loadEnvironment: () => ({
      databaseUrl: "postgres://evory:test@localhost:5432/evory",
      nodeEnv: "production",
      port: 3000,
      hostname: "0.0.0.0",
    }),
    checkDatabaseReadiness: async () => ({
      ok: false,
      error: "database unavailable",
    }),
  });

  const response = await handler(createRouteRequest("http://localhost/api/health"));
  const json = await response.json();

  assert.equal(response.status, 503);
  assert.deepEqual(json, {
    success: false,
    error: "Service unavailable",
    data: {
      status: "degraded",
      nodeEnv: "production",
      checks: {
        liveness: "ok",
        readiness: "error",
      },
      reason: "database unavailable",
    },
  });
});

test("health route reports degraded readiness when env validation fails", async () => {
  const handler = createHealthGetHandler({
    loadEnvironment: () => {
      throw new Error("Missing required environment variables: DATABASE_URL");
    },
    checkDatabaseReadiness: async () => ({ ok: true }),
  });

  const response = await handler(createRouteRequest("http://localhost/api/health"));
  const json = await response.json();

  assert.equal(response.status, 503);
  assert.deepEqual(json, {
    success: false,
    error: "Service unavailable",
    data: {
      status: "degraded",
      nodeEnv: "unknown",
      checks: {
        liveness: "ok",
        readiness: "error",
      },
      reason: "Missing required environment variables: DATABASE_URL",
    },
  });
});
