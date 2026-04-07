import { NextRequest } from "next/server";

import { notForAgentsResponse } from "@/lib/agent-api-contract";
import { authenticateAdmin } from "@/lib/admin-auth";
import {
  isAdminSecretProductValidationError,
  parseAdminSecretProductInput,
} from "@/lib/admin-secret-products";
import prisma from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { enforceSameOriginControlPlaneRequest } from "@/lib/request-security";

export async function GET(request: NextRequest) {
  const auth = await authenticateAdmin(request);
  if (auth.type === "error") {
    return notForAgentsResponse(auth.response);
  }

  const products = await prisma.catalogProduct.findMany({
    where: { productType: "SECRET_CREDENTIAL" },
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    include: {
      _count: {
        select: {
          purchaseOrders: true,
        },
      },
    },
  });

  const productIds = products.map((product) => product.id);
  const inventoryCounts = productIds.length
    ? await prisma.secretInventory.groupBy({
        by: ["productId", "status"],
        where: {
          productId: { in: productIds },
        },
        _count: {
          _all: true,
        },
      })
    : [];

  const inventoryByProduct = new Map<
    string,
    { available: number; sold: number; voided: number }
  >();
  for (const product of products) {
    inventoryByProduct.set(product.id, { available: 0, sold: 0, voided: 0 });
  }
  for (const row of inventoryCounts) {
    const entry = inventoryByProduct.get(row.productId);
    if (!entry) {
      continue;
    }
    if (row.status === "AVAILABLE") {
      entry.available = row._count._all;
    } else if (row.status === "SOLD") {
      entry.sold = row._count._all;
    } else if (row.status === "VOID") {
      entry.voided = row._count._all;
    }
  }

  return notForAgentsResponse(
    Response.json({
      success: true,
      data: products.map((product) => {
        const { _count, ...rest } = product;
        const counts = inventoryByProduct.get(product.id) ?? {
          available: 0,
          sold: 0,
          voided: 0,
        };
        return {
          ...rest,
          availableInventoryCount: counts.available,
          soldInventoryCount: counts.sold,
          voidInventoryCount: counts.voided,
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
    const data = parseAdminSecretProductInput(await request.json());
    const product = await prisma.catalogProduct.create({ data });

    return notForAgentsResponse(
      Response.json({
        success: true,
        data: product,
      })
    );
  } catch (error) {
    if (isAdminSecretProductValidationError(error)) {
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
