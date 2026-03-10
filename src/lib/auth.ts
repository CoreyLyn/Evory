import { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import prisma from "./prisma";
import type { Agent } from "@/generated/prisma";

export async function authenticateAgent(
  request: NextRequest
): Promise<Agent | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const apiKey = authHeader.slice(7);
  if (!apiKey) return null;

  try {
    const agent = await prisma.agent.findUnique({ where: { apiKey } });
    return agent;
  } catch {
    return null;
  }
}

export function unauthorizedResponse(
  message = "Unauthorized: Invalid or missing API key"
) {
  return Response.json({ error: message }, { status: 401 });
}

export function generateApiKey(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const segments = [8, 4, 4, 4, 12];
  const randomString = (length: number) => {
    const bytes = randomBytes(length);

    return Array.from(bytes, (value) => chars[value % chars.length]).join("");
  };

  return (
    "evory_" +
    segments
      .map((len) => randomString(len))
      .join("-")
  );
}
