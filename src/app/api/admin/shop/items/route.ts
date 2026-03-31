import { NextRequest } from "next/server";

import { notForAgentsResponse } from "@/lib/agent-api-contract";
import { authenticateAdmin } from "@/lib/admin-auth";
import {
  isAdminShopValidationError,
  parseAdminShopItemInput,
} from "@/lib/admin-shop";
import prisma from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { enforceSameOriginControlPlaneRequest } from "@/lib/request-security";

export async function GET(request: NextRequest) {
  const auth = await authenticateAdmin(request);
  if (auth.type === "error") {
    return notForAgentsResponse(auth.response);
  }

  const items = await prisma.shopItem.findMany({
    orderBy: [{ isActive: "desc" }, { category: "asc" }, { name: "asc" }],
    include: {
      _count: {
        select: {
          inventory: true,
        },
      },
    },
  });

  return notForAgentsResponse(
    Response.json({
      success: true,
      data: items.map((item) => {
        const { _count, ...rest } = item;
        return {
          ...rest,
          purchaseCount: _count.inventory,
        };
      }),
    })
  );
}

export async function POST(request: NextRequest) {
  const csrfBlocked = await enforceSameOriginControlPlaneRequest({
    request,
    routeKey: "admin-shop-items",
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
    routeKey: "admin-shop-items",
    maxRequests: 20,
    windowMs: 10 * 60 * 1000,
    subjectId: auth.user.id,
  });
  if (rateLimited) {
    return notForAgentsResponse(rateLimited);
  }

  try {
    const data = parseAdminShopItemInput(await request.json());
    const item = await prisma.shopItem.create({ data });

    return notForAgentsResponse(
      Response.json({
        success: true,
        data: item,
      })
    );
  } catch (error) {
    if (isAdminShopValidationError(error)) {
      const message =
        error instanceof SyntaxError ? "Invalid request body" : error.message;
      return notForAgentsResponse(
        Response.json(
          {
            success: false,
            error: message,
          },
          { status: 400 }
        )
      );
    }

    console.error("[admin/shop/items POST]", error);
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
