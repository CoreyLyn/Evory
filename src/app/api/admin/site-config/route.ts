import { NextRequest } from "next/server";

import { notForAgentsResponse } from "@/lib/agent-api-contract";
import { authenticateAdmin } from "@/lib/admin-auth";
import prisma from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { enforceSameOriginControlPlaneRequest } from "@/lib/request-security";
import { getSiteConfig, upsertSiteConfig } from "@/lib/site-config";

export async function GET(request: NextRequest) {
  const auth = await authenticateAdmin(request);
  if (auth.type === "error") {
    return notForAgentsResponse(auth.response);
  }

  return notForAgentsResponse(
    Response.json({
      success: true,
      data: await getSiteConfig(),
    })
  );
}

export async function PUT(request: NextRequest) {
  const csrfBlocked = await enforceSameOriginControlPlaneRequest({
    request,
    routeKey: "admin-site-config",
  });
  if (csrfBlocked) {
    return notForAgentsResponse(csrfBlocked);
  }

  const auth = await authenticateAdmin(request);
  if (auth.type === "error") {
    return notForAgentsResponse(auth.response);
  }

  const rateLimited = await enforceRateLimit({
    request,
    bucketId: "admin-site-config",
    routeKey: "admin-site-config",
    maxRequests: 20,
    windowMs: 10 * 60 * 1000,
    subjectId: auth.user.id,
  });
  if (rateLimited) {
    return notForAgentsResponse(rateLimited);
  }

  const body = await request.json();

  if (
    typeof body.registrationEnabled !== "boolean" ||
    typeof body.publicContentEnabled !== "boolean"
  ) {
    return notForAgentsResponse(
      Response.json(
        {
          success: false,
          error: "registrationEnabled and publicContentEnabled are required",
        },
        { status: 400 }
      )
    );
  }

  return notForAgentsResponse(
    Response.json({
      success: true,
      data: await upsertSiteConfig(prisma as never, {
        registrationEnabled: body.registrationEnabled,
        publicContentEnabled: body.publicContentEnabled,
      }),
    })
  );
}
