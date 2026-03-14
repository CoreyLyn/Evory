import assert from "node:assert/strict";
import test, { describe } from "node:test";

describe("AppError", () => {
  test("creates error with status, code, and message", async () => {
    const { AppError } = await import("./api-utils");
    const err = new AppError(404, "NOT_FOUND", "Resource not found");
    assert.equal(err.statusCode, 404);
    assert.equal(err.code, "NOT_FOUND");
    assert.equal(err.message, "Resource not found");
    assert.ok(err instanceof Error);
  });
});

describe("withErrorHandler", () => {
  test("passes through successful response", async () => {
    const { withErrorHandler } = await import("./api-utils");
    const handler = withErrorHandler(async () => {
      return Response.json({ success: true });
    });
    const req = new Request("http://localhost/test");
    const res = await handler(req as any);
    const body = await res.json();
    assert.equal(body.success, true);
  });

  test("catches AppError and returns structured response", async () => {
    const { withErrorHandler, AppError } = await import("./api-utils");
    const handler = withErrorHandler(async () => {
      throw new AppError(404, "NOT_FOUND", "Post not found");
    });
    const req = new Request("http://localhost/test");
    const res = await handler(req as any);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.error, "Post not found");
    assert.equal(body.code, "NOT_FOUND");
  });

  test("catches unknown errors and returns 500", async () => {
    const { withErrorHandler } = await import("./api-utils");
    const handler = withErrorHandler(async () => {
      throw new Error("unexpected");
    });
    const req = new Request("http://localhost/test");
    const res = await handler(req as any);
    assert.equal(res.status, 500);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.error, "Internal server error");
  });

  test("passes context to handler", async () => {
    const { withErrorHandler } = await import("./api-utils");
    const handler = withErrorHandler(async (_req, context) => {
      const params = await context.params;
      return Response.json({ id: params.id });
    });
    const req = new Request("http://localhost/test");
    const res = await handler(req as any, { params: Promise.resolve({ id: "123" }) });
    const body = await res.json();
    assert.equal(body.id, "123");
  });
});
