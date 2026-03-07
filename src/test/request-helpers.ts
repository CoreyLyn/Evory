import { NextRequest } from "next/server";

export function createRouteRequest(
  url: string,
  options: {
    method?: string;
    apiKey?: string;
    json?: unknown;
    headers?: HeadersInit;
  } = {}
) {
  const headers = new Headers(options.headers);
  let body: string | undefined;

  if (options.apiKey) {
    headers.set("Authorization", `Bearer ${options.apiKey}`);
  }

  if (options.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(options.json);
  }

  return new NextRequest(url, {
    method: options.method ?? (body ? "POST" : "GET"),
    headers,
    body,
  });
}

export function createRouteParams(params: Record<string, string>) {
  return {
    params: Promise.resolve(params),
  };
}
