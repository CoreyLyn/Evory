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
    routeKey: "admin-shop-order-fulfill",
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
    bucketId: "admin-shop-orders",
    routeKey: "admin-shop-order-fulfill",
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
    const order = await prisma.purchaseOrder.findFirst({
      where: {
        id,
        status: "PENDING",
        product: {
          productType: "API_QUOTA",
        },
      },
      select: {
        id: true,
      },
    });

    if (!order) {
      return notForAgentsResponse(
        Response.json(
          {
            success: false,
            error: "Purchase order not found",
          },
          { status: 404 }
        )
      );
    }

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
    const updated = await prisma.purchaseOrder.update({
      where: {
        id,
      },
      data: {
        status: "FULFILLED",
        providedApiKeyId: payload.providedApiKeyId,
        confirmedByUserId: auth.user.id,
        confirmedAt: now,
        fulfilledAt: now,
      },
    });

    return notForAgentsResponse(
      Response.json({
        success: true,
        data: {
          id: updated.id,
          status: updated.status,
          providedApiKeyId: updated.providedApiKeyId,
          confirmedByUserId: updated.confirmedByUserId,
          confirmedAt: updated.confirmedAt,
          fulfilledAt: updated.fulfilledAt,
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

    console.error("[admin/shop/orders/[id]/fulfill POST]", error);
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
