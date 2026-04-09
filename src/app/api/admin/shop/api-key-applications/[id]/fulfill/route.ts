import { NextRequest } from "next/server";

import { notForAgentsResponse } from "@/lib/agent-api-contract";
import { authenticateAdmin } from "@/lib/admin-auth";
import prisma from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { enforceSameOriginControlPlaneRequest } from "@/lib/request-security";

function readFulfillRequestBody(body: unknown) {
  const payload =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as { providedApiKeyId?: unknown })
      : {};

  if (typeof payload.providedApiKeyId !== "string" || !payload.providedApiKeyId.trim()) {
    throw new Error("providedApiKeyId is required");
  }

  return {
    providedApiKeyId: payload.providedApiKeyId.trim(),
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfBlocked = await enforceSameOriginControlPlaneRequest({
    request,
    routeKey: "admin-shop-api-key-application-fulfill",
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
    bucketId: "admin-shop-api-key-applications",
    routeKey: "admin-shop-api-key-application-fulfill",
    maxRequests: 20,
    windowMs: 10 * 60 * 1000,
    subjectId: auth.user.id,
  });
  if (rateLimited) {
    return notForAgentsResponse(rateLimited);
  }

  const { id } = await params;

  try {
    const payload = readFulfillRequestBody(await request.json());
    const key = await prisma.providedApiKey.findFirst({
      where: {
        id: payload.providedApiKeyId,
        isActive: true,
      },
      select: {
        id: true,
      },
    });

    if (!key) {
      return notForAgentsResponse(
        Response.json(
          {
            success: false,
            error: "Provided API key not found",
          },
          { status: 404 }
        )
      );
    }

    const now = new Date();
    const updated = await prisma.userProvidedApiKeyApplication.updateMany({
      where: {
        id,
        status: "PENDING",
      },
      data: {
        status: "FULFILLED",
        providedApiKeyId: payload.providedApiKeyId,
        fulfilledByUserId: auth.user.id,
        fulfilledAt: now,
      },
    });

    if (updated.count === 0) {
      return notForAgentsResponse(
        Response.json(
          {
            success: false,
            error: "API key application not found",
          },
          { status: 404 }
        )
      );
    }

    return notForAgentsResponse(
      Response.json({
        success: true,
        data: {
          id,
          status: "FULFILLED",
          providedApiKeyId: payload.providedApiKeyId,
          fulfilledByUserId: auth.user.id,
          fulfilledAt: now,
        },
      })
    );
  } catch (error) {
    if (error instanceof SyntaxError) {
      return notForAgentsResponse(
        Response.json(
          {
            success: false,
            error: "Invalid request body",
          },
          { status: 400 }
        )
      );
    }

    if (error instanceof Error && error.message === "providedApiKeyId is required") {
      return notForAgentsResponse(
        Response.json(
          {
            success: false,
            error: error.message,
          },
          { status: 400 }
        )
      );
    }

    console.error("[admin/shop/api-key-applications/[id]/fulfill POST]", error);
    return notForAgentsResponse(
      Response.json(
        {
          success: false,
          error: "Internal server error",
        },
        { status: 500 }
      )
    );
  }
}
