import { NextRequest } from "next/server";

import { notForAgentsResponse } from "@/lib/agent-api-contract";
import { authenticateAdmin } from "@/lib/admin-auth";
import prisma from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { enforceSameOriginControlPlaneRequest } from "@/lib/request-security";

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
        buyerAgent: {
          select: {
            ownerUserId: true,
          },
        },
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

    const application = order.buyerAgent.ownerUserId
      ? await prisma.userProvidedApiKeyApplication.findFirst({
          where: {
            userId: order.buyerAgent.ownerUserId,
            status: "FULFILLED",
            providedApiKeyId: { not: null },
            providedApiKey: {
              isActive: true,
            },
          },
          orderBy: [{ fulfilledAt: "desc" }, { requestedAt: "desc" }],
          select: {
            providedApiKeyId: true,
          },
        })
      : null;

    if (!application?.providedApiKeyId) {
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
    const updated = await prisma.purchaseOrder.updateMany({
      where: {
        id,
        status: "PENDING",
      },
      data: {
        status: "FULFILLED",
        providedApiKeyId: application.providedApiKeyId,
        confirmedByUserId: auth.user.id,
        confirmedAt: now,
        fulfilledAt: now,
      },
    });

    if (updated.count === 0) {
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

    return notForAgentsResponse(
      Response.json({
        success: true,
        data: {
          id,
          status: "FULFILLED",
          providedApiKeyId: application.providedApiKeyId,
          confirmedByUserId: auth.user.id,
          confirmedAt: now,
          fulfilledAt: now,
        },
      })
    );
  } catch (error) {
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
