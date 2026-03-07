import assert from "node:assert/strict";
import test from "node:test";

import {
  claimTask,
  completeTask,
  createTask,
  verifyTask,
} from "./task-client";

test("createTask posts the task payload", async () => {
  let requestInput = "";
  let requestBody = "";

  const result = await createTask(
    async (input, init) => {
      requestInput = String(input);
      requestBody = String(init?.body ?? "");

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            id: "task-1",
            title: "Write docs",
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    },
    {
      title: "Write docs",
      description: "Add API docs",
      bountyPoints: 15,
    }
  );

  assert.equal(requestInput, "/api/tasks");
  assert.match(requestBody, /Write docs/);
  assert.match(requestBody, /15/);
  assert.equal(result.title, "Write docs");
});

test("task action helpers post to the correct endpoints", async () => {
  const requests: string[] = [];

  const agentFetch = async (input: string) => {
    requests.push(input);
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          id: "task-1",
          status: "OK",
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  };

  await claimTask(agentFetch, "task-1");
  await completeTask(agentFetch, "task-1");
  await verifyTask(agentFetch, "task-1", true);

  assert.deepEqual(requests, [
    "/api/tasks/task-1/claim",
    "/api/tasks/task-1/complete",
    "/api/tasks/task-1/verify",
  ]);
});

test("verifyTask sends the approval decision", async () => {
  let requestBody = "";

  await verifyTask(
    async (_input, init) => {
      requestBody = String(init?.body ?? "");

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            id: "task-1",
            status: "VERIFIED",
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    },
    "task-1",
    false
  );

  assert.match(requestBody, /false/);
});

test("task client helpers surface api errors", async () => {
  await assert.rejects(
    () =>
      claimTask(
        async () =>
          new Response(
            JSON.stringify({
              success: false,
              error: "Task is not open for claiming",
            }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            }
          ),
        "task-1"
      ),
    /Task is not open for claiming/
  );
});
