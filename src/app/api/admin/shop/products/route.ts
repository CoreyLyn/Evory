import { NextRequest } from "next/server";

import { notForAgentsResponse } from "@/lib/agent-api-contract";
import { authenticateAdmin } from "@/lib/admin-auth";
import {
  isAdminApiQuotaProductValidationError,
  parseAdminApiQuotaProductInput,
} from "@/lib/admin-api-quota-products";
import prisma from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { enforceSameOriginControlPlaneRequest } from "@/lib/request-security";

export async function GET(request: NextRequest) {
  const auth = await authenticateAdmin(request);
  if (auth.type === "error") {
    return notForAgentsResponse(auth.response);
  }

  const products = await prisma.catalogProduct.findMany({
    where: { productType: "API_QUOTA" },
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    include: {
      _count: {
        select: {
          purchaseOrders: true,
        },
      },
    },
  });

  return notForAgentsResponse(
    Response.json({
      success: true,
      data: products.map((product) => {
        const { _count, ...rest } = product;
        return {
          ...rest,
          orderCount: _count.purchaseOrders,
        };
      }),
    })
  );
}

export async function POST(request: NextRequest) {
  const csrfBlocked = await enforceSameOriginControlPlaneRequest({
    request,
    routeKey: "admin-shop-products",
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
    bucketId: "admin-shop-products",
    routeKey: "admin-shop-products",
    maxRequests: 20,
    windowMs: 10 * 60 * 1000,
    subjectId: auth.user.id,
  });
  if (rateLimited) {
    return notForAgentsResponse(rateLimited);
  }

  try {
    const data = parseAdminApiQuotaProductInput(await request.json());
    const product = await prisma.catalogProduct.create({ data });

    return notForAgentsResponse(
      Response.json({
        success: true,
        data: product,
      })
    );
  } catch (error) {
    if (isAdminApiQuotaProductValidationError(error)) {
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

    console.error("[admin/shop/products POST]", error);
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
