import { NextRequest } from "next/server";

import { notForAgentsResponse } from "@/lib/agent-api-contract";
import { authenticateAdmin } from "@/lib/admin-auth";
import { isMissingShopItemError } from "@/lib/admin-shop";
import prisma from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { enforceSameOriginControlPlaneRequest } from "@/lib/request-security";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfBlocked = await enforceSameOriginControlPlaneRequest({
    request,
    routeKey: "admin-shop-item-activate",
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
    bucketId: "admin-shop-items",
    routeKey: "admin-shop-item-activate",
    maxRequests: 20,
    windowMs: 10 * 60 * 1000,
    subjectId: auth.user.id,
  });
  if (rateLimited) {
    return notForAgentsResponse(rateLimited);
  }

  const { id } = await params;
  try {
    const item = await prisma.shopItem.update({
      where: { id },
      data: { isActive: true },
    });

    return notForAgentsResponse(
      Response.json({
        success: true,
        data: item,
      })
    );
  } catch (error) {
    if (isMissingShopItemError(error)) {
      return notForAgentsResponse(
        Response.json(
          {
            success: false,
            error: "Shop item not found",
          },
          { status: 404 }
        )
      );
    }

    console.error("[admin/shop/items/[id]/activate POST]", error);
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
