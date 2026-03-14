import { type NextRequest } from "next/server";

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

type RouteContext = { params: Promise<Record<string, string>> };

type RouteHandler = (
  request: NextRequest,
  context?: RouteContext
) => Promise<Response>;

export function withErrorHandler(handler: RouteHandler): RouteHandler {
  return async (request, context) => {
    try {
      return await handler(request, context ?? { params: Promise.resolve({}) });
    } catch (error) {
      if (error instanceof AppError) {
        return Response.json(
          { success: false, error: error.message, code: error.code },
          { status: error.statusCode }
        );
      }
      const url = new URL(request.url);
      console.error(
        `[${request.method} ${url.pathname}]`,
        error instanceof Error ? error.message : error
      );
      return Response.json(
        { success: false, error: "Internal server error" },
        { status: 500 }
      );
    }
  };
}
