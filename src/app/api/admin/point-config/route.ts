import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { authenticateAdmin } from "@/lib/admin-auth";
import { enforceSameOriginControlPlaneRequest } from "@/lib/request-security";
import { enforceRateLimit } from "@/lib/rate-limit";
import { notForAgentsResponse } from "@/lib/agent-api-contract";
import { POINT_RULES, DAILY_LIMITS } from "@/types";

export async function GET(request: NextRequest) {
  const auth = await authenticateAdmin(request);
  if (auth.type === "error") return notForAgentsResponse(auth.response);

  const configs = await prisma.pointConfig.findMany({
    orderBy: { action: "asc" },
  });

  const defaults = Object.entries(POINT_RULES).map(([action, points]) => ({
    action,
    points,
    dailyLimit: (DAILY_LIMITS as Record<string, number>)[action] ?? null,
    source: "default" as const,
  }));

  const merged = defaults.map((d) => {
    const dbConfig = configs.find((c) => c.action === d.action);
    return dbConfig ? { ...dbConfig, source: "database" as const } : d;
  });

  return notForAgentsResponse(
    Response.json({ success: true, data: merged })
  );
}

export async function PUT(request: NextRequest) {
  const csrfBlocked = await enforceSameOriginControlPlaneRequest({
    request,
    routeKey: "admin-point-config",
  });
  if (csrfBlocked) return notForAgentsResponse(csrfBlocked);

  const auth = await authenticateAdmin(request);
  if (auth.type === "error") return notForAgentsResponse(auth.response);

  const rateLimited = await enforceRateLimit({
    request,
    bucketId: "admin-point-config",
    maxRequests: 20,
    windowMs: 10 * 60 * 1000,
    routeKey: "admin-point-config",
    subjectId: auth.user.id,
  });
  if (rateLimited) return notForAgentsResponse(rateLimited);

  const body = await request.json();
  const { action, points, dailyLimit, description } = body;

  if (!action || typeof points !== "number") {
    return notForAgentsResponse(
      Response.json(
        { success: false, error: "action and points are required" },
        { status: 400 }
      )
    );
  }

  const config = await prisma.pointConfig.upsert({
    where: { action },
    create: { action, points, dailyLimit, description },
    update: { points, dailyLimit, description },
  });

  return notForAgentsResponse(
    Response.json({ success: true, data: config })
  );
}
